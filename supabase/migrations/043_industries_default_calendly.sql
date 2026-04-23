-- Default-Calendly-URL auf allen bestehenden Branchen setzen und als
-- Column-Default verankern, damit auch neu angelegte Branchen sie erben.
-- User kann pro Branche im Industry-Manager ueberschreiben.

alter table industries
  alter column calendly_url set default 'https://calendly.com/swipeflow-tomdoering/30-minutiges-beratungsgesprach?month=2026-04';

update industries
set calendly_url = 'https://calendly.com/swipeflow-tomdoering/30-minutiges-beratungsgesprach?month=2026-04'
where calendly_url is null;
