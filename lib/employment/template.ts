// Arbeitsvertrags-Template: rendert Werkstudenten- bzw. Angestelltenvertrag als
// vollständiges HTML-Dokument (Lese-Ansicht + finales PDF). Einzige Quelle der
// Wahrheit für /arbeitsvertrag/[token] und das PDF.
//
// Bei jeder inhaltlichen Änderung am Vertragstext EMPLOYMENT_TEMPLATE_VERSION
// erhöhen — die Version wird beim Aktivieren des Links in terms_snapshot eingefroren.

import { formatEuro } from "@/lib/contracts/format";
import { esc, blank, blankDate, LOGO_SVG, wrapDocument } from "@/lib/contracts/template";
import type { EmploymentVariant, NoticePeriodModel, PayModel } from "./types";

export const EMPLOYMENT_TEMPLATE_VERSION = "employment-v1";

export interface EmploymentRenderInput {
  mode: "view" | "pdf";
  variant: EmploymentVariant;

  // Arbeitnehmer
  employeeName: string;
  street: string;
  plzCity: string;

  // Eckdaten
  startDate: string; // ISO oder ""
  fixedTerm: boolean;
  endDate: string; // ISO oder ""
  probationMonths: number;

  // Vergütung
  payModel: PayModel;
  hourlyWageCents: number;
  monthlySalaryCents: number;
  commissionPerAppointmentCents: number;

  // Arbeitszeit / Urlaub
  weeklyHours: number;
  workdaysPerWeek: number;
  vacationDays: number;

  // Klausel-Schalter
  travelCostReimbursed: boolean;
  noticePeriodModel: NoticePeriodModel;

  // Unterschriften (nur pdf-Modus)
  signature?: { dataUrl: string; signedAt: string; signerName: string } | null;
  providerSignature?: { dataUrl: string } | null;
}

const ARBEITGEBER_BLOCK = `
  <p class="parties">
    <strong>Swipeflow GmbH</strong><br />
    Ringstraße 6, 32339 Espelkamp<br />
    vertreten durch die Geschäftsführer Tom Döring und Joana Beste
  </p>
  <p>– nachfolgend „Arbeitgeber“ –</p>`;

function arbeitnehmerBlock(input: EmploymentRenderInput): string {
  return `
    <p class="parties">
      <strong>${blank(input.employeeName, input.mode)}</strong><br />
      ${blank(input.street, input.mode)}<br />
      ${blank(input.plzCity, input.mode)}
    </p>
    <p>– nachfolgend „Arbeitnehmer“ –</p>`;
}

/** Anzahl Wochenstunden lesbar (10, 30, 37,5 …). */
function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("de-DE");
}

function arbeitsortAbsatz(input: EmploymentRenderInput): string {
  if (input.travelCostReimbursed) {
    return `(3) Der Arbeitnehmer übt seine Tätigkeit grundsätzlich im Home-Office aus. Für Schulungen, Onboarding, Teammeetings und sonstige betrieblich erforderliche Termine kann der Arbeitgeber die Anwesenheit in Espelkamp oder Minden verlangen. Reisekosten zu solchen vom Arbeitgeber angeordneten Pflichtterminen werden nach den gesetzlichen Bestimmungen bzw. der jeweils geltenden betrieblichen Reisekostenregelung erstattet.`;
  }
  return `(3) Der Arbeitnehmer übt seine Tätigkeit grundsätzlich im Home-Office aus. Für Schulungen, Onboarding, Teammeetings und sonstige betrieblich erforderliche Termine kann der Arbeitgeber die Anwesenheit in Espelkamp oder Minden verlangen. Etwaige Reisekosten zu solchen Pflichtterminen trägt der Arbeitnehmer selbst; eine Erstattung durch den Arbeitgeber erfolgt nicht.`;
}

