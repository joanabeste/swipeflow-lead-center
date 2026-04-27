-- KI-generierte Scoring-Vorschlaege fuer webdev_scoring_config / recruiting_scoring_config.
-- Werden vom Cron-Job /api/cron/scoring-review erzeugt und vom Admin im UI bestaetigt.

CREATE TABLE IF NOT EXISTS scoring_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical text NOT NULL CHECK (vertical IN ('webdesign','recruiting')),
  current_config jsonb NOT NULL,
  suggested_config jsonb NOT NULL,
  reasoning text NOT NULL,
  key_observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  positive_sample_count integer NOT NULL,
  negative_sample_count integer NOT NULL,
  llm_model text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS scoring_suggestions_pending_idx
  ON scoring_suggestions (vertical, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS scoring_suggestions_history_idx
  ON scoring_suggestions (vertical, created_at DESC);
