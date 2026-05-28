"use client";

import { useMemo, useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Loader2, Eraser, Check, ExternalLink, ArrowLeft, ArrowRight } from "lucide-react";
import { submitSignature, renderContractPreview, type SubmitPayload } from "./actions";
import { formatEuro, splitInstallments, isValidIban } from "@/lib/contracts/format";
import { Button } from "@/components/ui/button";

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

  const costText = useMemo(() => buildCostText(costs), [costs]);

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

  const allConsentsGiven =
    acceptContractAndCosts &&
    acceptPrivacy &&
    confirmData &&
    (paymentMethod !== "sepa" || mandate);

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Vielen Dank!</h1>
          <p className="mt-2 text-sm text-gray-500">
            Ihr Vertrag wurde erfolgreich unterschrieben. Sie erhalten in Kürze eine Bestätigung per E-Mail.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-3xl space-y-6 px-4">
        <header className="text-center">
          <h1 className="text-lg font-semibold text-gray-900">swipeflow GmbH — Vertrag</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bitte prüfen Sie den Vertrag, ergänzen Sie Ihre Daten und unterschreiben Sie unten.
          </p>
        </header>

        {/* Vertragstext (isoliert im iframe) */}
        <div className="space-y-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([contractHtml], { type: "text/html" });
                window.open(URL.createObjectURL(blob), "_blank");
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              <ExternalLink className="h-3.5 w-3.5" /> In neuem Tab öffnen
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <iframe title="Vertrag" srcDoc={contractHtml} className="h-[80vh] w-full" />
          </div>
        </div>

        {/* Formular */}
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
              <legend className="text-sm font-semibold text-gray-900">SEPA-Lastschriftmandat</legend>
              <Field label="Kontoinhaber *"><input className={inp} value={holder} onChange={(e) => setHolder(e.target.value)} /></Field>
              <Field label="IBAN *">
                <input className={inp} value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE.. .. .. .." autoComplete="off" />
              </Field>
              <label className="flex items-start gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={mandate} onChange={(e) => setMandate(e.target.checked)} className="mt-0.5" />
                <span>
                  Ich ermächtige die swipeflow GmbH, Zahlungen von meinem Konto per SEPA-Lastschrift einzuziehen,
                  und weise mein Kreditinstitut an, die Lastschriften einzulösen.
                </span>
              </label>
            </fieldset>
          )}

          <fieldset className="space-y-3 border-t border-gray-100 pt-5">
            <legend className="text-sm font-semibold text-gray-900">Bestätigungen</legend>
            <Consent checked={acceptContract} onChange={setAcceptContract}>
              Ich nehme den oben dargestellten Vertrag verbindlich an.
            </Consent>
            <Consent checked={acceptCosts} onChange={setAcceptCosts}>
              Ich habe die im Vertrag genannten Kosten zur Kenntnis genommen und akzeptiere sie.
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

          <button
            onClick={submit}
            disabled={busy || !allConsentsGiven}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Vertrag rechtsverbindlich unterschreiben
          </button>
        </div>
      </div>
    </main>
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
