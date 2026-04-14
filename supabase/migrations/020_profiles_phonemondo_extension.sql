-- PhoneMondo-Durchwahl pro Benutzer (wird beim Click-to-Call mitgeschickt)
alter table profiles
  add column if not exists phonemondo_extension text;
