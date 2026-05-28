"use client";

import { useMemo, useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Loader2, Eraser, Check, ExternalLink, ArrowLeft, ArrowRight, Download } from "lucide-react";
import { submitSignature, renderContractPreview, getSignedContractPdf, type SubmitPayload } from "./actions";
import { formatEuro, splitInstallments, isValidIban } from "@/lib/contracts/format";
import { Button } from "@/components/ui/button";
import { SwipeflowLogo } from "@/app/(dashboard)/swipeflow-logo";

interface Prefill {
  company: string;
  street: string;
  zip: string;
  city: string;
  email: string;
}

interface Costs {
  setupPriceCents: number;
  monthlyMaintCents: number;
  paymentMode: "einmal" | "raten";
  installmentCount: number | null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function PublicContractView({
  token,
  contractHtml,
  paymentMethod,
  prefill,
  costs,
}: {
  token: string;
  contractHtml: string;
  paymentMethod: "sepa" | "rechnung";
  prefill: Prefill;
  costs: Costs;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [html, setHtml] = useState(contractHtml);

  const [company, setCompany] = useState(prefill.company);
  const [street, setStreet] = useState(prefill.street);
  const [zip, setZip] = useState(prefill.zip);
  const [city, setCity] = useState(prefill.city);
  const [email, setEmail] = useState(prefill.email);

  const [holder, setHolder] = useState("");
  const [iban, setIban] = useState("");
  const [mandate, setMandate] = useState(false);

  const [acceptContractAndCosts, setAcceptContractAndCosts] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [confirmData, setConfirmData] = useState(false);

  const sigRef = useRef<SignaturePadHandle>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const costText = useMemo(() => buildCostText(costs), [costs]);

  async function downloadPdf() {
    setPdfBusy(true);
    const res = await getSignedContractPdf(token);
    setPdfBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    window.open(res.url, "_blank");
  }

  function step1Error(): string | null {
    if (!company.trim() || !street.trim() || !zip.trim() || !city.trim()) {
      return "Bitte füllen Sie die vollständige Rechnungsanschrift aus.";
    }
    if (!EMAIL_RE.test(email.trim())) {
      return "Bitte geben Sie eine gültige E-Mail-Adresse an.";
    }
    if (paymentMethod === "sepa") {
      if (!holder.trim()) return "Bitte geben Sie den Kontoinhaber an.";
      if (!isValidIban(iban)) return "Bitte geben Sie eine gültige IBAN an.";
    }
    return null;
  }

  async function goToStep2() {
    const err = step1Error();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setBusy(true);
    const res = await renderContractPreview(token, {
      billing_company: company,
      billing_street: street,
      billing_zip: zip,
      billing_city: city,
      sepa_account_holder: paymentMethod === "sepa" ? holder : undefined,
      sepa_iban: paymentMethod === "sepa" ? iban : undefined,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setHtml(res.html);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    setError(null);
    // Konkretes Feedback, welche Pflichtangaben fehlen (statt nur deaktiviertem Button).
    const missing: string[] = [];
    if (!acceptContractAndCosts) missing.push("Vertrag & Kosten akzeptieren");
    if (!acceptPrivacy) missing.push("Datenschutz");
    if (!confirmData) missing.push("Richtigkeit der Angaben");
    if (paymentMethod === "sepa" && !mandate) missing.push("SEPA-Mandat");
    if (missing.length > 0) {
      setError(`Bitte bestätigen Sie: ${missing.join(", ")}.`);
      return;
    }
    const sigData = sigRef.current?.toDataUrl();
    if (!sigData || sigRef.current?.isEmpty()) {
      setError("Bitte unterschreiben Sie im Unterschriftsfeld.");
      return;
    }
    const payload: SubmitPayload = {
      billing_company: company,
      billing_street: street,
      billing_zip: zip,
      billing_city: city,
      billing_email: email,
      signature_data_url: sigData,
      // Ein Häkchen deckt Vertragsannahme UND Kostenakzeptanz ab.
      accept_contract: acceptContractAndCosts,
      accept_costs: acceptContractAndCosts,
      accept_privacy: acceptPrivacy,
      confirm_data_correct: confirmData,
    };
    if (paymentMethod === "sepa") {
      payload.sepa_account_holder = holder;
      payload.sepa_iban = iban;
      payload.mandate_accepted = mandate;
    }
    setBusy(true);
    const res = await submitSignature(token, payload);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-6">
        <SwipeflowLogo className="h-7 w-auto text-[#020f13]" />
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <Check className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Vielen Dank!</h1>
          <p className="mt-2 text-sm text-gray-500">
            Ihr Vertrag wurde erfolgreich unterschrieben. Sie erhalten in Kürze eine Bestätigung per E-Mail.
          </p>
          <div className="mt-5">
            <Button onClick={downloadPdf} busy={pdfBusy} size="md" className="w-full">
              <Download className="h-4 w-4" /> Vertrag als PDF herunterladen
            </Button>
          </div>
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        </div>
        <BrandFooter />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-3xl space-y-6 px-4">
        <header className="flex flex-col items-center text-center">
          <SwipeflowLogo className="h-8 w-auto text-[#020f13]" />
          <p className="mt-3 text-sm text-gray-500">
            {step === 1
              ? "Schritt 1 von 2 — Bitte ergänzen Sie Ihre Daten."
              : "Schritt 2 von 2 — Bitte prüfen Sie den Vertrag und unterschreiben Sie."}
          </p>
          <StepDots step={step} />
        </header>

        {step === 1 ? (
          <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-gray-900">Rechnungsanschrift</legend>
              <Field label="Firma / Name *"><input className={inp} value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
              <Field label="Straße & Hausnummer *"><input className={inp} value={street} onChange={(e) => setStreet(e.target.value)} /></Field>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1"><Field label="PLZ *"><input className={inp} value={zip} onChange={(e) => setZip(e.target.value)} /></Field></div>
                <div className="col-span-2"><Field label="Ort *"><input className={inp} value={city} onChange={(e) => setCity(e.target.value)} /></Field></div>
              </div>
              <Field label="E-Mail *"><input type="email" className={inp} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            </fieldset>

            {paymentMethod === "sepa" && (
              <fieldset className="space-y-4 border-t border-gray-100 pt-5">
                <legend className="text-sm font-semibold text-gray-900">Bankverbindung (SEPA)</legend>
                <Field label="Kontoinhaber *"><input className={inp} value={holder} onChange={(e) => setHolder(e.target.value)} /></Field>
                <Field label="IBAN *">
                  <input className={inp} value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE.. .. .. .." autoComplete="off" />
                </Field>
              </fieldset>
            )}

            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <Button onClick={goToStep2} busy={busy} size="md" className="w-full">
              Weiter <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            {/* Vertragstext mit den eingegebenen Daten (isoliert im iframe) */}
            <div className="space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([html], { type: "text/html" });
                    window.open(URL.createObjectURL(blob), "_blank");
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> In neuem Tab öffnen
                </button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <iframe title="Vertrag" srcDoc={html} className="h-[80vh] w-full" />
              </div>
            </div>

            <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              {paymentMethod === "sepa" && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-gray-900">SEPA-Lastschriftmandat</legend>
                  <label className="flex items-start gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={mandate} onChange={(e) => setMandate(e.target.checked)} className="mt-0.5" />
                    <span>
                      Ich ermächtige die swipeflow GmbH, Zahlungen von meinem Konto per SEPA-Lastschrift einzuziehen,
                      und weise mein Kreditinstitut an, die Lastschriften einzulösen.
                    </span>
                  </label>
                </fieldset>
              )}

              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Kostenübersicht</p>
                <dl className="mt-2 space-y-1 text-sm text-gray-700">
                  <div className="flex justify-between gap-4">
                    <dt>Einmalige Herstellung</dt>
                    <dd className="font-medium text-gray-900">{formatEuro(costs.setupPriceCents)} netto</dd>
                  </div>
                  {costs.monthlyMaintCents > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt>Wartung &amp; Hosting</dt>
                      <dd className="font-medium text-gray-900">{formatEuro(costs.monthlyMaintCents)} netto / Monat</dd>
                    </div>
                  )}
                </dl>
                <p className="mt-2 text-[11px] text-gray-400">zzgl. gesetzl. MwSt.</p>
              </div>

              <fieldset className="space-y-3 border-t border-gray-100 pt-5">
                <legend className="text-sm font-semibold text-gray-900">Bestätigungen</legend>
                <Consent checked={acceptContractAndCosts} onChange={setAcceptContractAndCosts}>
                  Ich nehme den oben dargestellten Vertrag verbindlich an und akzeptiere die genannten Kosten:{" "}
                  {costText}
                </Consent>
                <Consent checked={acceptPrivacy} onChange={setAcceptPrivacy}>
                  Ich habe die{" "}
                  <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 underline">
                    Datenschutzerklärung
                  </a>{" "}
                  gelesen und stimme der Verarbeitung meiner Daten zu.
                </Consent>
                <Consent checked={confirmData} onChange={setConfirmData}>
                  Ich bestätige die Richtigkeit meiner Angaben.
                </Consent>
              </fieldset>

              <fieldset className="space-y-3 border-t border-gray-100 pt-5">
                <legend className="text-sm font-semibold text-gray-900">Unterschrift</legend>
                <SignaturePad ref={sigRef} />
              </fieldset>

              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <button
                  onClick={submit}
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Vertrag rechtsverbindlich unterschreiben
                </button>
                <button
                  type="button"
                  onClick={() => { setError(null); setStep(1); }}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" /> Zurück
                </button>
              </div>
            </div>
          </>
        )}

        <BrandFooter />
      </div>
    </main>
  );
}

/** Baut den Kostentext für den Zustimmungspunkt (Einmal-/Ratenzahlung). */
function buildCostText(costs: Costs): string {
  const setup = formatEuro(costs.setupPriceCents);
  const parts: string[] = [];
  if (costs.paymentMode === "raten" && costs.installmentCount && costs.installmentCount >= 2) {
    const { base, last } = splitInstallments(costs.setupPriceCents, costs.installmentCount);
    const rate =
      base === last
        ? `${costs.installmentCount} × ${formatEuro(base)}`
        : `${costs.installmentCount - 1} × ${formatEuro(base)} + letzte Rate ${formatEuro(last)}`;
    parts.push(`Herstellung ${setup} netto (zahlbar in ${rate})`);
  } else {
    parts.push(`Herstellung ${setup} netto`);
  }
  if (costs.monthlyMaintCents > 0) {
    parts.push(
      `Wartung/Hosting ${formatEuro(costs.monthlyMaintCents)} netto/Monat (${formatEuro(costs.monthlyMaintCents * 12)} jährlich im Voraus)`,
    );
  }
  return parts.join("; ") + ". Alle Preise zzgl. gesetzl. MwSt.";
}

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="mt-3 flex items-center justify-center gap-2">
      <span className={`h-2 w-2 rounded-full ${step === 1 ? "bg-primary" : "bg-gray-300"}`} />
      <span className={`h-2 w-2 rounded-full ${step === 2 ? "bg-primary" : "bg-gray-300"}`} />
    </div>
  );
}

