-- Pro-User-Auswahl: welche custom CRM-Status landen in der Auto-Dialer-Queue.
-- Leer = niemand wird gelistet; der User muss in /anrufe mindestens einen
-- Status auswählen, bevor die Queue befüllt wird.
alter table profiles
  add column if not exists call_queue_status_ids text[];
