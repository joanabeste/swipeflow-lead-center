-- 092: Lesson-Blocks (V4) — strukturierte Block-Liste statt freier HTML-Editor.
-- learning_lessons.blocks ist ein jsonb-Array von typed Blocks (text/video/image/file/button).
-- learning_lessons.content_html bleibt unveraendert als Legacy-Fallback.

ALTER TABLE public.learning_lessons
  ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb;

-- FTS-Spalte: zusaetzlich Text aus blocks (jsonb::text) indizieren, damit Suche
-- auch neue Bloecke trifft. Re-Erstellen mit DROP+ADD (Generated Columns lassen
-- sich nicht direkt aendern).
ALTER TABLE public.learning_lessons DROP COLUMN IF EXISTS search_tsv;
ALTER TABLE public.learning_lessons
  ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('german', coalesce(title,        '')), 'A') ||
    setweight(to_tsvector('german', coalesce(summary,      '')), 'A') ||
    setweight(to_tsvector('german', coalesce(content_html, '')), 'B') ||
    setweight(to_tsvector('german', coalesce(blocks::text, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS learning_lessons_search_idx
  ON public.learning_lessons USING GIN (search_tsv);
