-- Vorhandene Branchen verwerfen und vier Swipeflow-Vertikalen seeden.
-- Foreign Keys von case_studies.industry_id und landing_pages.industry_id
-- sind ON DELETE SET NULL — bereits versendete Links bleiben gueltig, zeigen
-- danach nur keinen Branchen-Bezug mehr.
-- calendly_url bleibt leer → greift als Spalten-Default aus Migration 043.

delete from industries;

insert into industries (
  id, label, display_order, is_active,
  greeting_template, headline_template, intro_template, outro_template,
  loom_url
) values
(
  'kaufmann', 'Kaufmännischer Bereich', 10, true,
  '{{anrede}},',
  'Mehr qualifizierte Bewerbungen für Ihre kaufmännischen Stellen bei {{company_name}}',
  'vielen Dank für das nette Gespräch. Wie besprochen schicke ich Ihnen hier ein kurzes Erklär-Video zu unserem Ansatz für den kaufmännischen Bereich — inklusive konkreter Ergebnisse aus vergleichbaren Unternehmen.',
  'Falls Sie Fragen haben, melden Sie sich gerne jederzeit. Ich freue mich auf den weiteren Austausch.',
  null
),
(
  'arztpraxis', 'Arztpraxis', 20, true,
  '{{anrede}},',
  'Mehr passende Bewerbungen für Ihre Praxis {{company_name}}',
  'vielen Dank für das nette Gespräch. Wie besprochen erhalten Sie hier ein kurzes Erklär-Video zu unserem Ansatz für Arztpraxen — inklusive konkreter Ergebnisse aus ähnlichen Praxen.',
  'Bei Fragen bin ich jederzeit für Sie erreichbar. Ich freue mich auf Ihr Feedback.',
  null
),
(
  'azubis', 'Azubis', 30, true,
  '{{anrede}},',
  'Der direkte Weg zu mehr Azubi-Bewerbungen bei {{company_name}}',
  'vielen Dank für das nette Gespräch. Wie besprochen schicke ich Ihnen hier ein kurzes Erklär-Video, das zeigt, wie wir junge Bewerber:innen gezielt für Ihren Ausbildungsbetrieb erreichen — mit konkreten Ergebnissen aus der Praxis.',
  'Wenn Sie Fragen haben, melden Sie sich gerne. Ich freue mich auf den weiteren Austausch.',
  null
),
(
  'industrie', 'Industrie', 40, true,
  '{{anrede}},',
  'Mehr Fachkräfte für {{company_name}} — auch auf dem schwierigen Industrie-Arbeitsmarkt',
  'vielen Dank für das nette Gespräch. Wie besprochen erhalten Sie hier ein kurzes Erklär-Video zu unserem Recruiting-Ansatz für Industrieunternehmen — inklusive konkreter Ergebnisse aus vergleichbaren Projekten.',
  'Bei Rückfragen melden Sie sich jederzeit gerne. Ich freue mich auf den weiteren Austausch.',
  null
);
