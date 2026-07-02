import { formatAmount } from "@/lib/deals/types";
import { esc, LOGO_SVG } from "@/lib/contracts/template";
import type {
  DealListGroup,
  KpiTotals,
  RepRow,
  SalesKpiReport,
  SettingAppointment,
  StageVolume,
  VerticalKey,
} from "./kpi-report";

/**
 * Rendert den Sales-KPI-Report als vollständiges A4-HTML-Dokument. Wird von
 * `renderHtmlToPdf` (Headless-Chromium) zu PDF gerendert — daher alles inline
 * (CSS im <style>, Logo als Inline-SVG, keine externen Assets/Base-URL).
 *
 * Charts sind reines HTML/CSS (Balken via prozentualer Breite/Höhe) — Chromium
 * rendert sie nativ, keine Canvas-/Chart-Bibliothek nötig.
 */

const GOLD = "#d2a966";
const GOLD_DARK = "#b8935a";
const REC = "#2f8f9d"; // Recruiting-Akzent (Teal)
const WEB = "#7c5cff"; // Webentwicklung-Akzent (Violett)
const INK = "#1a1712";
const MUTE = "#8a8378";

const nf = new Intl.NumberFormat("de-DE");
const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const num = (n: number) => nf.format(n);
const money = (cents: number) => formatAmount(cents);

const VERTICAL_META: Record<VerticalKey, { label: string; color: string }> = {
  recruiting: { label: "Recruiting", color: REC },
  webdesign: { label: "Webentwicklung", color: WEB },
};

