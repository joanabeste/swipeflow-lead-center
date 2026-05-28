// Vertrags-Template: rendert den Dienstleistungs- & Auftragsverarbeitungsvertrag
// (Webdesign) als vollständiges HTML-Dokument. Einzige Quelle der Wahrheit für
// die Lese-Ansicht (öffentliche Route) und das finale PDF.
//
// Bei jeder inhaltlichen Änderung am Vertragstext TEMPLATE_VERSION erhöhen —
// die Version wird beim Versand in terms_snapshot eingefroren.

import { formatEuro, splitInstallments } from "./format";

export const TEMPLATE_VERSION = "webdesign-v1";

export interface ContractRenderInput {
  mode: "view" | "pdf";

  // Kunde / Auftraggeber
  customerName: string;
  street: string;
  plzCity: string;

  // Konditionen
  setupPriceCents: number;
  monthlyMaintCents: number;
  paymentMode: "einmal" | "raten";
  installmentCount: number | null;
  paymentMethod: "sepa" | "rechnung";

  // SEPA-Gläubiger (aus Env)
  creditor: { id: string; name: string; address: string };
  // SEPA-Mandatsreferenz (stabil pro Vertrag)
  mandateReference: string;
  // SEPA-Schuldner (vom Kunden ausgefüllt; im pdf-Modus gesetzt)
  sepa?: { accountHolder: string; ibanMasked: string } | null;