function BrandFooter() {
  return (
    <footer className="pt-2 text-center text-xs text-gray-400">
      <p>swipeflow GmbH · Ringstraße 6 · 32339 Espelkamp</p>
      <p className="mt-1">
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 hover:underline">
          Datenschutzerklärung
        </a>
      </p>
    </footer>
  );
}

const inp = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none";

// Öffentliche Datenschutzerklärung — bei Bedarf anpassen.
const PRIVACY_URL = "https://swipeflow.agency/datenschutz";

function Consent({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

// ─── Signatur-Pad (eigenes HTML5-Canvas, keine Dependency) ──────────

interface SignaturePadHandle {
  toDataUrl: () => string;
  isEmpty: () => boolean;
  clear: () => void;
}

const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty.current = false;
    }
  };

  useImperativeHandle(ref, () => ({
    toDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? "",
    isEmpty: () => !dirty.current,
    clear,
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // HiDPI-Skalierung anhand der angezeigten Größe.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#111";
    }
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  }

  function end() {
    drawing.current = false;
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-40 w-full touch-none rounded-xl border border-dashed border-gray-300 bg-gray-50"
      />
      <button
        type="button"
        onClick={clear}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        <Eraser className="h-3.5 w-3.5" /> Löschen
      </button>
    </div>
  );
});
