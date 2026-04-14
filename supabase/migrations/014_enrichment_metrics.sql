-- Enrichment-Metriken: Phasen-Latenz + Token-Counts für Observability
alter table lead_enrichments
  add column if not exists fetch_ms int,
  add column if not exists llm_ms int,
  add column if not exists input_chars int,
  add column if not exists prompt_tokens int,
  add column if not exists completion_tokens int;