  // Unterschrift (nur im pdf-Modus)
  signature?: { dataUrl: string; signedAt: string; signerName: string } | null;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function blank(value: string | undefined | null, mode: "view" | "pdf"): string {
  if (value && value.trim()) return esc(value);
  return mode === "view" ? "________________________" : "—";
}

// Beide Hosting-Subunternehmer werden im AV-Vertrag IMMER genannt, damit der
// tatsaechlich genutzte Hoster stets vom AV abgedeckt ist — unabhaengig davon,
// welcher Hoster pro Projekt eingesetzt oder spaeter gewechselt wird.
function subprocessorListItems(): string {
  return [
    "Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Deutschland — Hosting und Server-Infrastruktur.",
    "Mittwald CM Service GmbH &amp; Co. KG, Königsberger Straße 4–6, 32339 Espelkamp, Deutschland — Hosting und Server-Infrastruktur.",
  ]
    .map((entry) => `<li>${entry}</li>`)
    .join("");
}

function zahlungsbedingungen(input: ContractRenderInput): string {
  const methodWord =
    input.paymentMethod === "sepa"
      ? "per SEPA-Lastschrift eingezogen"
      : "per Rechnung beglichen";

  let satz: string;
  if (input.paymentMode === "raten" && input.installmentCount && input.installmentCount > 1) {
    const { base, last } = splitInstallments(input.setupPriceCents, input.installmentCount);
    const rateText =
      base === last
        ? `${input.installmentCount} aufeinanderfolgenden Monatsraten à ${formatEuro(base)}`
        : `${input.installmentCount} aufeinanderfolgenden Monatsraten (${input.installmentCount - 1} × ${formatEuro(base)}, letzte Rate ${formatEuro(last)})`;
    satz = `Die Vergütung für die Erstellung der Webseite wird in ${rateText} gezahlt und ${methodWord}. Die erste Rate ist mit Abnahme der Webseite fällig.`;
  } else {
    satz = `Die Vergütung für die Erstellung der Webseite ist mit Abnahme der Webseite in einer Summe fällig und wird ${methodWord}.`;
  }

  const hostingZusatz = ` Die Wartungs- und Hostingpauschale wird unabhängig hiervon einmal jährlich im Voraus abgerechnet.`;
  return satz + hostingZusatz;
}

function sepaMandateSection(input: ContractRenderInput): string {
  if (input.paymentMethod !== "sepa") return "";
  const holder = blank(input.sepa?.accountHolder, input.mode);
  const iban = blank(input.sepa?.ibanMasked, input.mode);
  return `
    <h2>SEPA-Lastschriftmandat</h2>
    <p>
      Ich ermächtige die ${esc(input.creditor.name)}, Zahlungen aus diesem Vertrag von
      meinem Konto mittels SEPA-Lastschrift einzuziehen. Zugleich weise ich mein
      Kreditinstitut an, die von der ${esc(input.creditor.name)} auf mein Konto gezogenen
      Lastschriften einzulösen. Es handelt sich um wiederkehrende Zahlungen (Wartung/Hosting)
      sowie ggf. die Zahlung(en) für die Erstellung der Webseite.
    </p>
    <p>
      Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die
      Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem
      Kreditinstitut vereinbarten Bedingungen.
    </p>
    <table class="kv">
      <tr><td>Zahlungsempfänger (Gläubiger)</td><td>${esc(input.creditor.name)}, ${esc(input.creditor.address)}</td></tr>
      <tr><td>Gläubiger-Identifikationsnummer</td><td>${blank(input.creditor.id, input.mode)}</td></tr>
      <tr><td>Mandatsreferenz</td><td>${esc(input.mandateReference)}</td></tr>
      <tr><td>Kontoinhaber</td><td>${holder}</td></tr>
      <tr><td>IBAN</td><td>${iban}</td></tr>
    </table>
  `;
}

function signatureBlock(input: ContractRenderInput): string {
  if (input.mode === "pdf" && input.signature) {
    return `
      <div class="sign-grid">
        <div class="sign-box">
          <div class="sign-img"><img src="${input.signature.dataUrl}" alt="Unterschrift" /></div>
          <div class="sign-line">${esc(input.signature.signerName)} — ${esc(input.signature.signedAt)}</div>
          <div class="sign-cap">${esc(input.customerName)} (Auftraggeber)</div>
        </div>
        <div class="sign-box">
          <div class="sign-img"></div>
          <div class="sign-line">swipeflow GmbH</div>
          <div class="sign-cap">Anbieter</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="sign-note">
      Mit dem Absenden des Formulars unterschreiben Sie diesen Vertrag rechtsverbindlich
      in elektronischer Form (Annahme des Angebots).
    </div>
  `;
}

export function renderContractHtml(input: ContractRenderInput): string {
  const websitekosten = formatEuro(input.setupPriceCents);
  const webhostingkosten = formatEuro(input.monthlyMaintCents);

  const body = `
    <h1>Dienstleistungs- und Auftragsverarbeitungsvertrag</h1>

    <p class="parties">
      <strong>swipeflow GmbH</strong><br />
      Ringstraße 6<br />
      32339 Espelkamp
    </p>
    <p>und</p>
    <p class="parties">
      <strong>${blank(input.customerName, input.mode)}</strong><br />
      ${blank(input.street, input.mode)}<br />
      ${blank(input.plzCity, input.mode)}
    </p>
    <p>– im Folgenden „Auftraggeber“ genannt –</p>
    <p>wird folgender Dienstleistungs- und Auftragsverarbeitungsvertrag geschlossen:</p>

    <h2>Teil I – Dienstleistungsvertrag (Webseiten-Erstellung, Hosting &amp; Pflege)</h2>

    <h3>§ 1 Vertragsgegenstand</h3>
    <p>(1) Der Dienstleister verpflichtet sich, für den Auftraggeber eine Webseite zu konzipieren, technisch zu realisieren, zu hosten und regelmäßig zu warten.</p>
    <p>(2) Der Leistungsumfang umfasst insbesondere:</p>
    <ul>
      <li>Konzeption, Design und technische Umsetzung der Webseite</li>
      <li>Bereitstellung und Verwaltung des Hostings</li>
      <li>fortlaufende Wartung, Updates und Backups</li>
      <li>technische Betreuung und Support</li>
    </ul>
    <p>(3) Änderungen oder Erweiterungen der Leistungen bedürfen der Schriftform.</p>

    <h3>§ 2 Pflichten des Auftraggebers</h3>
    <p>(1) Der Auftraggeber stellt alle für die Umsetzung erforderlichen Inhalte (Texte, Bilder, Logos etc.) rechtzeitig zur Verfügung.</p>
    <p>(2) Der Auftraggeber sichert zu, dass die übermittelten Materialien frei von Rechten Dritter sind und keine Gesetze verletzen.</p>
    <p>(3) Der Auftraggeber unterstützt den Dienstleister durch rechtzeitige Mitwirkung (z. B. Freigaben, Rückmeldungen, Bereitstellung von Zugangsdaten).</p>

    <h3>§ 3 Wartung, Hosting und Support</h3>
    <p>(1) Der Dienstleister übernimmt für den Auftraggeber die fortlaufende technische Wartung und das Hosting der Webseite.</p>
    <p>(2) Die Wartung umfasst insbesondere:</p>
    <ul>
      <li>regelmäßige Sicherheitsupdates und Systemaktualisierungen,</li>
      <li>Überwachung der Serververfügbarkeit</li>
      <li>Erstellung und Kontrolle von Datensicherungen (Backups),</li>
      <li>Behebung technischer Fehler,</li>
      <li>kleinere inhaltliche Änderungen auf der Webseite (z. B. Texte, Bilder, Öffnungszeiten, Ansprechpartner).</li>
    </ul>
    <p>(3) Der Auftraggeber zahlt für Wartung und Hosting eine monatliche Pauschale von ${webhostingkosten} netto. Die Abrechnung erfolgt einmal jährlich im Voraus per Rechnung.</p>
    <p>(4) Änderungen, die den Rahmen der laufenden Pflege übersteigen – insbesondere neue Unterseiten, strukturelle Anpassungen, Designänderungen oder zusätzliche Funktionen – werden nach Aufwand des Dienstleisters abgerechnet.</p>
    <p>(5) Kleine Änderungen sind solche, die innerhalb von 30 Minuten erledigt werden können. Mehrere kleine Änderungen können nach Ermessen des Dienstleisters zusammengefasst werden.</p>
    <p>(6) Der Dienstleister informiert den Auftraggeber vorab, falls eine gewünschte Änderung voraussichtlich über den Leistungsumfang der Wartung hinausgeht.</p>

    <h3>§ 4 Vergütung und Zahlungsbedingungen</h3>
    <p>(1) Die Vergütung für die Erstellung der Webseite beträgt ${websitekosten} netto.</p>
    <p>(2) ${zahlungsbedingungen(input)}</p>
    <p>(3) Zusatzleistungen, die nicht im Angebot enthalten sind, werden gesondert nach Aufwand berechnet.</p>
    <p>(4) Rechnungen sind innerhalb von 14 Tagen nach Zugang ohne Abzug zahlbar.</p>
    <p>(5) Alle Preise verstehen sich zzgl. der jeweils geltenden gesetzlichen Mehrwertsteuer.</p>

    <h3>§ 5 Laufzeit und Kündigung</h3>
    <p>(1) Der Vertrag tritt mit Unterzeichnung in Kraft.</p>
    <p>(2) Die Erstellung der Webseite endet mit der Abnahme.</p>
    <p>(3) Laufende Wartungs- oder Hostingverträge verlängern sich automatisch um 12 Monate, sofern sie nicht vier Wochen vor Ablauf schriftlich gekündigt werden.</p>
    <p>(4) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.</p>

    <h3>§ 6 Abnahme und Mängel</h3>
    <p>(1) Nach Fertigstellung stellt der Dienstleister dem Auftraggeber eine Testversion zur Prüfung bereit.</p>
    <p>(2) Erfolgt innerhalb von zwanzig Werktagen keine schriftliche Beanstandung, gilt die Webseite als abgenommen.</p>

    <h3>§ 7 Nutzungsrechte</h3>
    <p>(1) Nach vollständiger Zahlung erhält der Auftraggeber ein einfaches, zeitlich und räumlich unbeschränktes Nutzungsrecht an der erstellten Webseite.</p>
    <p>(2) Der Dienstleister bleibt Inhaber der Urheberrechte an entwickelten Quellcodes, Layouts und Konzepten, sofern nichts anderes schriftlich vereinbart wird.</p>
    <p>(3) Der Dienstleister darf die erstellte Webseite als Referenzprojekt nennen, sofern der Auftraggeber dem nicht ausdrücklich widerspricht.</p>

    <h3>§ 8 Haftung</h3>
    <p>(1) Der Dienstleister haftet nur für Vorsatz und grobe Fahrlässigkeit.</p>
    <p>(2) Für Datenverluste haftet der Dienstleister nur, wenn diese durch angemessene Datensicherung vermeidbar gewesen wären.</p>
    <p>(3) Für Inhalte, die vom Auftraggeber bereitgestellt werden, übernimmt der Dienstleister keine Haftung.</p>
    <p>(4) Im Übrigen gelten die gesetzlichen Haftungsregelungen.</p>

    <h3>§ 9 Datenschutz und Auftragsverarbeitung</h3>
    <p>(1) Der Dienstleister verarbeitet personenbezogene Daten ausschließlich im Auftrag und nach Weisung des Auftraggebers gemäß Art. 28 DSGVO.</p>
    <p>(2) Die Bestimmungen zur Auftragsverarbeitung sind integraler Bestandteil dieses Vertrags (Teil II).</p>

    <h3>§ 10 Schlussbestimmungen</h3>
    <p>(1) Änderungen und Ergänzungen dieses Vertrags bedürfen der Schriftform.</p>
    <p>(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt. Die Parteien verpflichten sich, eine wirtschaftlich gleichwertige Regelung zu treffen.</p>
    <p>(3) Es gilt deutsches Recht. Gerichtsstand ist – soweit zulässig – der Sitz des Dienstleisters.</p>

    <h2>Teil II – Auftragsverarbeitungsvertrag (AV-Vertrag) gemäß Art. 28 DSGVO</h2>

    <h3>§ 1 Gegenstand und Dauer</h3>
    <p>(1) Der Dienstleister verarbeitet personenbezogene Daten im Auftrag des Auftraggebers im Zusammenhang mit Betrieb, Hosting und Wartung der Webseite.</p>
    <p>(2) Die Verarbeitung erfolgt ausschließlich auf Grundlage dieses Vertrags und der Weisungen des Auftraggebers.</p>
    <p>(3) Die Laufzeit dieses Teils richtet sich nach der Dauer des Dienstleistungsvertrags.</p>

    <h3>§ 2 Art und Zweck der Verarbeitung</h3>
    <ul>
      <li>Zweck: Betrieb, Pflege, Hosting und Wartung der Webseite.</li>
      <li>Art der Verarbeitung: Erhebung, Speicherung, Übermittlung und Löschung von Daten.</li>
      <li>Betroffene Personen: Besucher der Webseite, Nutzer von Kontaktformularen, Mitarbeiter des Auftraggebers.</li>
      <li>Datenarten: Namen, E-Mail-Adressen, Telefonnummern, Formularinhalte, IP-Adressen, Logfiles, Cookies.</li>
    </ul>

    <h3>§ 3 Rechte und Pflichten des Auftraggebers</h3>
    <p>(1) Der Auftraggeber bleibt Verantwortlicher im Sinne des Art. 4 Nr. 7 DSGVO.</p>
    <p>(2) Der Auftraggeber ist für die Rechtmäßigkeit der Datenverarbeitung verantwortlich.</p>
    <p>(3) Weisungen an den Dienstleister erfolgen schriftlich oder elektronisch.</p>

    <h3>§ 4 Pflichten des Dienstleisters</h3>
    <p>(1) Der Dienstleister verarbeitet personenbezogene Daten ausschließlich gemäß Weisung des Auftraggebers.</p>
    <p>(2) Der Dienstleister gewährleistet Vertraulichkeit durch verpflichtete Mitarbeiter.</p>
    <p>(3) Der Dienstleister trifft angemessene technische und organisatorische Maßnahmen (TOMs) gemäß Art. 32 DSGVO.</p>
    <p>(4) Der Dienstleister unterstützt den Auftraggeber bei der Erfüllung von Betroffenenrechten (Art. 15–22 DSGVO) sowie Meldepflichten (Art. 33 und 34 DSGVO).</p>
    <p>(5) Nach Beendigung des Vertrags löscht der Dienstleister alle personenbezogenen Daten, sofern keine gesetzlichen Aufbewahrungspflichten bestehen.</p>

    <h3>§ 5 Technische und organisatorische Maßnahmen (TOMs)</h3>
    <p>Der Dienstleister gewährleistet mindestens folgende Maßnahmen:</p>
    <ul>
      <li>Passwortschutz und Zugriffsbeschränkungen auf Systeme</li>
      <li>SSL/TLS-Verschlüsselung sämtlicher Datenübertragungen</li>
      <li>Protokollierung und Monitoring von Systemzugriffen</li>
    </ul>
    <p>Eine detaillierte TOM-Dokumentation kann auf Anfrage bereitgestellt werden.</p>

    <h3>§ 6 Subunternehmer</h3>
    <p>(1) Der Dienstleister darf Subunternehmer einsetzen, soweit dies zur Erfüllung der vertraglichen Leistungen erforderlich ist.</p>
    <p>(2) Der Auftraggeber stimmt dem Einsatz folgender Subunternehmer zu. Das Hosting wird durch einen dieser Anbieter erbracht:</p>
    <ul>${subprocessorListItems()}</ul>
    <p>(3) Der Dienstleister informiert den Auftraggeber über beabsichtigte Änderungen in Bezug auf die Hinzuziehung oder Ersetzung weiterer Subunternehmer.</p>
    <p>(4) Der Dienstleister bleibt gegenüber dem Auftraggeber für die Einhaltung aller Datenschutzpflichten verantwortlich.</p>

    <h3>§ 7 Kontrollrechte</h3>
    <p>(1) Der Auftraggeber ist berechtigt, die Einhaltung der DSGVO und dieses Vertrags beim Dienstleister zu kontrollieren.</p>
    <p>(2) Der Dienstleister stellt auf Anfrage Nachweise über die getroffenen TOMs zur Verfügung.</p>

    <h3>§ 8 Haftung</h3>
    <p>(1) Der Dienstleister haftet für Verstöße gegen diesen Vertrag oder die DSGVO nur im Rahmen seiner gesetzlichen Verantwortlichkeit.</p>
    <p>(2) Im Übrigen gelten die Haftungsregelungen des Dienstleistungsvertrags.</p>

    <h3>§ 9 Schlussbestimmungen</h3>
    <p>(1) Änderungen und Ergänzungen dieses Teils bedürfen der Schriftform.</p>
    <p>(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt.</p>
    <p>(3) Es gilt deutsches Recht. Gerichtsstand ist der Sitz des Dienstleisters.</p>

    ${sepaMandateSection(input)}

    <h2>Unterschrift</h2>
    ${signatureBlock(input)}
  `;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dienstleistungs- und Auftragsverarbeitungsvertrag</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1a1a; line-height: 1.5; font-size: 11pt; margin: 0;
  }
  .doc { max-width: 800px; margin: 0 auto; padding: 0; }
  h1 { font-size: 20pt; margin: 0 0 16px; }
  h2 { font-size: 14pt; margin: 28px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 11.5pt; margin: 18px 0 4px; }
  p { margin: 6px 0; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { margin: 2px 0; }
  .parties { margin: 10px 0; }
  table.kv { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.kv td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; font-size: 10.5pt; }
  table.kv td:first-child { width: 40%; color: #555; }
  .sign-note { margin: 12px 0; padding: 12px; background: #f5f5f7; border-radius: 8px; font-size: 10.5pt; }
  .sign-grid { display: flex; gap: 32px; margin-top: 16px; }
  .sign-box { flex: 1; }
  .sign-img { height: 80px; border-bottom: 1px solid #333; display: flex; align-items: flex-end; }
  .sign-img img { max-height: 78px; max-width: 100%; }
  .sign-line { font-size: 10pt; margin-top: 4px; }
  .sign-cap { font-size: 9pt; color: #777; }
</style>
</head>
<body>
  <div class="doc">${body}</div>
</body>
</html>`;
}
