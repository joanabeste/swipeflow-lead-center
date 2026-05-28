#!/usr/bin/env tsx
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — One-off CLI: braucht `pg`+`@types/pg` als devDeps, die erst vor
// dem Migrationslauf installiert werden. Aus dem App-Typecheck ausgeklammert.
/**
 * Einmal-Import: Zeit-Daten von der bisherigen Time-Tracking-Instanz (Hetzner)
 * in die Lead-Center-Supabase migrieren.
 *
 * Quelle:  Postgres im Docker auf timetracking.swipeflow.de.
 *          Zugriff per SSH-Tunnel:
 *            ssh -L 5433:localhost:5432 user@timetracking.swipeflow.de
 *          (User/Port nach Bedarf anpassen — siehe README im Time-Tracking-Repo)
 *
 * Ziel:    Lead-Center-Supabase. NEXT_PUBLIC_SUPABASE_URL +
 *          SUPABASE_SERVICE_ROLE_KEY aus .env.local werden verwendet.
 *
 * User-Mapping: ausschliesslich per E-Mail. TT-only-User werden NICHT angelegt,
 * sondern im Report gelistet (skipped-users.csv) — du entscheidest manuell.
 *
 * Aufruf (lokal, aus dem Repo-Root):
 *   1) SSH-Tunnel offen halten in einem anderen Terminal.
 *   2) `npx tsx scripts/migrate-zeit-data.ts --dry-run`
 *   3) Report pruefen.
 *   4) `npx tsx scripts/migrate-zeit-data.ts --apply`
 *
 * Voraussetzung: Migrationen 062–064 sind in der Ziel-DB ausgefuehrt.
 */

import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// --- Konfiguration ----------------------------------------------------------

const TT_PG = {
  host: process.env.TT_PG_HOST ?? "127.0.0.1",
  port: Number(process.env.TT_PG_PORT ?? 5433),
  database: process.env.TT_PG_DB ?? "postgres",
  user: process.env.TT_PG_USER ?? "postgres",
  password: process.env.TT_PG_PASSWORD ?? "",
};

const LC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const LC_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!LC_SUPABASE_URL || !LC_SERVICE_ROLE) {
  console.error("FEHLER: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein (in .env.local).");
  process.exit(1);
}

const DRY = !process.argv.includes("--apply");

// --- Typen ------------------------------------------------------------------

interface TtProfile {
  id: string;
  full_name: string | null;
  role: "admin" | "employee";
  hours_mon: number;
  hours_tue: number;
  hours_wed: number;
  hours_thu: number;
  hours_fri: number;
  hours_sat: number;
  hours_sun: number;
  vacation_days_per_year: number;
  break_mode: "manual" | "auto_deduct";
}

interface TtAuthUser {
  id: string;
  email: string;
}

interface TtTimeEntry {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  created_at: string;
}

interface TtAbsence {
  id: string;
  user_id: string;
  type: string;
  date_from: string;
  date_to: string;
  status: string;
  note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log(`Modus: ${DRY ? "DRY-RUN (keine Schreibvorgaenge)" : "APPLY (Schreibt in LC-Supabase)"}`);

  console.log("\n[1/4] Verbinde mit TT-Postgres (via SSH-Tunnel) …");
  const pg = new Client(TT_PG);
  await pg.connect();

  console.log("[2/4] Lade TT-Profile + auth.users …");
  const ttProfiles = (await pg.query<TtProfile>(`SELECT id, full_name, role, hours_mon, hours_tue, hours_wed, hours_thu, hours_fri, hours_sat, hours_sun, vacation_days_per_year, break_mode FROM public.profiles`)).rows;
  const ttUsers = (await pg.query<TtAuthUser>(`SELECT id, email FROM auth.users`)).rows;
  const ttEntries = (await pg.query<TtTimeEntry>(`SELECT id, user_id, started_at, ended_at, note, created_at FROM public.time_entries ORDER BY started_at`)).rows;
  const ttAbsences = (await pg.query<TtAbsence>(`SELECT id, user_id, type, date_from, date_to, status, note, decided_by, decided_at, created_at FROM public.absences ORDER BY date_from`)).rows;
  await pg.end();

  console.log(`  - Profile: ${ttProfiles.length}, auth.users: ${ttUsers.length}, time_entries: ${ttEntries.length}, absences: ${ttAbsences.length}`);

  console.log("[3/4] Mapping TT → LC per E-Mail …");
  const lc = createClient(LC_SUPABASE_URL, LC_SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: lcProfiles, error: lcErr } = await lc.from("profiles").select("id, email, role");
  if (lcErr) throw new Error(`LC-Profile lesen fehlgeschlagen: ${lcErr.message}`);

  const lcByEmail = new Map<string, { id: string; role: string }>();
  for (const p of (lcProfiles ?? []) as Array<{ id: string; email: string; role: string }>) {
    if (p.email) lcByEmail.set(p.email.toLowerCase(), { id: p.id, role: p.role });
  }
  const ttUserById = new Map(ttUsers.map((u) => [u.id, u.email]));

  const userMap = new Map<string, string>();
  const skippedUsers: Array<{ tt_id: string; email: string; reason: string }> = [];
  const roleConflicts: Array<{ email: string; tt_role: string; lc_role: string }> = [];

