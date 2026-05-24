-- 088: Learning V2 — typed lessons, summary, editor_notes, module description,
-- course learning_objectives, attachment sort_order. FTS-Spalte erweitert um summary.

-- ─── Lessons: lesson_type + summary + editor_notes ───────────────
ALTER TABLE public.learning_lessons
  ADD COLUMN IF NOT EXISTS lesson_type   text NOT NULL DEFAULT 'mixed'
    CHECK (lesson_type IN ('video','text','file','mixed')),
  ADD COLUMN IF NOT EXISTS summary       text,
  ADD COLUMN IF NOT EXISTS editor_notes  text;

-- Heuristik: bestehende Lessons in Typen einordnen
UPDATE public.learning_lessons SET lesson_type =
  CASE
    WHEN video_url IS NOT NULL AND coalesce(content_html, '') = '' THEN 'video'
    WHEN video_url IS NULL AND content_html IS NOT NULL THEN 'text'
    ELSE 'mixed'
  END
WHERE lesson_type = 'mixed';

-- ─── Modules: description ────────────────────────────────────────
ALTER TABLE public.learning_modules
  ADD COLUMN IF NOT EXISTS description text;

-- ─── Courses: learning_objectives ────────────────────────────────
ALTER TABLE public.learning_courses
  ADD COLUMN IF NOT EXISTS learning_objectives jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ─── Attachments: sort_order ─────────────────────────────────────
ALTER TABLE public.learning_lesson_attachments
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS learning_lesson_attachments_sort_idx
  ON public.learning_lesson_attachments(lesson_id, sort_order);

-- ─── FTS-Spalte um summary erweitern ─────────────────────────────
-- Generated column muss neu angelegt werden; alter Index wird durch DROP COLUMN entsorgt.
ALTER TABLE public.learning_lessons DROP COLUMN IF EXISTS search_tsv;
ALTER TABLE public.learning_lessons
  ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('german', coalesce(title,        '')), 'A') ||
    setweight(to_tsvector('german', coalesce(summary,      '')), 'A') ||
    setweight(to_tsvector('german', coalesce(content_html, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS learning_lessons_search_idx
  ON public.learning_lessons USING GIN (search_tsv);

-- ─── AI-Usage-Log (einfach, fuer Rate-Limit-Auditing) ────────────
CREATE TABLE IF NOT EXISTS public.learning_ai_usage (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature      text NOT NULL, -- 'outline' | 'rewrite' | 'summary'
  prompt_chars integer NOT NULL DEFAULT 0,
  result_chars integer NOT NULL DEFAULT 0,
  model        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_ai_usage_user_idx
  ON public.learning_ai_usage(user_id, created_at DESC);

ALTER TABLE public.learning_ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_ai_usage_select_own ON public.learning_ai_usage;
CREATE POLICY learning_ai_usage_select_own ON public.learning_ai_usage
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Inserts laufen serverseitig via Service-Role.