/** § Qualifizierter Termin (a–d) — identisch in beiden Verträgen. */
function qualifizierterTermin(billigesErmessen: boolean): string {
  const beurteilung = billigesErmessen
    ? `Die Beurteilung der Qualifikation erfolgt durch den Arbeitgeber nach billigem Ermessen (§ 315 BGB).`
    : `Die Beurteilung der Qualifikation erfolgt durch den Arbeitgeber.`;
  return `
    <p>Ein Termin gilt als „qualifiziert“ und damit provisionsberechtigt, wenn alle folgenden Kriterien erfüllt sind:</p>
    <ul>
      <li>a) Der Termin findet tatsächlich statt (Mindestdauer 15 Minuten mit der entscheidungsbefugten Person);</li>
      <li>b) Der Ansprechpartner befindet sich auf Entscheider- oder Entscheider-Naher-Ebene (z. B. Geschäftsführung, Marketing-/Vertriebsleitung, Personalleitung, Inhaber);</li>
      <li>c) Das Unternehmen entspricht der vom Arbeitgeber definierten Zielgruppe (Ideal Customer Profile);</li>
      <li>d) Es besteht ein konkreter Bedarf oder ein ernsthaftes Interesse an den Leistungen des Arbeitgebers.</li>
    </ul>
    <p>${beurteilung} Stornierte, vom Interessenten abgesagte oder nicht stattgefundene Termine (No-Shows) sind nicht provisionsberechtigt.</p>`;
}

function verschwiegenheit(n: number): string {
  return `
    <h3>§ ${n} Verschwiegenheit (allgemein)</h3>
    <p>Der Arbeitnehmer verpflichtet sich, über alle vertraulichen Angelegenheiten und Geschäftsgeheimnisse — insbesondere Strategien, Preise, Prozesse und interne Dokumentation — Stillschweigen zu bewahren. Die Verpflichtung gilt auch nach Beendigung des Arbeitsverhältnisses fort.</p>`;
}

function nebentaetigkeit(n: number): string {
  return `
    <h3>§ ${n} Nebentätigkeit</h3>
    <p>Jede entgeltliche Nebentätigkeit ist dem Arbeitgeber vor Aufnahme schriftlich anzuzeigen. Der Arbeitgeber kann die Nebentätigkeit untersagen, sofern berechtigte betriebliche Interessen entgegenstehen.</p>`;
}

function ausschluss(n: number): string {
  return `
    <h3>§ ${n} Ausschlussklausel</h3>
    <p>Alle Ansprüche aus dem Arbeitsverhältnis sind innerhalb von drei Monaten nach Fälligkeit schriftlich geltend zu machen, andernfalls verfallen sie. Die Ausschlussfrist gilt nicht für Ansprüche aus vorsätzlichem Handeln und nicht für den gesetzlichen Mindestlohn.</p>`;
}

function arbeitsverhinderung(n: number): string {
  return `
    <h3>§ ${n} Arbeitsverhinderung</h3>
    <p>Der Arbeitnehmer hat den Arbeitgeber im Falle einer Arbeitsverhinderung unverzüglich zu informieren. Bei Krankheit ist spätestens am dritten Tag eine ärztliche Arbeitsunfähigkeitsbescheinigung vorzulegen.</p>`;
}

function datenschutz(n: number): string {
  return `
    <h3>§ ${n} Datenschutz und Verschwiegenheit (DSGVO)</h3>
    <p>(1) Der Arbeitnehmer verpflichtet sich, alle im Rahmen seiner Tätigkeit bekannt werdenden personenbezogenen Daten — insbesondere Kunden- und Interessentendaten, CRM-Inhalte und Telefonlisten — ausschließlich zur Erfüllung seiner arbeitsvertraglichen Aufgaben zu verarbeiten. Eine Weitergabe an Dritte oder eine private Nutzung ist untersagt.</p>
    <p>(2) Die Verpflichtung ergibt sich insbesondere aus Art. 5 und Art. 32 DSGVO sowie § 53 BDSG und gilt auch über das Ende des Arbeitsverhältnisses hinaus.</p>
    <p>(3) Eine gesonderte Verpflichtungserklärung auf das Datengeheimnis ist als Anlage 1 Bestandteil dieses Vertrages.</p>
    <p>(4) Verstöße können straf-, zivil- und arbeitsrechtliche Folgen haben.</p>`;
}

