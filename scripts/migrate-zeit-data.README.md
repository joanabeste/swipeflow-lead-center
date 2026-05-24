# Zeit-Daten-Migration: Hetzner → Lead-Center-Supabase

Einmaliger Import der bestehenden Time-Tracking-Daten in das integrierte Zeit-Modul.

## Voraussetzungen

1. Migrationen `062_profiles_zeit_fields.sql`, `063_time_entries.sql`, `064_absences.sql` sind in der **Ziel-Supabase** (Lead Center) ausgeführt.
2. `.env.local` enthält `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` der **Ziel**-Instanz.
3. SSH-Zugriff auf die Time-Tracking-VM (Hetzner).
4. `pnpm add -D pg @types/pg tsx` (oder npm/yarn-Äquivalent), falls nicht vorhanden.

## Schritt 1 — SSH-Tunnel öffnen

In einem **separaten Terminal**:

```bash
ssh -L 5433:localhost:5432 deploy@timetracking.swipeflow.de
```

(User und Port nach Bedarf — siehe Time-Tracking-Repo, Bootstrap-Scripts.)

Den Tunnel offen lassen, solange das Skript läuft.

## Schritt 2 — Postgres-Credentials setzen

```bash
export TT_PG_HOST=127.0.0.1
export TT_PG_PORT=5433
export TT_PG_DB=postgres
export TT_PG_USER=postgres
export TT_PG_PASSWORD='…aus dem .env auf der VM…'
```

## Schritt 3 — Trockenlauf

```bash
npx tsx scripts/migrate-zeit-data.ts --dry-run
```

Liest beide DBs, schreibt **nichts**, erzeugt Reports unter `scripts/zeit-migration-report/`:

- `skipped-users.csv` — TT-User ohne LC-Pendant (Email-Match). Diese werden **nicht** importiert.
- `role-conflicts.csv` — User, die in TT Admin waren aber in LC nicht. Wird nur protokolliert, **nicht** geändert.
- `user-sums.csv` — Soll-Werte pro User (Stunden, Anzahl Einträge, Anzahl Abwesenheiten). Mit der alten App quer-prüfen.

## Schritt 4 — Echter Import

Nach erfolgreicher Prüfung der Reports:

```bash
npx tsx scripts/migrate-zeit-data.ts --apply
```

- `time_entries` und `absences` werden mit Original-UUID als `upsert(onConflict: id)` eingespielt — wiederholte Läufe sind idempotent.
- `profiles` werden patcht: nur die Zeit-spezifischen Felder (`hours_*`, `vacation_days_per_year`, `break_mode`).
- Bestehende LC-Profil-Felder (Name, Rolle, Service-Mode, etc.) bleiben unverändert.

## Schritt 5 — Verifikation

Nach dem Import:

1. In `/zeit/admin/reports` ein paar Mitarbeiter mit der alten App vergleichen (Stundensumme pro Monat).
2. Drei Random-Stichproben aus `user-sums.csv` ziehen, in beiden Apps öffnen und vergleichen.
3. Erst wenn alle drei passen: Cutover (DNS-Redirect, alte App in Read-Only).

## Rollback

Da der Import additiv ist (nichts wird gelöscht), reicht zur Rückabwicklung:

```sql
TRUNCATE public.time_entries, public.absences;
-- Profile-Patches sind nicht rollbar ohne Snapshot — vorher `pg_dump` der profiles-Tabelle.
```

Daher: vor `--apply` ein `pg_dump --table=public.profiles --data-only` als Snapshot ziehen.
