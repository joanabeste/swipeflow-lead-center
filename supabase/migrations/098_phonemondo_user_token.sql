-- PhoneMondo: optionaler API-Token pro Nutzer (verschluesselt gespeichert).
-- NULL = Team-Token (PHONEMONDO_API_TOKEN) wird genutzt.
alter table profiles
  add column if not exists phonemondo_api_token text;