function arbeitsmittel(n: number, withDevices: boolean): string {
  const abs1 = withDevices
    ? `(1) Der Arbeitgeber stellt dem Arbeitnehmer die zur Ausübung seiner Tätigkeit erforderlichen Arbeitsmittel (insbesondere Laptop, Headset, CRM-Zugang, Telefonsoftware) zur Verfügung.`
    : `(1) Die dem Arbeitnehmer vom Arbeitgeber zur Verfügung gestellten Arbeitsmittel (wie z. B. CRM-Zugang und Telefonsoftware) sind sorgfältig zu behandeln.`;
  const abs2 = withDevices
    ? `<p>(2) Die Arbeitsmittel sind sorgfältig zu behandeln und ausschließlich zu dienstlichen Zwecken zu nutzen.</p>`
    : "";
  return `
    <h3>§ ${n} Arbeitsmittel</h3>
    <p>${abs1}</p>
    ${abs2}
    <p>(${withDevices ? 3 : 2}) Bei Beendigung des Arbeitsverhältnisses sind sämtliche überlassenen Arbeitsmittel sowie sämtliche Unterlagen, Daten und Zugangsdaten unaufgefordert und vollständig an den Arbeitgeber zurückzugeben.</p>`;
}

function schluss(n: number): string {
  return `
    <h3>§ ${n} Schlussbestimmungen</h3>
    <p>(1) Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform. Mündliche Nebenabreden bestehen nicht.</p>
    <p>(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit des übrigen Vertrages unberührt. An die Stelle der unwirksamen Bestimmung tritt eine solche, die dem wirtschaftlichen Zweck am nächsten kommt.</p>
    <p>(3) Es gilt deutsches Recht. Gerichtsstand ist, soweit gesetzlich zulässig, der Sitz des Arbeitgebers.</p>`;
}

function signatureBlock(input: EmploymentRenderInput): string {
  if (input.mode !== "pdf" || !input.signature) {
    // Lese-Ansicht: Unterschriftslinien als Platzhalter.
    return `
      <h2>Unterschriften</h2>
      <p>Espelkamp, den ____________________</p>
      <div class="sign-grid">
        <div class="sign-box"><div class="sign-img"></div><div class="sign-cap">Arbeitgeber (Swipeflow GmbH)</div></div>
        <div class="sign-box"><div class="sign-img"></div><div class="sign-cap">Arbeitnehmer (${blank(input.employeeName, input.mode)})</div></div>
      </div>`;
  }
  return `
    <h2>Unterschriften</h2>
    <p>Espelkamp, den ${esc(input.signature.signedAt)}</p>
    <div class="sign-grid">
      <div class="sign-box">
        <div class="sign-img">${
          input.providerSignature ? `<img src="${input.providerSignature.dataUrl}" alt="Unterschrift Arbeitgeber" />` : ""
        }</div>
        <div class="sign-cap">Arbeitgeber (Swipeflow GmbH)</div>
      </div>
      <div class="sign-box">
        <div class="sign-img"><img src="${input.signature.dataUrl}" alt="Unterschrift Arbeitnehmer" /></div>
        <div class="sign-line">${esc(input.signature.signerName)} — ${esc(input.signature.signedAt)}</div>
        <div class="sign-cap">Arbeitnehmer</div>
      </div>
    </div>`;
}