export function renderSalesKpiReportHtml(report: SalesKpiReport, generatedAtIso: string): string {
  const genLabel = new Date(generatedAtIso).toLocaleString("de-DE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });

  const t = report.total;
  const hasUnassigned =
    report.unassigned.anwahlen > 0 ||
    report.unassigned.settingTermine > 0 ||
    report.unassigned.closingTermine > 0 ||
    report.unassigned.closings > 0;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: ${INK};
    font-size: 11px;
    line-height: 1.45;
    background: #fff;
  }
  .section { page-break-inside: avoid; margin-top: 22px; }
  h2 {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .01em;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid ${GOLD};
    display: flex; align-items: center; justify-content: space-between;
  }
  h2 .sub { font-size: 10px; font-weight: 500; color: ${MUTE}; }

  /* Kopf */
  .head { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid #ece7dd; }
  .head .brand { display: flex; align-items: center; gap: 12px; }
  .head .brand .logo { display: flex; }
  .head .eyebrow { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: ${GOLD_DARK}; font-weight: 700; }
  .head h1 { font-size: 22px; font-weight: 800; line-height: 1.1; margin-top: 2px; }
  .head .meta { text-align: right; font-size: 10px; color: ${MUTE}; }
  .head .meta strong { color: ${INK}; font-size: 12px; }

  /* KPI-Karten */
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .kpi { border: 1px solid #ece7dd; border-radius: 10px; padding: 12px 14px; background: linear-gradient(160deg,#fbf8f2,#fff); }
  .kpi .label { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: ${MUTE}; font-weight: 600; }
  .kpi .value { font-size: 24px; font-weight: 800; margin-top: 4px; line-height: 1; }
  .kpi .hint { font-size: 9.5px; color: ${MUTE}; margin-top: 4px; }
  .kpi.accent { background: linear-gradient(160deg,#faf1de,#fff); border-color: ${GOLD}; }

  /* Balken (horizontal) */
  .hbars { display: flex; flex-direction: column; gap: 7px; }
  .hbar { display: grid; grid-template-columns: 130px 1fr 46px; align-items: center; gap: 10px; }
  .hbar .name { font-size: 10.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hbar .track { background: #f2ede3; border-radius: 5px; height: 14px; overflow: hidden; }
  .hbar .fill { height: 100%; border-radius: 5px; }
  .hbar .n { font-size: 10.5px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }

  /* Balken (vertikal, Tagesreihe) */
  .vbars { display: flex; align-items: stretch; gap: 2px; height: 120px; border-bottom: 1px solid #ece7dd; }
  .vbar { flex: 1; display: flex; align-items: flex-end; }
  .vbar .col { width: 72%; margin: 0 auto; background: ${GOLD}; border-radius: 3px 3px 0 0; min-height: 1px; }
  .vscale { display: flex; justify-content: space-between; font-size: 8px; color: ${MUTE}; margin-top: 5px; }

  /* Vertikal-Split (gruppierte Balken) */
  .grp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .grpcol { border: 1px solid #ece7dd; border-radius: 10px; padding: 12px; }
  .grpcol .title { font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  .metric { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; border-top: 1px dashed #efe9de; }
  .metric:first-of-type { border-top: none; }
  .metric .k { color: ${MUTE}; font-size: 10px; }
  .metric .v { font-weight: 700; font-variant-numeric: tabular-nums; }

  /* Tabelle */
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th { text-align: left; font-size: 9px; letter-spacing: .05em; text-transform: uppercase; color: ${MUTE}; font-weight: 700; padding: 6px 8px; border-bottom: 1.5px solid ${GOLD}; }
  thead th.r, tbody td.r { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #f1ece2; }
  tbody tr:nth-child(even) { background: #fcfaf6; }
  tbody td.name { font-weight: 600; }
  tfoot td { padding: 7px 8px; font-weight: 800; border-top: 2px solid ${GOLD}; font-variant-numeric: tabular-nums; }
  tfoot td.r { text-align: right; }

  .foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid #ece7dd; font-size: 9px; color: ${MUTE}; line-height: 1.5; }
  .empty { color: ${MUTE}; font-size: 10px; font-style: italic; padding: 8px 0; }

  /* Deal-Detail-Gruppen */
  .dealgroup { page-break-inside: avoid; margin-top: 14px; }
  .dealgroup:first-of-type { margin-top: 4px; }
  .dealgroup-head { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 700; padding: 5px 8px; background: #f7f2e8; border-radius: 6px; margin-bottom: 4px; }
</style>
</head>
<body>

  <div class="head">
    <div class="brand">
      <span class="logo">${LOGO_SVG}</span>
      <div>
        <div class="eyebrow">Sales-Report</div>
        <h1>${esc(report.monthLabel)}</h1>
      </div>
    </div>
    <div class="meta">
      <div>swipeflow · Vertrieb</div>
      <div>Erstellt: <strong>${esc(genLabel)}</strong></div>
      <div>${report.repCount} aktive Vertriebler</div>
    </div>
  </div>

  <div class="section">
    <div class="kpis">
      ${kpiCard("Anwahlen Gesamt", num(t.anwahlen), "Ausgehende Wählversuche", true)}
      ${kpiCard("Anwahlen pro Kopf", nf1.format(report.anwahlenProKopf), `Ø je Vertriebler (${report.repCount})`)}
      ${kpiCard("Setting Termine", num(t.settingTermine), "Setting-Termine im Monat")}
      ${kpiCard("Closing Termine", num(t.closingTermine), "Closing-Termine im Monat")}
      ${kpiCard("Closings", num(t.closings), "Gewonnene Deals", true)}
      ${kpiCard("Closing-Volumen", money(t.closingVolumeCents), "Umsatz gewonnener Deals")}
    </div>
  </div>

  <div class="section">
    <h2>Anwahlen pro Mitarbeiter</h2>
    ${horizontalBars(
      report.reps.filter((r) => r.anwahlen > 0).map((r) => ({ name: r.name, value: r.anwahlen })),
      GOLD,
      "Keine Anwahlen in diesem Monat.",
    )}
  </div>

  <div class="section">
    <h2>Anwahlen pro Tag <span class="sub">${esc(report.monthLabel)}</span></h2>
    ${dayBars(report.callsPerDay)}
  </div>

  <div class="section">
    <h2>Termine &amp; Closings nach Bereich</h2>
    <div class="grp">
      ${verticalCol("recruiting", report.byVertical.recruiting)}
      ${verticalCol("webdesign", report.byVertical.webdesign)}
      ${gesamtCol(report.total)}
    </div>
  </div>

  <div class="section">
    <h2>Closing-Volumen nach Bereich</h2>
    ${horizontalBars(
      [
        { name: "Recruiting", value: report.byVertical.recruiting.closingVolumeCents, color: REC, display: money(report.byVertical.recruiting.closingVolumeCents) },
        { name: "Webentwicklung", value: report.byVertical.webdesign.closingVolumeCents, color: WEB, display: money(report.byVertical.webdesign.closingVolumeCents) },
        { name: "Gesamt", value: report.total.closingVolumeCents, color: GOLD_DARK, display: money(report.total.closingVolumeCents) },
      ],
      GOLD,
      "Kein Closing-Volumen in diesem Monat.",
      140,
    )}
  </div>

  <div class="section">
    <h2>Leistung je Mitarbeiter</h2>
    ${repTable(report.reps, report.total)}
  </div>

  <div class="section">
    <h2>Deals-Pipeline <span class="sub">Stand: ${esc(genLabel)}</span></h2>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
      ${kpiCard("Offenes Volumen", money(report.dealsSnapshot.openVolumeCents), `${num(report.dealsSnapshot.openCount)} offene Deals`, true)}
      ${kpiCard("Gewichteter Forecast", money(report.dealsSnapshot.weightedForecastCents), "Volumen × Wahrscheinlichkeit")}
      ${kpiCard("Ø Deal-Größe", money(report.dealsSnapshot.avgDealSizeCents), "über alle Deals")}
      ${kpiCard("Gewinn-Quote", `${num(report.dealsSnapshot.winRatePct)} %`, `${num(report.dealsSnapshot.wonCountAll)} / ${num(report.dealsSnapshot.wonCountAll + report.dealsSnapshot.lostCountAll)} abgeschlossen`)}
      ${kpiCard("Gewonnen gesamt", num(report.dealsSnapshot.wonCountAll), "alle Zeit")}
      ${kpiCard("Verloren gesamt", num(report.dealsSnapshot.lostCountAll), "alle Zeit")}
    </div>
    <div style="margin-top:14px">
      <p style="font-size:11px;font-weight:700;margin-bottom:8px">Volumen pro Stage</p>
      ${stageVolumeBars(report.dealsByStage)}
    </div>
  </div>

  <div class="section">
    <h2>Deals im Monat <span class="sub">${esc(report.monthLabel)}</span></h2>
    <div class="grp">
      ${dealsMonthCol("Erstellt", report.dealsMonth.createdCount, report.dealsMonth.createdVolumeCents, GOLD_DARK)}
      ${dealsMonthCol("Gewonnen", report.dealsMonth.wonCount, report.dealsMonth.wonVolumeCents, "#2e9e6b")}
      ${dealsMonthCol("Verloren", report.dealsMonth.lostCount, report.dealsMonth.lostVolumeCents, "#c2543f")}
    </div>
  </div>

  <div class="section">
    <h2>Deals im Detail <span class="sub">offen + im Monat abgeschlossen</span></h2>
    ${dealsDetail(report.dealsList)}
  </div>

  <div class="section">
    <h2>Setting-Termine im Detail <span class="sub">${esc(report.monthLabel)}</span></h2>
    ${settingSection(report.settingList)}
  </div>

  <div class="foot">
    ${
      hasUnassigned
        ? `Hinweis zur Zuordnung: Recruiting + Webentwicklung ergeben nicht zwingend die Gesamtzahl. Anrufe, Termine und Deals tragen keine eigene Bereichs-Kennzeichnung und werden nur über den verknüpften Lead zugeordnet. Nicht eindeutig zuordenbare Datensätze (Lead ohne Bereich bzw. „Sonstiges", Deal ohne Lead-Verknüpfung) zählen nur in <strong>Gesamt</strong> — in diesem Monat: ${num(report.unassigned.anwahlen)} Anwahlen, ${num(report.unassigned.settingTermine)} Setting-Termine, ${num(report.unassigned.closingTermine)} Closing-Termine, ${num(report.unassigned.closings)} Closings. `
        : ""
    }„Setting Termine pro Mitarbeiter" werden dem Vertriebler zugeordnet, der den Lead zuletzt vor dem Termin ausgehend angerufen hat (heuristisch). Alle Zahlen in Europe/Berlin. Termine nach Termin-Datum (Calendly), stornierte Termine ausgeschlossen; Closings nach Abschlussdatum.
  </div>

</body>
</html>`;
}

function kpiCard(label: string, value: string, hint: string, accent = false): string {
  return `<div class="kpi${accent ? " accent" : ""}">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(value)}</div>
    <div class="hint">${esc(hint)}</div>
  </div>`;
}

interface BarItem {
  name: string;
  value: number;
  color?: string;
  display?: string;
}

function horizontalBars(items: BarItem[], defaultColor: string, emptyMsg: string, nameCol?: number): string {
  if (items.length === 0) return `<div class="empty">${esc(emptyMsg)}</div>`;
  const max = Math.max(...items.map((i) => i.value), 1);
  const grid = nameCol ? `style="grid-template-columns:${nameCol}px 1fr 80px"` : "";
  return `<div class="hbars">${items
    .map((i) => {
      const pct = Math.max((i.value / max) * 100, i.value > 0 ? 3 : 0);
      const color = i.color ?? defaultColor;
      const shown = i.display ?? num(i.value);
      return `<div class="hbar" ${grid}>
        <div class="name" title="${esc(i.name)}">${esc(i.name)}</div>
        <div class="track"><div class="fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
        <div class="n">${esc(shown)}</div>
      </div>`;
    })
    .join("")}</div>`;
}

function dayBars(days: Array<{ date: string; count: number }>): string {
  const max = Math.max(...days.map((d) => d.count), 1);
  const total = days.reduce((s, d) => s + d.count, 0);
  if (total === 0) return `<div class="empty">Keine Anwahlen in diesem Monat.</div>`;
  const cols = days
    .map((d) => {
      const h = (d.count / max) * 100;
      return `<div class="vbar"><div class="col" style="height:${h.toFixed(1)}%" title="${esc(d.date)}: ${d.count}"></div></div>`;
    })
    .join("");
  return `<div class="vbars">${cols}</div>
    <div class="vscale"><span>Tag 1</span><span>Spitze: ${num(max)} Anwahlen / Tag</span><span>Tag ${days.length}</span></div>`;
}

function verticalCol(key: VerticalKey, k: KpiTotals): string {
  const meta = VERTICAL_META[key];
  return `<div class="grpcol">
    <div class="title"><span class="dot" style="background:${meta.color}"></span>${esc(meta.label)}</div>
    ${metricRow("Anwahlen", num(k.anwahlen))}
    ${metricRow("Setting Termine", num(k.settingTermine))}
    ${metricRow("Closing Termine", num(k.closingTermine))}
    ${metricRow("Closings", num(k.closings))}
    ${metricRow("Volumen", money(k.closingVolumeCents))}
  </div>`;
}

function gesamtCol(k: KpiTotals): string {
  return `<div class="grpcol" style="border-color:${GOLD};background:linear-gradient(160deg,#faf1de,#fff)">
    <div class="title"><span class="dot" style="background:${GOLD_DARK}"></span>Gesamt</div>
    ${metricRow("Anwahlen", num(k.anwahlen))}
    ${metricRow("Setting Termine", num(k.settingTermine))}
    ${metricRow("Closing Termine", num(k.closingTermine))}
    ${metricRow("Closings", num(k.closings))}
    ${metricRow("Volumen", money(k.closingVolumeCents))}
  </div>`;
}

function metricRow(k: string, v: string): string {
  return `<div class="metric"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;
}

function repTable(reps: RepRow[], total: KpiTotals): string {
  if (reps.length === 0) return `<div class="empty">Keine Vertriebler-Aktivität in diesem Monat.</div>`;
  const rows = reps
    .map(
      (r) => `<tr>
      <td class="name">${esc(r.name)}</td>
      <td class="r">${num(r.anwahlen)}</td>
      <td class="r">${num(r.settingTermine)}</td>
      <td class="r">${num(r.closings)}</td>
      <td class="r">${money(r.closingVolumeCents)}</td>
    </tr>`,
    )
    .join("");
  return `<table>
    <thead><tr>
      <th>Mitarbeiter</th>
      <th class="r">Anwahlen</th>
      <th class="r">Setting-Termine</th>
      <th class="r">Closings</th>
      <th class="r">Volumen</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td>Gesamt</td>
      <td class="r">${num(total.anwahlen)}</td>
      <td class="r">${num(total.settingTermine)}</td>
      <td class="r">${num(total.closings)}</td>
      <td class="r">${money(total.closingVolumeCents)}</td>
    </tr></tfoot>
  </table>`;
}

function stageVolumeBars(stages: StageVolume[]): string {
  const withVolume = stages.filter((s) => s.volumeCents > 0 || s.count > 0);
  if (withVolume.length === 0) return `<div class="empty">Keine Deals in der Pipeline.</div>`;
  return horizontalBars(
    withVolume.map((s) => ({
      name: `${s.label} · ${num(s.count)}`,
      value: s.volumeCents,
      color: s.color,
      display: money(s.volumeCents),
    })),
    GOLD,
    "Keine Deals in der Pipeline.",
    150,
  );
}

function dealsMonthCol(label: string, count: number, volumeCents: number, color: string): string {
  return `<div class="grpcol">
    <div class="title"><span class="dot" style="background:${color}"></span>${esc(label)}</div>
    ${metricRow("Anzahl", num(count))}
    ${metricRow("Volumen", money(volumeCents))}
  </div>`;
}

function dealsDetail(groups: DealListGroup[]): string {
  if (groups.length === 0) return `<div class="empty">Keine offenen oder in diesem Monat abgeschlossenen Deals.</div>`;
  return groups.map(dealGroup).join("");
}

function dealGroup(g: DealListGroup): string {
  const rows = g.items
    .map(
      (d) => `<tr>
      <td class="name">${esc(d.title)}</td>
      <td>${esc(d.company)}</td>
      <td>${esc(d.bereich)}</td>
      <td class="r">${money(d.amountCents)}</td>
      <td>${esc(d.assignee)}</td>
      <td class="r">${d.probabilityPct == null ? "—" : num(d.probabilityPct) + " %"}</td>
      <td>${d.nextStep ? esc(truncate(d.nextStep, 48)) : "—"}</td>
    </tr>`,
    )
    .join("");
  return `<div class="dealgroup">
    <div class="dealgroup-head">
      <span><span class="dot" style="background:${g.stageColor}"></span>${esc(g.stageLabel)} <span style="color:${MUTE}">· ${num(g.count)}</span></span>
      <span>${money(g.volumeCents)}</span>
    </div>
    <table>
      <thead><tr>
        <th>Titel</th><th>Firma</th><th>Bereich</th><th class="r">Betrag</th><th>Vertriebler</th><th class="r">Wahrsch.</th><th>Next Step</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function settingSection(list: SettingAppointment[]): string {
  if (list.length === 0) return `<div class="empty">Keine Setting-Termine in diesem Monat.</div>`;
  const rows = list
    .map(
      (s) => `<tr>
      <td>${esc(formatDay(s.date))}</td>
      <td class="name">${esc(s.company)}</td>
      <td>${esc(s.setter)}</td>
    </tr>`,
    )
    .join("");
  return `<table>
    <thead><tr><th>Datum</th><th>Firma / Lead</th><th>Setter</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** "2026-06-15" → "15.06.2026". */
function formatDay(dateOnly: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : dateOnly;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}
