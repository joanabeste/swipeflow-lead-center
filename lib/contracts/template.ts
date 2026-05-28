// Vertrags-Template: rendert den Dienstleistungs- & Auftragsverarbeitungsvertrag
// (Webdesign) als vollständiges HTML-Dokument. Einzige Quelle der Wahrheit für
// die Lese-Ansicht (öffentliche Route) und das finale PDF.
//
// Bei jeder inhaltlichen Änderung am Vertragstext TEMPLATE_VERSION erhöhen —
// die Version wird beim Versand in terms_snapshot eingefroren.

import { formatEuro, splitInstallments } from "./format";

export const TEMPLATE_VERSION = "webdesign-v3";

// Markenlogo (swipeflow „s") als Inline-SVG — muss inline sein, da das PDF via
// Headless-Chromium aus reinem HTML (setContent, ohne Base-URL) gerendert wird.
const LOGO_SVG = `<svg viewBox="40 20 280 660" width="34" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="700" rx="64" fill="#020f13"/><path fill="#ffffff" d="m 69.734727,636.18159 c -4.735986,-0.17253 -5.050722,-0.22499 -6.29411,-1.04902 -1.464439,-0.97053 -2.634939,-2.41801 -3.309474,-4.09259 C 59.744099,630.07911 59.68,588.40532 59.68,337.73224 V 45.544498 l 1.170094,-1.762285 c 1.258386,-1.895262 3.581608,-3.660169 5.195905,-3.947231 0.546701,-0.09722 15.960219,-0.135858 34.252261,-0.08587 l 33.25826,0.09089 0.41179,2.438041 c 0.90171,5.338635 2.85448,9.085061 6.55634,12.578488 2.93255,2.767437 6.3967,4.61626 10.83535,5.782861 l 3.04,0.798995 42.72,-0.0014 c 41.80187,-0.0014 42.77846,-0.01538 45.44,-0.650193 1.496,-0.356817 4.07337,-1.305416 5.72749,-2.107998 2.5232,-1.224255 3.45099,-1.90526 5.76155,-4.229 4.20585,-4.229835 6.14147,-7.958157 6.63561,-12.78125 l 0.2137,-2.085778 33.84802,0.174737 33.84803,0.174737 1.73703,0.795239 c 1.85941,0.851266 2.99584,2.087766 4.04544,4.401656 l 0.64907,1.430899 0.009,291.359994 c 0.008,275.66461 -0.0213,291.44338 -0.54626,292.90801 -0.73177,2.04156 -2.29596,3.82136 -4.16915,4.74384 l -1.51914,0.74814 -127.04,0.0216 c -69.872,0.0119 -129.283373,-0.0601 -132.025273,-0.16 z M 219.73758,581.44982 c 6.28789,-1.32738 10.96832,-3.79311 15.16374,-7.98853 5.25649,-5.25649 7.95384,-11.39659 9.77939,-22.26131 0.73449,-4.37128 0.73035,-14.083 -0.008,-18.88 -1.84637,-11.99497 -6.63255,-21.04325 -13.59417,-25.6998 -5.06882,-3.39048 -11.10052,-4.71966 -17.95743,-3.95721 -7.53142,0.83745 -13.09179,3.939 -17.44587,9.7312 -1.67022,2.22189 -3.94424,6.74633 -4.93199,9.81281 -1.70753,5.30105 -3.07899,13.9637 -3.56557,22.52136 -0.69806,12.27716 -3.18119,17.04594 -9.6208,18.47644 -2.53377,0.56285 -4.90752,0.28546 -7.33577,-0.85724 -3.51375,-1.65352 -5.82429,-4.52049 -7.48668,-9.28963 -1.77335,-5.08747 -1.93838,-13.48447 -0.3685,-18.75019 2.02853,-6.80413 4.9741,-10.20714 9.91111,-11.45029 L 173.76,522.484 v -8.64796 -8.64796 l -2.28478,0.21234 c -3.64996,0.33923 -8.9624,2.41145 -12.74422,4.97112 -2.03896,1.38004 -5.30906,4.67639 -6.7881,6.84261 -4.47794,6.5584 -6.61462,15.77937 -6.24388,26.94583 0.50849,15.31554 5.23858,26.29866 13.77109,31.97599 5.3183,3.53867 9.91042,4.80736 16.52989,4.56678 5.10389,-0.18549 7.0843,-0.65894 11.2,-2.67756 2.52164,-1.23679 3.47651,-1.93542 5.6,-4.09725 6.46707,-6.58385 9.41082,-15.62787 10.56017,-32.44374 0.8681,-12.70119 3.18453,-18.24633 8.70652,-20.84197 1.69244,-0.79554 4.99097,-0.8576 7.47523,-0.14064 5.6095,1.61891 8.82509,6.79968 10.24417,16.50477 1.06527,7.28548 -1.03896,17.34542 -4.59841,21.98408 -2.23836,2.91702 -6.91407,5.48954 -9.97759,5.48954 H 214.08 v 8.8 8.8 l 1.36,-0.005 c 0.748,-0.003 2.68191,-0.28407 4.29758,-0.62514 z M 196.64,485.32544 l 47.68,-15.4635 -0.11618,-6.53098 c -0.0639,-3.59204 -0.17685,-6.63325 -0.25101,-6.75824 -0.29588,-0.4987 -35.81551,-11.50793 -56.5902,-17.54001 -4.92657,-1.43046 -8.99767,-2.64112 -9.0469,-2.69035 -0.0492,-0.0492 2.2536,-0.77661 5.11739,-1.6164 27.48978,-8.06122 59.05345,-17.69635 60.53546,-18.47907 0.57165,-0.3019 0.59601,-0.61519 0.40161,-5.16415 -0.27582,-6.45432 -0.50476,-8.16726 -1.13634,-8.50196 -0.49901,-0.26446 -37.0101,-12.14819 -76.03383,-24.7477 l -19.2,-6.19907 -0.20214,0.82299 c -0.26732,1.08838 -0.33421,15.02123 -0.0782,16.30102 0.19691,0.98459 0.28493,1.02595 6.53428,3.07078 12.41136,4.06108 20.88235,6.57227 39.98611,11.8537 10.648,2.94376 19.53625,5.44707 19.75166,5.56293 0.21541,0.11586 -7.12859,2.33496 -16.32,4.93132 -34.68478,9.79767 -49.23436,14.13919 -49.60632,14.80227 -0.4414,0.78686 -0.71837,12.70719 -0.32954,14.18272 l 0.28506,1.08176 16.94957,4.86999 c 9.32226,2.67849 24.25499,6.93942 33.18383,9.46873 8.92884,2.52931 16.05684,4.69542 15.84,4.81359 -0.3631,0.19786 -19.494,5.66197 -33.51426,9.57223 -7.17355,2.00071 -15.9924,4.67412 -25.48267,7.72501 l -7.08267,2.27691 -0.19733,1.43967 c -0.25673,1.87304 -0.24946,13.95231 0.009,15.51822 0.153,0.92575 0.32035,1.16737 0.71648,1.03448 0.28427,-0.0954 21.97285,-7.13197 48.19685,-15.63689 z m -71.11672,-121.2892 c 4.51694,-1.06291 7.28882,-5.01485 7.26627,-10.35969 -0.0278,-6.58504 -3.4665,-10.28944 -10.06965,-10.84761 -1.94729,-0.16461 -2.46354,-0.0907 -3.69188,0.52843 -2.51296,1.26665 -4.04729,2.75947 -5.16066,5.02104 -0.94199,1.91345 -1.04252,2.39159 -1.02435,4.87163 0.0426,5.81627 3.3376,10.19503 8.20678,10.90617 2.4282,0.35464 2.46023,0.35378 4.47349,-0.11997 z m 118.24186,-10.51625 -0.0851,-8.72 -48.56,-0.081 -48.56,-0.081 v 8.80103 8.80103 h 48.64514 48.64515 z M 272,316.95999 v -8.8 h -10.02782 c -5.51529,0 -14.57262,-0.0949 -20.12738,-0.211 l -10.09957,-0.211 2.72546,-2.57988 c 4.02554,-3.81051 6.9806,-8.46721 8.34992,-13.15812 4.77325,-16.3519 2.54331,-32.97663 -6.13797,-45.76 -2.36777,-3.48659 -7.80438,-9.00053 -11.08264,-11.24027 -6.08061,-4.15435 -14.82188,-7.38032 -22.88,-8.44387 -4.00554,-0.52868 -11.81719,-0.45257 -15.84,0.15433 -13.55577,2.04506 -24.31643,8.11478 -31.50307,17.76981 -4.35709,5.85363 -6.78234,11.39706 -8.53999,19.52 -0.99647,4.60515 -1.08084,15.71299 -0.15678,20.64 1.8886,10.06989 5.53056,17.1222 11.15466,21.6 l 1.80864,1.44 -2.14173,0.20025 c -1.17795,0.11014 -3.90573,0.21814 -6.06173,0.24 l -3.92,0.0397 v 8.8 8.8 H 209.76 272 Z m -81.6226,-9.13006 c -2.81031,-0.32873 -7.76488,-1.66973 -10.73044,-2.9043 -6.41974,-2.67254 -12.43169,-8.69611 -15.55552,-15.58556 -3.96773,-8.75064 -3.60307,-20.52043 0.90423,-29.1848 3.20248,-6.15614 9.44868,-11.42439 16.66961,-14.0597 2.99916,-1.09456 10.46812,-2.57558 12.98894,-2.57558 10.23884,0 22.07304,4.83167 27.30256,11.14709 3.56374,4.30374 5.77526,8.5466 7.03297,13.49291 0.83659,3.29014 0.84888,10.56141 0.0243,14.39497 -1.58446,7.36665 -5.79647,14.28402 -11.25409,18.48255 -2.85146,2.19363 -8.5349,4.98916 -11.84,5.82378 -4.71768,1.19134 -10.53784,1.55406 -15.5426,0.96864 z M 203.68,217.08447 c 8.45888,-1.24512 14.67751,-3.60547 21.44,-8.13779 7.5397,-5.05321 14.79386,-15.15746 18.02487,-25.10669 1.71526,-5.28176 2.13795,-8.51958 2.10965,-16.16 -0.0216,-5.82482 -0.13422,-7.38941 -0.73451,-10.20147 -3.49368,-16.36621 -12.0247,-27.53757 -26.28001,-34.41362 l -3.68,-1.77505 -0.22156,1.19507 c -0.27842,1.50179 -0.3204,13.1131 -0.0554,15.31879 0.1766,1.46982 0.32017,1.71312 1.35722,2.29984 5.0982,2.88438 10.19793,9.38051 12.36429,15.74987 1.87384,5.50932 2.42486,13.12413 1.31395,18.15796 -2.44861,11.09531 -9.87249,20.39079 -19.10186,23.91753 -1.99236,0.76132 -6.32761,1.82454 -9.33666,2.2898 l -1.2,0.18555 v -40.81671 -40.8167 l -1.0185,-0.2237 c -1.89929,-0.41716 -9.93388,-0.21792 -13.0615,0.32389 -6.24399,1.08167 -12.97435,3.84212 -18.75726,7.69327 -9.93761,6.61798 -16.2763,15.82243 -19.28268,28.00051 -1.21816,4.93447 -1.6419,8.33374 -1.63381,13.10678 0.018,10.60752 3.02937,20.69816 8.81005,29.52082 6.32176,9.64847 17.73024,17.13664 29.86366,19.60157 5.41909,1.1009 12.80988,1.21342 19.08004,0.29048 z m -21.64516,-18.69956 c -12.56415,-4.09745 -19.58844,-13.99218 -20.32091,-28.62492 -0.79894,-15.96075 6.55471,-27.92202 19.72607,-32.08594 1.144,-0.36166 2.476,-0.74502 2.96,-0.85191 l 0.88,-0.19434 -0.0429,21.3661 c -0.0236,11.75135 -0.1316,25.8496 -0.24,31.32944 L 184.8,199.28669 Z"/></svg>`;

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

  const hostingZusatz =
    input.monthlyMaintCents > 0
      ? ` Die Wartungs- und Hostingpauschale wird unabhängig hiervon einmal jährlich im Voraus abgerechnet.`
      : "";
  return satz + hostingZusatz;
}