/** § 1 Vergütungs-Absätze für den Stundenlohn-/Gehaltsfall. */
function verguetungAbsaetze(input: EmploymentRenderInput): string {
  const provision = formatEuro(input.commissionPerAppointmentCents);
  if (input.payModel === "hourly") {
    return `
      <p>(1) Der Arbeitnehmer erhält einen Stundenlohn von ${formatEuro(input.hourlyWageCents)} brutto.</p>
      <p>(2) Zusätzlich erhält der Arbeitnehmer eine Provision von ${provision} brutto je qualifiziertem, stattgefundenem Termin (siehe Absatz 4).</p>
      <p>(3) Die Vergütung wird zum Monatsende für den abgelaufenen Monat abgerechnet und auf das vom Arbeitnehmer angegebene Konto überwiesen. Die Provision wird im Folgemonat des stattgefundenen Termins ausgezahlt.</p>
      <p>(4) ${qualifizierterTermin(false).trim()}</p>`;
  }
  // monatlich: durchschnittliche Monatsstunden = Wochenstunden × 13/3
  const monthlyHours = Math.round((input.weeklyHours * 13) / 3);
  const hourlyEquivCents =
    monthlyHours > 0 ? Math.round(input.monthlySalaryCents / monthlyHours) : 0;
  return `
    <p>(1) Der Arbeitnehmer erhält ein monatliches Bruttogehalt von ${formatEuro(input.monthlySalaryCents)}. Dies entspricht bei einer durchschnittlichen monatlichen Arbeitszeit von rund ${monthlyHours} Stunden (${num(input.weeklyHours)} Std./Woche × 13/3) einem Bruttostundenlohn von ca. ${formatEuro(hourlyEquivCents)}.</p>
    <p>(2) Zusätzlich erhält der Arbeitnehmer eine Provision von ${provision} brutto je qualifiziertem, stattgefundenem Termin (siehe Absatz 4).</p>
    <p>(3) Die Vergütung wird zum Monatsende für den abgelaufenen Monat abgerechnet und auf das vom Arbeitnehmer angegebene Konto überwiesen. Die Provision wird im Folgemonat des stattgefundenen Termins ausgezahlt.</p>
    <p>(4) ${qualifizierterTermin(true).trim()}</p>`;
}

function kuendigungAbsaetze(input: EmploymentRenderInput): string {
  if (input.variant === "werkstudent") {
    return `
      <p>(1) Nach Ablauf der Probezeit kann das Arbeitsverhältnis mit den gesetzlichen Fristen gekündigt werden.</p>
      <p>(2) Die Kündigung bedarf der Schriftform.</p>
      <p>(3) Das Arbeitsverhältnis endet, ohne dass es einer Kündigung bedarf, mit dem Ende des Studiums oder bei Exmatrikulation.</p>`;
  }
  if (input.noticePeriodModel === "gesetzlich") {
    return `
      <p>(1) Nach Ablauf der Probezeit kann das Arbeitsverhältnis mit den gesetzlichen Fristen gekündigt werden.</p>
      <p>(2) Die Kündigung bedarf der Schriftform.</p>`;
  }
  return `
    <p>(1) Nach Ablauf der Probezeit kann das Arbeitsverhältnis von beiden Seiten mit einer Frist von einem Monat zum Monatsende gekündigt werden. Längere gesetzliche Kündigungsfristen zugunsten des Arbeitnehmers bleiben unberührt.</p>
    <p>(2) Die Kündigung bedarf der Schriftform.</p>`;
}

function beginnAbsatz(input: EmploymentRenderInput): string {
  if (input.fixedTerm && input.endDate) {
    return `(1) Das Arbeitsverhältnis beginnt am ${blankDate(input.startDate, input.mode)} und ist befristet bis zum ${blankDate(input.endDate, input.mode)}.`;
  }
  if (input.variant === "werkstudent") {
    return `(1) Das Arbeitsverhältnis beginnt am ${blankDate(input.startDate, input.mode)} und wird auf unbestimmte Zeit geschlossen, längstens jedoch für die Dauer des Studiums des Arbeitnehmers.`;
  }
  return `(1) Das Arbeitsverhältnis beginnt am ${blankDate(input.startDate, input.mode)} und wird auf unbestimmte Zeit geschlossen.`;
}

