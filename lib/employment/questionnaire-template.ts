// Rendert den ausgefüllten Personalfragebogen (DATEV-Vorerfassung) als HTML →
// PDF. Tabellarisches Layout angelehnt an das Original-Formular, getrimmt auf
// die für eigene Mitarbeiter relevanten Abschnitte (kein Baugewerbe/Sozialkasse).

import { esc, LOGO_SVG, wrapDocument } from "@/lib/contracts/template";
import type { EmploymentContractRow, QuestionnaireData } from "./types";

export interface PersonalfragebogenRenderInput {
  // Aus dem Vertrag abgeleitet
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  email: string;
  contract: Pick<
    EmploymentContractRow,
    | "variant"
    | "start_date"
    | "probation_months"
    | "weekly_hours"
    | "vacation_days"
    | "fixed_term"
    | "end_date"
  >;

  // Vom Mitarbeiter ausgefüllt
  data: QuestionnaireData;

  // Entschlüsselte sensible Werte (nur fürs PDF, server-seitig)
  steuerId: string;
  iban: string;
  bic: string;
  svNummer: string;

  signedAt: string;
}

function v(value: string | undefined | null): string {
  const s = (value ?? "").toString().trim();
  return s ? esc(s) : "—";
}

function bool(value: boolean | undefined): string {
  return value ? "Ja" : "Nein";
}

function dateDe(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString("de-DE");
}

const GESCHLECHT_LABEL: Record<string, string> = {
  maennlich: "männlich",
  weiblich: "weiblich",
  divers: "divers",
  unbestimmt: "unbestimmt",
};

function row(label: string, value: string): string {
  return `<tr><td>${esc(label)}</td><td>${value}</td></tr>`;
}

export function renderPersonalfragebogenHtml(input: PersonalfragebogenRenderInput): string {
  const d = input.data;
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ");
  const taetigkeit = input.contract.variant === "werkstudent" ? "Werkstudent (Vertrieb)" : "Vertriebsmitarbeiter";

  const kinderRows = (d.kinder ?? [])
    .filter((k) => (k.name || k.vorname || k.geburtsdatum))
    .map(
      (k) =>
        `<tr><td>${v(k.name)}</td><td>${v(k.vorname)}</td><td>${dateDe(k.geburtsdatum)}</td></tr>`,
    )
    .join("");

  const body = `
    <div class="letterhead">${LOGO_SVG}</div>
    <h1>Personalfragebogen</h1>
    <p class="muted">Vorerfassung von Personaldaten für die DATEV-Lohnabrechnung · Firma: Swipeflow GmbH</p>
    <table class="kv"><tr><td>Name der beschäftigten Person</td><td>${v(fullName)}</td></tr></table>

    <h3>1. Persönliche Angaben</h3>
    <table class="kv">
      ${row("Familienname", v(input.lastName))}
      ${row("Vorname", v(input.firstName))}
      ${row("Ggf. Geburtsname", v(d.geburtsname))}
      ${row("Geburtsdatum", dateDe(d.geburtsdatum))}
      ${row("Geburtsort", v(d.geburtsort))}
      ${row("Geburtsland", v(d.geburtsland))}
      ${row("Staatsangehörigkeit", v(d.staatsangehoerigkeit))}
      ${row("Familienstand", v(d.familienstand))}
      ${row("Geschlecht", v(d.geschlecht ? GESCHLECHT_LABEL[d.geschlecht] : ""))}
      ${row("Schwerbehindert", bool(d.schwerbehindert))}
      ${row("Straße, Hausnummer", v(input.street))}
      ${row("PLZ, Ort", v([input.zip, input.city].filter(Boolean).join(" ")))}
      ${row("Versicherungsnummer (SV-Ausweis)", v(input.svNummer))}
    </table>

    <h3>2. Bankverbindung</h3>
    <table class="kv">
      ${row("IBAN", v(input.iban))}
      ${row("BIC", v(input.bic))}
      ${row("Abweichender Kontoinhaber", v(d.abweichender_kontoinhaber))}
    </table>

    <h3>3. Beschäftigung</h3>
    <table class="kv">
      ${row("Eintrittsdatum", dateDe(input.contract.start_date))}
      ${row("Ausgeübte Tätigkeit", esc(taetigkeit))}
      ${row("Haupt-/Nebenbeschäftigung", v(d.haupt_oder_neben === "neben" ? "Nebenbeschäftigung" : d.haupt_oder_neben === "haupt" ? "Hauptbeschäftigung" : ""))}
      ${row("Probezeit", `${input.contract.probation_months} Monate`)}
      ${row("Weitere Beschäftigungen?", bool(d.weitere_beschaeftigungen))}
      ${row("Davon geringfügig?", bool(d.weitere_geringfuegig))}
    </table>

    <h3>4. Schul- und Berufsausbildung</h3>
    <table class="kv">
      ${row("Höchster Schulabschluss", v(d.schulabschluss))}
      ${row("Höchste Berufsausbildung", v(d.berufsausbildung))}
    </table>

    <h3>5. Arbeitszeit und Urlaub</h3>
    <table class="kv">
      ${row("Wöchentliche Arbeitszeit", `${input.contract.weekly_hours} Stunden`)}
      ${row("Urlaubsanspruch (Kalenderjahr)", `${input.contract.vacation_days} Tage`)}
      ${row("Vertragsform", input.contract.fixed_term ? `Befristet bis ${dateDe(input.contract.end_date)}` : "Unbefristet")}
    </table>

    <h3>6. Steuerliche Angaben</h3>
    <table class="kv">
      ${row("Steuer-ID", v(input.steuerId))}
      ${row("Steuerklasse / Faktor", v(d.steuerklasse))}
      ${row("Kinderfreibeträge", v(d.kinderfreibetraege))}
      ${row("Konfession", v(d.konfession))}
    </table>

    <h3>7. Sozialversicherung</h3>
    <table class="kv">
      ${row("Krankenversicherung", v(d.kv_art === "privat" ? "Privat" : d.kv_art === "gesetzlich" ? "Gesetzlich" : ""))}
      ${row("Name der Krankenkasse / Versicherung", v(d.kv_name))}
    </table>

    <h3>8. Vermögenswirksame Leistungen</h3>
    <table class="kv">
      ${row("Empfänger", v(d.vwl_empfaenger))}
      ${row("Betrag (€)", v(d.vwl_betrag_eur))}
      ${row("Vertragsnummer", v(d.vwl_vertragsnummer))}
      ${row("IBAN", v(d.vwl_iban))}
    </table>

    <h3>9. Kinder</h3>
    ${
      kinderRows
        ? `<table class="kv"><tr><td>Name</td><td>Vorname</td><td>Geburtsdatum</td></tr>${kinderRows}</table>`
        : `<p class="muted">Keine Angaben.</p>`
    }

    <h3>10. Erklärung</h3>
    <p class="muted">Die beschäftigte Person versichert, dass die vorstehenden Angaben der Wahrheit entsprechen, und verpflichtet sich, alle Änderungen (insbesondere zu weiteren Beschäftigungen nach Art, Dauer und Entgelt) unverzüglich mitzuteilen.</p>
    <div class="sign-grid">
      <div class="sign-box">
        <div class="sign-line">${v(fullName)} — ${v(input.signedAt)}</div>
        <div class="sign-cap">Unterschrift Mitarbeiter (digital bestätigt)</div>
      </div>
    </div>
  `;

  return wrapDocument("Personalfragebogen", body);
}
