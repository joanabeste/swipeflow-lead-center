-- Personalisierte Landing-Pages pro angerufenem Lead.
-- Drei neue Tabellen:
--   * industries       — Branchen (frei erweiterbar, z. B. "recruiting", "it")
--   * case_studies     — pro Branche zuordenbar (NULL = branchenübergreifend)
--   * landing_pages    — eine konkrete versendete Seite mit gerendertem Snapshot
--   * landing_page_views — 1 Zeile pro Seitenaufruf (DSGVO: nur IP-Hash)

-- ─── Branchen ────────────────────────────────────────────────
-- Enthält pro Branche die Default-Templates für die Landing-Page-Generierung.
-- Platzhalter: {{anrede}}, {{contact_name}}, {{contact_first_name}},
-- {{company_name}}, {{sender_name}} (siehe lib/email/templates.ts).
create table if not exists industries (
  id text primary key,
  label text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  greeting_template text not null default '{{anrede}},',
  headline_template text not null default '',
  intro_template text not null default '',
  outro_template text,
  loom_url text,
  created_at timestamptz not null default now()
);

-- Falls Tabelle bereits ohne Template-Spalten existiert: nachrüsten.
alter table industries add column if not exists greeting_template text not null default '{{anrede}},';
alter table industries add column if not exists headline_template text not null default '';
alter table industries add column if not exists intro_template text not null default '';
alter table industries add column if not exists outro_template text;
alter table industries add column if not exists loom_url text;

alter table industries enable row level security;
drop policy if exists "industries_read_all" on industries;
create policy "industries_read_all" on industries
  for select to authenticated using (true);

-- ─── Case Studies ────────────────────────────────────────────
create table if not exists case_studies (
  id uuid primary key default gen_random_uuid(),
  industry_id text references industries(id) on delete set null,
  title text not null,
  subtitle text,
  description text,
  link_url text,
  image_url text,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table case_studies add column if not exists deleted_at timestamptz;

create index if not exists case_studies_industry_idx
  on case_studies(industry_id)
  where is_active and deleted_at is null;

alter table case_studies enable row level security;
drop policy if exists "case_studies_read_all" on case_studies;
create policy "case_studies_read_all" on case_studies
  for select to authenticated using (true);

-- ─── Landing Pages (konkrete Instanzen) ──────────────────────
create table if not exists landing_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  lead_id uuid references leads(id) on delete set null,
  contact_id uuid references lead_contacts(id) on delete set null,
  industry_id text references industries(id) on delete set null,

  -- Gerenderter Snapshot: spätere Template-Änderungen beeinflussen bereits
  -- versendete Links nicht.
  greeting text not null,
  headline text not null,
  intro_text text not null,
  loom_url text,
  outro_text text,
  case_study_ids uuid[] not null default '{}',

  view_count int not null default 0,
  last_viewed_at timestamptz,

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz
);

create index if not exists landing_pages_slug_live_idx
  on landing_pages(slug)
  where deleted_at is null;
create index if not exists landing_pages_lead_idx
  on landing_pages(lead_id)
  where deleted_at is null;
create index if not exists landing_pages_created_idx
  on landing_pages(created_at desc)
  where deleted_at is null;

alter table landing_pages enable row level security;
drop policy if exists "landing_pages_read_all" on landing_pages;
create policy "landing_pages_read_all" on landing_pages
  for select to authenticated using (true);

-- ─── View-Tracking ───────────────────────────────────────────
create table if not exists landing_page_views (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references landing_pages(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  user_agent text,
  ip_hash text
);

create index if not exists landing_page_views_page_idx
  on landing_page_views(landing_page_id, viewed_at desc);

alter table landing_page_views enable row level security;
drop policy if exists "landing_page_views_read_all" on landing_page_views;
create policy "landing_page_views_read_all" on landing_page_views
  for select to authenticated using (true);

-- ─── Seed: Default-Branchen ──────────────────────────────────
insert into industries (id, label, display_order, greeting_template, headline_template, intro_template, outro_template) values
  ('recruiting', 'Recruiting', 10,
   '{{anrede}},',
   'Recruiting-Erfolg für {{company_name}}',
   'vielen Dank für das nette Gespräch. Wie besprochen schicke ich Ihnen hier ein kurzes Erklär-Video, in dem wir unseren Recruiting-Ansatz zeigen — inklusive konkreter Ergebnisse aus vergleichbaren Projekten.',
   'Falls Sie Fragen haben, melden Sie sich gerne jederzeit. Ich freue mich auf den weiteren Austausch.'),
  ('beratung', 'Beratung', 20,
   '{{anrede}},',
   'Passende Lösungen für {{company_name}}',
   'schön, dass wir uns ausgetauscht haben. Hier kompakt, wie wir mit Unternehmen wie Ihrem zusammenarbeiten — mit kurzem Video und Referenz-Cases.',
   'Ich melde mich wie besprochen wieder bei Ihnen.'),
  ('it', 'IT', 30,
   '{{anrede}},',
   'IT-Projekte, die wirklich liefern — {{company_name}}',
   'wie besprochen finden Sie hier eine Übersicht über unseren Ansatz und Cases aus Projekten, die mit Ihren Anforderungen gut vergleichbar sind.',
   'Bei Fragen gerne direkt antworten oder anrufen.'),
  ('handwerk', 'Handwerk', 40,
   '{{anrede}},',
   'Mehr qualifizierte Mitarbeiter für {{company_name}}',
   'danke für das Gespräch. Hier in Kürze, wie wir Handwerks-Betriebe beim Thema Mitarbeitergewinnung unterstützen — mit Video und echten Ergebnissen.',
   'Rufen Sie mich bei Rückfragen gerne an.')
on conflict (id) do nothing;

-- Für bestehende Seeds ohne Template-Werte: Defaults nachziehen.
update industries set greeting_template = '{{anrede}},' where greeting_template = '';
