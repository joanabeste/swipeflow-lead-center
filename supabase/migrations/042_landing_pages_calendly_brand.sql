-- Landing Pages: Calendly-Einbettung + Corporate-Identity-Felder (Farben, Logo).
-- Additiv zu Migration 041 — keine Datenmigration nötig, alles optional.

-- ─── Branchen: Calendly-Default ──────────────────────────────
alter table industries add column if not exists calendly_url text;

-- ─── Leads: CI-Cache ─────────────────────────────────────────
-- Wird beim Erstellen einer Landing-Page befüllt (Brand-Extractor aus der
-- Lead-Website). Einmal gecached, danach pro Lead weiterverwendbar.
alter table leads add column if not exists primary_color text;
alter table leads add column if not exists logo_url text;

-- ─── Landing-Pages: Snapshot der CI-Werte + Calendly ─────────
-- Wie schon greeting/headline/loom_url: Snapshot, damit spätere Änderungen
-- am Lead bereits versendete Links nicht retroaktiv verändern.
alter table landing_pages add column if not exists calendly_url text;
alter table landing_pages add column if not exists primary_color text;
alter table landing_pages add column if not exists logo_url text;