function werkstudentBody(input: EmploymentRenderInput): string {
  return `
    <div class="letterhead">${LOGO_SVG}</div>
    <h1>Arbeitsvertrag für Werkstudenten</h1>
    <p>Zwischen</p>
    ${ARBEITGEBER_BLOCK}
    <p>und</p>
    ${arbeitnehmerBlock(input)}
    <p>wird folgender Arbeitsvertrag geschlossen:</p>

    <h3>§ 1 Beginn, Probezeit und Arbeitsort</h3>
    <p>${beginnAbsatz(input)}</p>
    <p>(2) Die ersten ${num(input.probationMonths)} Monate gelten als Probezeit. Während der Probezeit kann das Arbeitsverhältnis von beiden Seiten mit einer Frist von zwei Wochen gekündigt werden.</p>
    <p>${arbeitsortAbsatz(input)}</p>

    <h3>§ 2 Tätigkeit</h3>
    <p>(1) Der Arbeitnehmer wird als Werkstudent im Vertrieb mit dem Schwerpunkt telefonische Kaltakquise eingestellt.</p>
    <p>(2) Der Aufgabenbereich umfasst insbesondere telefonische Kaltakquise, Lead-Recherche, Pflege des CRM-Systems sowie Terminvereinbarung. Der Arbeitgeber behält sich vor, dem Arbeitnehmer auch andere zumutbare und seinen Fähigkeiten entsprechende Aufgaben zu übertragen.</p>

    <h3>§ 3 Vergütung</h3>
    ${verguetungAbsaetze(input)}

    <h3>§ 4 Arbeitszeit</h3>
    <p>(1) Die regelmäßige wöchentliche Arbeitszeit beträgt ${num(input.weeklyHours)} Stunden, verteilt auf ${num(input.workdaysPerWeek)} Arbeitstage pro Woche.</p>
    <p>(2) Während der Vorlesungszeit darf die Arbeitszeit 20 Stunden pro Woche nicht überschreiten, um den Werkstudentenstatus zu erhalten. In der vorlesungsfreien Zeit ist eine vorübergehende Erhöhung nach Absprache möglich.</p>
    <p>(3) Lage und Verteilung der Arbeitszeit werden in Abstimmung zwischen Arbeitgeber und Arbeitnehmer festgelegt. Die Arbeitszeit ist grundsätzlich an Werktagen (Montag bis Freitag) im Zeitfenster zwischen 08:00 Uhr und 18:00 Uhr zu erbringen, da die Tätigkeit den Kontakt zu Geschäftskunden während deren üblichen Geschäftszeiten erfordert.</p>

    <h3>§ 5 Werkstudentenstatus</h3>
    <p>(1) Der Arbeitnehmer versichert, an einer Hochschule immatrikuliert zu sein, und legt eine aktuelle Immatrikulationsbescheinigung vor.</p>
    <p>(2) Der Arbeitnehmer ist verpflichtet, jede Änderung seines Studentenstatus (Exmatrikulation, Urlaubssemester, Studienabschluss) unverzüglich mitzuteilen. Mit Wegfall des Studentenstatus kann der Vertrag aus wichtigem Grund gekündigt werden.</p>

    <h3>§ 6 Urlaub</h3>
    <p>Der Arbeitnehmer hat Anspruch auf ${num(input.vacationDays)} Arbeitstage Urlaub pro Kalenderjahr. Dies entspricht dem gesetzlichen Mindesturlaub bei einer ${num(input.workdaysPerWeek)}-Tage-Woche. Beginnt oder endet das Arbeitsverhältnis im Laufe eines Kalenderjahres, wird der Urlaubsanspruch anteilig (1/12 je vollendetem Beschäftigungsmonat) berechnet.</p>

    ${arbeitsverhinderung(7)}
    ${verschwiegenheit(8)}
    ${nebentaetigkeit(9)}

    <h3>§ 10 Kündigung</h3>
    ${kuendigungAbsaetze(input)}

    ${ausschluss(11)}
    ${datenschutz(12)}
    ${arbeitsmittel(13, true)}
    ${schluss(14)}

    ${signatureBlock(input)}
  `;
}

