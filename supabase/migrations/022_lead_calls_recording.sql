-- Aufzeichnungs-Metadata pro Call (Webex Calling API)
alter table lead_calls
  add column if not exists recording_url text,
  add column if not exists recording_id text,
  add column if not exists recording_fetched_at timestamptz,
  add column if not exists recording_fetch_attempted_at timestamptz,
  add column if not exists recording_fetch_error text;

create index if not exists lead_calls_needs_recording_idx
  on lead_calls(ended_at)
  where recording_url is null and ended_at is not null;