  for (const p of ttProfiles) {
    const email = (ttUserById.get(p.id) ?? "").toLowerCase();
    if (!email) {
      skippedUsers.push({ tt_id: p.id, email: "", reason: "Kein E-Mail-Eintrag in TT auth.users" });
      continue;
    }
    const lcProfile = lcByEmail.get(email);
    if (!lcProfile) {
      skippedUsers.push({ tt_id: p.id, email, reason: "Kein LC-Profil mit dieser E-Mail" });
      continue;
    }
    userMap.set(p.id, lcProfile.id);
    if (p.role === "admin" && lcProfile.role !== "admin") {
      roleConflicts.push({ email, tt_role: p.role, lc_role: lcProfile.role });
    }
  }

  console.log(`  - Gemappte User: ${userMap.size}, uebersprungene: ${skippedUsers.length}, Rollenkonflikte: ${roleConflicts.length}`);

  // Soll-/Ist-Vergleich pro User: TT-Summen
  const ttSumsByUser = new Map<string, { entries: number; absences: number; seconds: number }>();
  for (const e of ttEntries) {
    const sum = ttSumsByUser.get(e.user_id) ?? { entries: 0, absences: 0, seconds: 0 };
    sum.entries += 1;
    if (e.ended_at) sum.seconds += Math.max(0, Math.round((new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 1000));
    ttSumsByUser.set(e.user_id, sum);
  }
  for (const a of ttAbsences) {
    const sum = ttSumsByUser.get(a.user_id) ?? { entries: 0, absences: 0, seconds: 0 };
    sum.absences += 1;
    ttSumsByUser.set(a.user_id, sum);
  }

  // Report-Dateien immer schreiben
  const reportDir = path.join(process.cwd(), "scripts", "zeit-migration-report");
  await writeFile(
    path.join(reportDir, "skipped-users.csv"),
    "tt_id;email;reason\n" + skippedUsers.map((s) => `${s.tt_id};${s.email};${s.reason}`).join("\n"),
  );
  await writeFile(
    path.join(reportDir, "role-conflicts.csv"),
    "email;tt_role;lc_role\n" + roleConflicts.map((r) => `${r.email};${r.tt_role};${r.lc_role}`).join("\n"),
  );
  await writeFile(
    path.join(reportDir, "user-sums.csv"),
    "tt_id;email;lc_id;entries;absences;hours\n" +
      [...ttSumsByUser.entries()]
        .map(([ttId, sum]) => {
          const email = ttUserById.get(ttId) ?? "";
          const lcId = userMap.get(ttId) ?? "";
          return `${ttId};${email};${lcId};${sum.entries};${sum.absences};${(sum.seconds / 3600).toFixed(2)}`;
        })
        .join("\n"),
  );
  console.log(`  - Reports geschrieben nach scripts/zeit-migration-report/`);

  console.log("[4/4] " + (DRY ? "Trockenlauf — kein Schreibzugriff." : "Schreibe in LC-Supabase …"));
  if (DRY) {
    console.log("\nFertig (Dry-Run). Pruefe die Reports. Mit --apply erneut starten, um zu importieren.");
    return;
  }

  // Profile-Felder patchen (nur Zeit-spezifische Felder).
  for (const p of ttProfiles) {
    const lcId = userMap.get(p.id);
    if (!lcId) continue;
    const { error } = await lc.from("profiles").update({
      hours_mon: p.hours_mon, hours_tue: p.hours_tue, hours_wed: p.hours_wed,
      hours_thu: p.hours_thu, hours_fri: p.hours_fri, hours_sat: p.hours_sat, hours_sun: p.hours_sun,
      vacation_days_per_year: p.vacation_days_per_year,
      break_mode: p.break_mode,
    }).eq("id", lcId);
    if (error) console.error(`[profile patch ${lcId}]`, error.message);
  }

  // Time-Entries — Insert mit upsert auf id.
  const mappedEntries = ttEntries
    .filter((e) => userMap.has(e.user_id))
    .map((e) => ({
      id: e.id,
      user_id: userMap.get(e.user_id)!,
      started_at: e.started_at,
      ended_at: e.ended_at,
      note: e.note,
      created_at: e.created_at,
    }));
  for (let i = 0; i < mappedEntries.length; i += 500) {
    const batch = mappedEntries.slice(i, i + 500);
    const { error } = await lc.from("time_entries").upsert(batch, { onConflict: "id" });
    if (error) console.error(`[entries batch ${i}]`, error.message);
    else console.log(`  - entries: ${i + batch.length}/${mappedEntries.length}`);
  }

  // Absences — analog, decided_by ebenfalls remappen wenn moeglich.
  const mappedAbsences = ttAbsences
    .filter((a) => userMap.has(a.user_id))
    .map((a) => ({
      id: a.id,
      user_id: userMap.get(a.user_id)!,
      type: a.type,
      date_from: a.date_from,
      date_to: a.date_to,
      status: a.status,
      note: a.note,
      decided_by: a.decided_by ? userMap.get(a.decided_by) ?? null : null,
      decided_at: a.decided_at,
      created_at: a.created_at,
    }));
  for (let i = 0; i < mappedAbsences.length; i += 500) {
    const batch = mappedAbsences.slice(i, i + 500);
    const { error } = await lc.from("absences").upsert(batch, { onConflict: "id" });
    if (error) console.error(`[absences batch ${i}]`, error.message);
    else console.log(`  - absences: ${i + batch.length}/${mappedAbsences.length}`);
  }

  console.log("\nFertig. Verifiziere Stundensummen mit den Reports + manueller Querkontrolle.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