function angestellterBody(input: EmploymentRenderInput): string {
  return `
    <div class="letterhead">${LOGO_SVG}</div>
    <h1>Arbeitsvertrag</h1>
    <p>Zwischen</p>
    ${ARBEITGEBER_BLOCK}
    <p>und</p>
    ${arbeitnehmerBlock(input)}
    <p>wird folgender Arbeitsvertrag geschlossen:</p>

    <h3>§ 1 Beginn, Probezeit und Arbeitsort</h3>
    <p>${beginnAbsatz(input)}</p>
    <p>(2) Die ersten ${num(input.probationMonths)} Monate gelten als Probezeit. Während der Probezeit kann das Arbeitsverhältnis von beiden Seiten mit einer Frist von zwei Wochen gekündigt werden.</p>
    <p>${arbeitsortAbsatz(input)}</p>

    <h3>§ 2 Tätigkeit</h3>
    <p>(1) Der Arbeitnehmer wird im Vertrieb mit dem Schwerpunkt telefonische Kaltakquise sowie zur Unterstützung bei Kundenprojekten eingestellt.</p>
    <p>(2) Der Aufgabenbereich umfasst insbesondere telefonische Kaltakquise, Lead-Recherche, Pflege des CRM-Systems, Terminvereinbarung sowie die Mitarbeit und Unterstützung bei Kundenprojekten. Der Arbeitgeber behält sich vor, dem Arbeitnehmer auch andere zumutbare und seinen Fähigkeiten entsprechende Aufgaben zu übertragen.</p>

    <h3>§ 3 Vergütung</h3>
    ${verguetungAbsaetze(input)}

    <h3>§ 4 Arbeitszeit</h3>
    <p>(1) Die regelmäßige wöchentliche Arbeitszeit beträgt ${num(input.weeklyHours)} Stunden, verteilt auf in der Regel ${num(input.workdaysPerWeek)} Arbeitstage pro Woche (Montag bis Freitag).</p>
    <p>(2) Lage und Verteilung der Arbeitszeit werden in Abstimmung zwischen Arbeitgeber und Arbeitnehmer festgelegt. Die Arbeitszeit ist grundsätzlich an Werktagen (Montag bis Freitag) im Zeitfenster zwischen 08:00 Uhr und 18:00 Uhr zu erbringen, da die Tätigkeit den Kontakt zu Geschäftskunden während deren üblichen Geschäftszeiten erfordert.</p>

    <h3>§ 5 Urlaub</h3>
    <p>Der Arbeitnehmer hat Anspruch auf ${num(input.vacationDays)} Arbeitstage Urlaub pro Kalenderjahr (bezogen auf eine ${num(input.workdaysPerWeek)}-Tage-Woche). Beginnt oder endet das Arbeitsverhältnis im Laufe eines Kalenderjahres, wird der Urlaubsanspruch anteilig (1/12 je vollendetem Beschäftigungsmonat) berechnet.</p>

    ${arbeitsverhinderung(6)}
    ${verschwiegenheit(7)}
    ${nebentaetigkeit(8)}

    <h3>§ 9 Kündigung</h3>
    ${kuendigungAbsaetze(input)}

    ${ausschluss(10)}
    ${datenschutz(11)}
    ${arbeitsmittel(12, false)}
    ${schluss(13)}

    ${signatureBlock(input)}
  `;
}

export function renderEmploymentContractHtml(input: EmploymentRenderInput): string {
  const title = input.variant === "werkstudent" ? "Arbeitsvertrag für Werkstudenten" : "Arbeitsvertrag";
  const body = input.variant === "werkstudent" ? werkstudentBody(input) : angestellterBody(input);
  return wrapDocument(title, body);
}
