-- 109: Social-Media-Content-Planung & Kundenfreigabe (Fulfillment).
--
-- Das Team legt pro Kunde (leads mit lifecycle_stage='customer') Postings an
-- (mehrere Bilder ODER ein Video, Formate Feed/Carousel/Reel/Story/Video),
-- plant einen Termin und teilt dem Kunden EINEN dauerhaften Freigabelink.
-- Über diesen Link (app/freigabe/[token]) kommentiert der Kunde ohne Login
-- jeden Post oder gibt ihn frei.
--
-- Architektur spiegelt 099_contracts: die öffentliche Route nutzt den
-- Service-Client (umgeht RLS) und filtert strikt nach Token; RLS deckt nur die
-- authentifizierte Admin-UI ab. Direct-Upload + Bucket spiegelt 082.
--
-- v1: nur Planung + Freigabe (kein echtes Auto-Posting). Die Status-Werte
-- 'publishing'/'failed'/'published' und die Spalten external_post_ids/publish_error
-- sind für einen späteren Meta-API-Worker reserviert und in v1 ungenutzt.

-- ─── social_boards: 1:1 zum Kunden, trägt den dauerhaften Freigabelink ──────

CREATE TABLE IF NOT EXISTS public.social_boards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  share_token   text UNIQUE,                       -- NULL bis "Link aktivieren"; base64url(32B)
  share_enabled boolean NOT NULL DEFAULT true,
  client_label  text,                              -- optionaler Anzeigename im Kundenportal
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_boards_token_idx ON public.social_boards(share_token);

-- ─── social_posts ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.social_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id            uuid NOT NULL REFERENCES public.social_boards(id) ON DELETE CASCADE,
  lead_id             uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,  -- denormalisiert für Pfad/Query
  title               text,                                                          -- interner Arbeitstitel
  format              text NOT NULL DEFAULT 'feed_single',
  status              text NOT NULL DEFAULT 'draft',
  platforms           text[] NOT NULL DEFAULT '{}',                                  -- z.B. {'instagram','facebook'}
  caption             text NOT NULL DEFAULT '',                                      -- Default/Master-Caption
  platform_captions   jsonb NOT NULL DEFAULT '{}',                                   -- {"instagram":"...","facebook":"..."} Overrides
  scheduled_at        timestamptz,                                                   -- geplanter Veröffentlichungszeitpunkt
  sort_order          integer NOT NULL DEFAULT 0,                                    -- Reihenfolge in der Status-Spalte
  -- Freigabe-Tracking
  approved_at         timestamptz,
  approved_by_name    text,                                                          -- vom Kunden eingegebener Name
  review_requested_at timestamptz,
  -- Auto-Posting-Vorbereitung (v1 ungenutzt, nullable)
  published_at        timestamptz,
  external_post_ids   jsonb,                                                         -- {"instagram":"178...","facebook":"..."}
  publish_error       text,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT social_posts_format_chk CHECK (format IN
    ('feed_single','carousel','reel','story','video')),
  CONSTRAINT social_posts_status_chk CHECK (status IN
    ('draft','in_review','changes_requested','approved','publishing','published','failed','archived'))
);

CREATE INDEX IF NOT EXISTS social_posts_board_idx     ON public.social_posts(board_id);
CREATE INDEX IF NOT EXISTS social_posts_lead_idx      ON public.social_posts(lead_id);
CREATE INDEX IF NOT EXISTS social_posts_status_idx    ON public.social_posts(status);
CREATE INDEX IF NOT EXISTS social_posts_scheduled_idx ON public.social_posts(scheduled_at);

-- ─── social_post_media: 1:N (Carousel-Bilder oder ein Video) ────────────────

CREATE TABLE IF NOT EXISTS public.social_post_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  lead_id      uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,  -- für Pfad-Check {leadId}/...
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   bigint NOT NULL,
  media_kind   text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,                                   -- Carousel-Reihenfolge
  width        integer,
  height       integer,
  duration_ms  integer,                                                      -- bei Video
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT social_post_media_kind_chk CHECK (media_kind IN ('image','video'))
);

CREATE INDEX IF NOT EXISTS social_post_media_post_idx ON public.social_post_media(post_id, sort_order);

-- ─── social_post_comments: Kunden-Feedback + Team-Antworten + Audit-Events ──

CREATE TABLE IF NOT EXISTS public.social_post_comments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  board_id       uuid NOT NULL REFERENCES public.social_boards(id) ON DELETE CASCADE,
  author_kind    text NOT NULL,                    -- 'client' | 'team'
  author_user_id uuid REFERENCES auth.users(id),   -- NULL bei client (öffentliche Route)
  author_name    text,                             -- vom Kunden eingegebener Name
  body           text NOT NULL DEFAULT '',
  event          text,                             -- NULL=Kommentar; sonst 'approved'|'changes_requested'|'viewed'
  meta           jsonb NOT NULL DEFAULT '{}',      -- {ip, user_agent}
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT social_post_comments_author_chk CHECK (author_kind IN ('client','team'))
);

CREATE INDEX IF NOT EXISTS social_post_comments_post_idx ON public.social_post_comments(post_id, created_at);

-- ─── updated_at-Trigger (boards + posts) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.social_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS social_boards_set_updated_at ON public.social_boards;
CREATE TRIGGER social_boards_set_updated_at
  BEFORE UPDATE ON public.social_boards
  FOR EACH ROW EXECUTE FUNCTION public.social_touch();

DROP TRIGGER IF EXISTS social_posts_set_updated_at ON public.social_posts;
CREATE TRIGGER social_posts_set_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.social_touch();

-- ─── RLS: nur authentifizierte Admin-UI; öffentliche Route nutzt Service-Client ─

ALTER TABLE public.social_boards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_media   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_boards_select ON public.social_boards;
CREATE POLICY social_boards_select ON public.social_boards
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS social_boards_write ON public.social_boards;
CREATE POLICY social_boards_write ON public.social_boards
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS social_posts_select ON public.social_posts;
CREATE POLICY social_posts_select ON public.social_posts
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS social_posts_write ON public.social_posts;
CREATE POLICY social_posts_write ON public.social_posts
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS social_post_media_select ON public.social_post_media;
CREATE POLICY social_post_media_select ON public.social_post_media
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS social_post_media_write ON public.social_post_media;
CREATE POLICY social_post_media_write ON public.social_post_media
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS social_post_comments_select ON public.social_post_comments;
CREATE POLICY social_post_comments_select ON public.social_post_comments
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS social_post_comments_write ON public.social_post_comments;
CREATE POLICY social_post_comments_write ON public.social_post_comments
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ─── Storage-Bucket: privat, signed URLs zur Auslieferung ───────────────────
-- 200 MB pro Datei deckt Reels/kurze Videos. Das Bucket-Limit ist eine harte
-- Supabase-Grenze (greift auch beim Direct-Upload Browser→Bucket).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-media',
  'social-media',
  false,
  209715200,   -- 200 MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'social_media_authenticated_read'
  ) THEN
    CREATE POLICY social_media_authenticated_read
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'social-media');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'social_media_authenticated_write'
  ) THEN
    CREATE POLICY social_media_authenticated_write
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'social-media');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'social_media_authenticated_update'
  ) THEN
    CREATE POLICY social_media_authenticated_update
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'social-media');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'social_media_authenticated_delete'
  ) THEN
    CREATE POLICY social_media_authenticated_delete
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'social-media');
  END IF;
END
$$;