// § 3 Abs. 3: Wartungs-/Hostingvergütung. Zahlungsart folgt der vereinbarten
// Methode (SEPA-Lastschrift vs. Rechnung) — sonst widerspräche der Text dem
// SEPA-Mandat. Bei 0 € entfällt die Pauschale (deckungsgleich mit Kostenübersicht).
function wartungHostingVerguetung(input: ContractRenderInput): string {
  if (input.monthlyMaintCents <= 0) {
    return `(3) Für Wartung und Hosting wird im Rahmen dieses Vertrags keine gesonderte monatliche Pauschale berechnet.`;
  }
  const betrag = formatEuro(input.monthlyMaintCents);
  const method =
    input.paymentMethod === "sepa"
      ? "per SEPA-Lastschrift eingezogen"
      : "per Rechnung gestellt";
  return `(3) Der Auftraggeber zahlt für Wartung und Hosting eine monatliche Pauschale von ${betrag} netto. Die Abrechnung erfolgt einmal jährlich im Voraus und wird ${method}.`;
}

function kostenuebersicht(input: ContractRenderInput): string {
  let herstellung = `${formatEuro(input.setupPriceCents)} netto`;
  if (input.paymentMode === "raten" && input.installmentCount && input.installmentCount > 1) {
    const { base, last } = splitInstallments(input.setupPriceCents, input.installmentCount);
    const rate =
      base === last
        ? `${input.installmentCount} × ${formatEuro(base)}`
        : `${input.installmentCount - 1} × ${formatEuro(base)} + letzte Rate ${formatEuro(last)}`;
    herstellung += ` (zahlbar in ${rate})`;
  }
  const wartung =
    input.monthlyMaintCents > 0
      ? `${formatEuro(input.monthlyMaintCents)} netto / Monat (${formatEuro(input.monthlyMaintCents * 12)} jährlich im Voraus)`
      : "entfällt";
  const method = input.paymentMethod === "sepa" ? "SEPA-Lastschrift" : "Rechnung";
  return `
    <h3>Kostenübersicht</h3>
    <table class="kv costs">
      <tr><td>Einmalige Herstellung der Webseite</td><td>${herstellung}</td></tr>
      <tr><td>Wartung &amp; Hosting</td><td>${wartung}</td></tr>
      <tr><td>Zahlungsart (Erstellung)</td><td>${method}</td></tr>
    </table>
    <p class="muted">Alle Preise verstehen sich zzgl. der jeweils geltenden gesetzlichen Mehrwertsteuer.</p>
  `;
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
    <p>
      Die Vorabankündigung (Pre-Notification) über Betrag und Fälligkeit eines Einzugs
      erfolgt mit einer auf mindestens einen Tag verkürzten Frist, in der Regel mit der
      jeweiligen Rechnungsstellung.
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

// Widerrufsbelehrung (Fernabsatz, Dienstleistung) — gilt nur für Verbraucher
// (§ 13 BGB). Über-inklusiv für alle Verträge gerendert und klar auf Verbraucher
// eingegrenzt, sodass Unternehmer hieraus kein Widerrufsrecht ableiten.
// HINWEIS: Vor dem Produktiveinsatz anwaltlich prüfen lassen.
function widerrufSection(): string {
  const email = (
    process.env.CONTRACTS_WIDERRUF_EMAIL ||
    process.env.CENTRAL_SMTP_FROM_EMAIL ||
    ""
  ).trim();
  const kontakt = `swipeflow GmbH, Ringstraße 6, 32339 Espelkamp${email ? `, E-Mail: ${esc(email)}` : ""}`;
  return `
    <h2>Teil III – Widerrufsbelehrung für Verbraucher</h2>
    <p class="muted">Die folgende Widerrufsbelehrung gilt nur, sofern Sie den Vertrag als Verbraucher im Sinne des § 13 BGB abschließen, also zu Zwecken, die überwiegend weder Ihrer gewerblichen noch Ihrer selbständigen beruflichen Tätigkeit zugerechnet werden können.</p>

    <h3>Widerrufsrecht</h3>
    <p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsschlusses.</p>
    <p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${kontakt}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das unten stehende Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.</p>
    <p>Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.</p>

    <h3>Folgen des Widerrufs</h3>
    <p>Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.</p>
    <p>Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.</p>

    <h3>Muster-Widerrufsformular</h3>
    <p class="muted">(Wenn Sie den Vertrag widerrufen wollen, füllen Sie bitte dieses Formular aus und senden Sie es zurück.)</p>
    <div class="widerruf-form">
      <p>An ${kontakt}:</p>
      <p>Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: Erstellung, Hosting und Wartung einer Webseite.</p>
      <p>Bestellt am (*) / erhalten am (*): ____________________</p>
      <p>Name des/der Verbraucher(s): ____________________</p>
      <p>Anschrift des/der Verbraucher(s): ____________________</p>
      <p>Datum und Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier): ____________________</p>
      <p class="muted">(*) Unzutreffendes streichen.</p>
    </div>
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
          <div class="sign-cap">Dienstleister</div>
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

  const body = `
    <div class="letterhead">
      ${LOGO_SVG}
      <div class="lh-name">swipeflow GmbH</div>
    </div>

    <h1>Dienstleistungs- und Auftragsverarbeitungsvertrag</h1>

    <p class="parties">
      <strong>swipeflow GmbH</strong><br />
      Ringstraße 6<br />
      32339 Espelkamp
    </p>
    <p>– im Folgenden „Dienstleister“ genannt –</p>
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
    <p>${wartungHostingVerguetung(input)}</p>
    <p>(4) Änderungen, die den Rahmen der laufenden Pflege übersteigen – insbesondere neue Unterseiten, strukturelle Anpassungen, Designänderungen oder zusätzliche Funktionen – werden nach Aufwand des Dienstleisters abgerechnet.</p>
    <p>(5) Kleine Änderungen sind solche, die innerhalb von 30 Minuten erledigt werden können. Mehrere kleine Änderungen können nach Ermessen des Dienstleisters zusammengefasst werden.</p>
    <p>(6) Der Dienstleister informiert den Auftraggeber vorab, falls eine gewünschte Änderung voraussichtlich über den Leistungsumfang der Wartung hinausgeht.</p>

    <h3>§ 4 Vergütung und Zahlungsbedingungen</h3>
    <p>(1) Die Vergütung für die Erstellung der Webseite beträgt ${websitekosten} netto.</p>
    <p>(2) ${zahlungsbedingungen(input)}</p>
    <p>(3) Zusatzleistungen, die nicht im Angebot enthalten sind, werden gesondert nach Aufwand berechnet.</p>
    <p>(4) Rechnungen sind innerhalb von 14 Tagen nach Zugang ohne Abzug zahlbar${input.paymentMethod === "sepa" ? ", soweit der Rechnungsbetrag nicht per SEPA-Lastschrift eingezogen wird" : ""}.</p>
    <p>(5) Alle Preise verstehen sich zzgl. der jeweils geltenden gesetzlichen Mehrwertsteuer.</p>

    ${kostenuebersicht(input)}

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

    ${widerrufSection()}

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
  .letterhead { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; margin-bottom: 18px; border-bottom: 2px solid #d2a966; }
  .letterhead svg { display: block; border-radius: 8px; }
  .letterhead .lh-name { font-size: 13pt; font-weight: 600; letter-spacing: 0.2px; color: #020f13; }
  h1 { font-size: 20pt; margin: 0 0 16px; }
  h2 { font-size: 14pt; margin: 28px 0 8px; border-bottom: 2px solid #d2a966; padding-bottom: 4px; }
  h3 { font-size: 11.5pt; margin: 18px 0 4px; }
  p { margin: 6px 0; }
  p.muted { color: #777; font-size: 9.5pt; margin-top: 4px; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { margin: 2px 0; }
  .parties { margin: 10px 0; }
  table.kv { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.kv td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; font-size: 10.5pt; }
  table.kv td:first-child { width: 40%; color: #555; }
  table.costs { margin: 8px 0; }
  table.costs td { background: #faf6ee; }
  table.costs td:last-child { font-weight: 600; color: #020f13; }
  .widerruf-form { margin: 10px 0; padding: 12px 14px; background: #f5f5f7; border-radius: 8px; font-size: 10.5pt; }
  .widerruf-form p { margin: 8px 0; }
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
