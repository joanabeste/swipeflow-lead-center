-- Transkript- und Provider-Metadaten pro Call.
alter table lead_calls
  add column if not exists transcript_id text,
  add column if not exists transcript_text text,
  add column if not exists transcript_vtt_url text,
  add column if not exists transcript_fetched_at timestamptz,
  add column if not exists transcript_fetch_attempted_at timestamptz,
  add column if not exists transcript_fetch_error text,
  add column if not exists call_provider text;

create index if not exists lead_calls_needs_transcript_idx
  on lead_calls(recording_fetched_at)
  where recording_url is not null and transcript_id is null;
