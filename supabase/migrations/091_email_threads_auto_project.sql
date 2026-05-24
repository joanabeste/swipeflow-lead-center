-- 091: Auto-Projekt-Zuordnung für E-Mail-Threads.
-- auto_project_id ist die Claude-Empfehlung. Promoted zu project_id wenn
-- auto_project_score >= 0.8 und project_id IS NULL. auto_project_rejected
-- verhindert erneutes Vorschlagen nach einem manuellen Verwerfen.

alter table public.email_threads
  add column if not exists auto_project_id      uuid references public.projects(id) on delete set null,
  add column if not exists auto_project_score   real,
  add column if not exists auto_project_reason  text,
  add column if not exists topic_cluster_key    text,
  add column if not exists auto_project_rejected boolean not null default false;

create index if not exists email_threads_topic_cluster_idx
  on public.email_threads(topic_cluster_key);

create index if not exists email_threads_auto_project_idx
  on public.email_threads(auto_project_id);
