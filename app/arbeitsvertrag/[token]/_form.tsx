"use client";

import { useRef, useState } from "react";
import { Loader2, Check, ArrowLeft, ArrowRight, Download, ExternalLink } from "lucide-react";
import { SwipeflowLogo } from "@/app/(dashboard)/swipeflow-logo";
import { Button } from "@/components/ui/button";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { isValidIban } from "@/lib/contracts/format";
import type { EmploymentVariant, QuestionnaireData } from "@/lib/employment/types";
import {
  renderEmploymentPreview,
  submitEmploymentSignature,
  submitQuestionnaire,
  getSignedEmploymentPdf,
} from "./actions";

type Phase = "data" | "review" | "questionnaire" | "done";

interface Prefill {
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  email: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const inp = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none";
const PRIVACY_URL = "https://swipeflow.agency/datenschutz";

export function PublicEmploymentView({
  token,
  variant,
  startStep,
  contractHtml,
  prefill,
}: {
  token: string;
  variant: EmploymentVariant;
  startStep: "sign" | "questionnaire";
  contractHtml: string;
  prefill: Prefill;
}) {
  const isWerk = variant === "werkstudent";
  const [phase, setPhase] = useState<Phase>(startStep === "questionnaire" ? "questionnaire" : "data");
  const [html, setHtml] = useState(contractHtml);

  // Mitarbeiterdaten
  // Name wird aus dem Lead vorbefüllt und ist nicht editierbar (nur Anzeige).
  const [firstName] = useState(prefill.firstName);
  const [lastName] = useState(prefill.lastName);
  const [street, setStreet] = useState(prefill.street);
  const [zip, setZip] = useState(prefill.zip);
  const [city, setCity] = useState(prefill.city);
  const [email, setEmail] = useState(prefill.email);

  // Unterschrift + Bestätigungen
  const sigRef = useRef<SignaturePadHandle>(null);
  const [acceptContract, setAcceptContract] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [confirmData, setConfirmData] = useState(false);
  const [werkstudentStatus, setWerkstudentStatus] = useState(false);

  // Personalfragebogen
  const [q, setQ] = useState<QuestionnaireData>({ kinder: [] });
  const [steuerId, setSteuerId] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [svNummer, setSvNummer] = useState("");

  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setQf = (patch: Partial<QuestionnaireData>) => setQ((s) => ({ ...s, ...patch }));

  type Kind = NonNullable<QuestionnaireData["kinder"]>[number];
  const addKind = () => setQf({ kinder: [...(q.kinder ?? []), {}] });
  const updateKind = (i: number, patch: Partial<Kind>) =>
    setQf({ kinder: (q.kinder ?? []).map((k, idx) => (idx === i ? { ...k, ...patch } : k)) });
  const removeKind = (i: number) => setQf({ kinder: (q.kinder ?? []).filter((_, idx) => idx !== i) });

  const employeeFields = () => ({
    first_name: firstName,
    last_name: lastName,
    street,
    zip,
    city,
    email,
  });

  function dataError(): string | null {
    if (!firstName.trim() || !lastName.trim()) return "Bitte Vor- und Nachname angeben.";
    if (!street.trim() || !zip.trim() || !city.trim()) return "Bitte die vollständige Anschrift angeben.";
    if (!EMAIL_RE.test(email.trim())) return "Bitte eine gültige E-Mail-Adresse angeben.";
    return null;
  }

  async function goReview() {
    const err = dataError();
    if (err) return setError(err);
    setError(null);
    setBusy(true);
    const res = await renderEmploymentPreview(token, employeeFields());
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setHtml(res.html);
    setPhase("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function sign() {
    setError(null);
    const missing: string[] = [];
    if (!acceptContract) missing.push("Vertrag annehmen");
    if (!acceptPrivacy) missing.push("Datenschutz");
    if (!confirmData) missing.push("Richtigkeit der Angaben");
    if (isWerk && !werkstudentStatus) missing.push("Werkstudentenstatus");
    if (missing.length) return setError(`Bitte bestätigen: ${missing.join(", ")}.`);

    const sigData = sigRef.current?.toDataUrl();
    if (!sigData || sigRef.current?.isEmpty()) return setError("Bitte im Unterschriftsfeld unterschreiben.");

    setBusy(true);
    const res = await submitEmploymentSignature(token, {
      ...employeeFields(),
      signature_data_url: sigData,
      accept_contract: acceptContract,
      accept_privacy: acceptPrivacy,
      confirm_data_correct: confirmData,
      werkstudent_status: isWerk ? werkstudentStatus : undefined,
    });
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setPhase("questionnaire");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function questionnaireError(): string | null {
    const missing: string[] = [];
    if (!q.geburtsdatum?.trim()) missing.push("Geburtsdatum");
    if (!q.geburtsort?.trim()) missing.push("Geburtsort");
    if (!q.geburtsland?.trim()) missing.push("Geburtsland");
    if (!q.staatsangehoerigkeit?.trim()) missing.push("Staatsangehörigkeit");
    if (!q.familienstand?.trim()) missing.push("Familienstand");
    if (!q.geschlecht?.trim()) missing.push("Geschlecht");
    if (q.sv_nummer_vorhanden !== false && !svNummer.trim()) missing.push("Sozialversicherungsnummer");
    if (!iban.trim()) missing.push("IBAN");
    if (!bic.trim()) missing.push("BIC");
    if (!q.haupt_oder_neben?.trim()) missing.push("Haupt-/Nebenbeschäftigung");
    if (q.weitere_beschaeftigungen && !q.weitere_taetigkeit?.trim()) missing.push("Welche weitere(n) Beschäftigung(en)");
    if (!q.schulabschluss?.trim()) missing.push("Schulabschluss");
    if (!q.berufsausbildung?.trim()) missing.push("Berufsausbildung");
    if (!steuerId.trim()) missing.push("Steuer-ID");
    if (!q.steuerklasse?.trim()) missing.push("Steuerklasse");
    if (!q.kinderfreibetraege?.trim()) missing.push("Kinderfreibeträge");
    if (!q.konfession?.trim()) missing.push("Konfession");
    if (!q.kv_art?.trim()) missing.push("Krankenversicherung");
    if (!q.kv_name?.trim()) missing.push("Name der Krankenkasse / Versicherung");
    (q.kinder ?? []).forEach((k, i) => {
      if (!k.vorname?.trim() || !k.geburtsdatum?.trim()) missing.push(`Kind ${i + 1}: Vorname + Geburtsdatum (oder Zeile entfernen)`);
    });
    if (missing.length) return `Bitte alle Pflichtfelder ausfüllen: ${missing.join(", ")}.`;
    if (!isValidIban(iban)) return "Bitte eine gültige IBAN angeben.";
    return null;
  }

  async function sendQuestionnaire() {
    setError(null);
    const err = questionnaireError();
    if (err) {
      setError(err);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      return;
    }
    setBusy(true);
    const res = await submitQuestionnaire(token, {
      data: q,
      steuer_id: steuerId,
      iban,
      bic,
      sv_nummer: svNummer,
    });
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setPhase("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function downloadPdf() {
    setPdfBusy(true);
    const res = await getSignedEmploymentPdf(token);
    setPdfBusy(false);
    if ("error" in res) return setError(res.error);
    window.open(res.url, "_blank");
  }

  // ─── Done ─────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <Check className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Vielen Dank!</h1>
          <p className="mt-2 text-sm text-gray-500">
            Dein Arbeitsvertrag ist unterschrieben und der Personalfragebogen wurde übermittelt.
          </p>
          <Button onClick={downloadPdf} busy={pdfBusy} size="md" className="mt-5 w-full">
            <Download className="h-4 w-4" /> Vertrag als PDF herunterladen
          </Button>
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        </div>
      </Shell>
    );
  }

  const stepNo = phase === "data" ? 1 : phase === "review" ? 2 : 3;

  return (
    <Shell>
      <header className="flex flex-col items-center text-center">
        <p className="mt-3 text-sm text-gray-500">
          {phase === "data" && "Schritt 1 von 3 — Bitte prüfe deine persönlichen Daten."}
          {phase === "review" && "Schritt 2 von 3 — Bitte prüfe den Vertrag und unterschreibe."}
          {phase === "questionnaire" && "Schritt 3 von 3 — Bitte fülle den Personalfragebogen aus."}
        </p>
        <Dots step={stepNo} />
      </header>

      {phase === "data" && (
        <Card>
          <fieldset className="space-y-4">
            <Legend>Persönliche Daten</Legend>
            <Field label="Name">
              <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {`${firstName} ${lastName}`.trim() || "—"}
              </div>
            </Field>
            <Field label="Straße & Hausnummer *"><input className={inp} value={street} onChange={(e) => setStreet(e.target.value)} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1"><Field label="PLZ *"><input className={inp} value={zip} onChange={(e) => setZip(e.target.value)} /></Field></div>
              <div className="col-span-2"><Field label="Ort *"><input className={inp} value={city} onChange={(e) => setCity(e.target.value)} /></Field></div>
            </div>
            <Field label="E-Mail *"><input type="email" className={inp} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          </fieldset>
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button onClick={goReview} busy={busy} size="md" className="w-full">Weiter <ArrowRight className="h-4 w-4" /></Button>
        </Card>
      )}

      {phase === "review" && (
        <>
          <div className="space-y-2">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                <ExternalLink className="h-3.5 w-3.5" /> In neuem Tab öffnen
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <iframe title="Arbeitsvertrag" srcDoc={html} className="h-[80vh] w-full" />
            </div>
          </div>

          <Card>
            <fieldset className="space-y-3">
              <Legend>Bestätigungen</Legend>
              <Consent checked={acceptContract} onChange={setAcceptContract}>
                Ich nehme den oben dargestellten Arbeitsvertrag verbindlich an.
              </Consent>
              <Consent checked={acceptPrivacy} onChange={setAcceptPrivacy}>
                Ich habe die{" "}
                <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 underline">Datenschutzerklärung</a>{" "}
                gelesen und stimme der Verarbeitung meiner Daten zu.
              </Consent>
              <Consent checked={confirmData} onChange={setConfirmData}>
                Ich bestätige die Richtigkeit meiner Angaben.
              </Consent>
              {isWerk && (
                <Consent checked={werkstudentStatus} onChange={setWerkstudentStatus}>
                  Ich versichere, an einer Hochschule immatrikuliert zu sein, und werde eine aktuelle Immatrikulationsbescheinigung vorlegen.
                </Consent>
              )}
            </fieldset>

            <fieldset className="space-y-3 border-t border-gray-100 pt-5">
              <Legend>Unterschrift</Legend>
              <SignaturePad ref={sigRef} />
            </fieldset>

            {error && <ErrorBox>{error}</ErrorBox>}

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                onClick={sign}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Vertrag rechtsverbindlich unterschreiben
              </button>
              <button
                type="button"
                onClick={() => { setError(null); setPhase("data"); }}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" /> Zurück
              </button>
            </div>
          </Card>
        </>
      )}

      {phase === "questionnaire" && (
        <Card>
          <p className="text-sm text-gray-500">
            Diese Angaben benötigen wir für die Lohnabrechnung (DATEV). Deine sensiblen Daten (Steuer-ID, IBAN, Sozialversicherungsnummer) werden verschlüsselt gespeichert.
          </p>

          <fieldset className="space-y-4">
            <Legend>Persönliche Angaben</Legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Geburtsdatum" req><input type="date" className={inp} value={q.geburtsdatum ?? ""} onChange={(e) => setQf({ geburtsdatum: e.target.value })} /></Field>
              <Field label="Geburtsname (falls abweichend)"><input className={inp} value={q.geburtsname ?? ""} onChange={(e) => setQf({ geburtsname: e.target.value })} /></Field>
              <Field label="Geburtsort" req><input className={inp} value={q.geburtsort ?? ""} onChange={(e) => setQf({ geburtsort: e.target.value })} /></Field>
              <Field label="Geburtsland" req><input className={inp} value={q.geburtsland ?? ""} onChange={(e) => setQf({ geburtsland: e.target.value })} /></Field>
              <Field label="Staatsangehörigkeit" req><input className={inp} value={q.staatsangehoerigkeit ?? ""} onChange={(e) => setQf({ staatsangehoerigkeit: e.target.value })} /></Field>
              <Field label="Familienstand" req>
                <select className={inp} value={q.familienstand ?? ""} onChange={(e) => setQf({ familienstand: e.target.value })}>
                  <option value="">— bitte wählen —</option>
                  <option value="ledig">ledig</option>
                  <option value="verheiratet">verheiratet</option>
                  <option value="eingetragene Lebenspartnerschaft">eingetragene Lebenspartnerschaft</option>
                  <option value="getrennt lebend">getrennt lebend</option>
                  <option value="geschieden">geschieden</option>
                  <option value="verwitwet">verwitwet</option>
                </select>
              </Field>
              <Field label="Geschlecht" req>
                <select className={inp} value={q.geschlecht ?? ""} onChange={(e) => setQf({ geschlecht: e.target.value as QuestionnaireData["geschlecht"] })}>
                  <option value="">— bitte wählen —</option>
                  <option value="maennlich">männlich</option>
                  <option value="weiblich">weiblich</option>
                  <option value="divers">divers</option>
                </select>
              </Field>
              {q.sv_nummer_vorhanden !== false && (
                <Field label="Sozialversicherungsnummer" req><input className={inp} value={svNummer} onChange={(e) => setSvNummer(e.target.value)} /></Field>
              )}
            </div>
            <CheckRow
              checked={q.sv_nummer_vorhanden === false}
              onChange={(v) => {
                setQf({ sv_nummer_vorhanden: v ? false : undefined });
                if (v) setSvNummer("");
              }}
            >
              Ich habe noch keine Sozialversicherungsnummer
            </CheckRow>
            <CheckRow checked={!!q.schwerbehindert} onChange={(v) => setQf({ schwerbehindert: v })}>Schwerbehindert</CheckRow>
          </fieldset>

          <fieldset className="space-y-4 border-t border-gray-100 pt-5">
            <Legend>Bankverbindung</Legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="IBAN" req><input className={inp} value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE.. .. .. .." autoComplete="off" /></Field>
              <Field label="BIC" req><input className={inp} value={bic} onChange={(e) => setBic(e.target.value)} /></Field>
            </div>
            <Field label="Abweichender Kontoinhaber (falls abweichend)"><input className={inp} value={q.abweichender_kontoinhaber ?? ""} onChange={(e) => setQf({ abweichender_kontoinhaber: e.target.value })} /></Field>
          </fieldset>

          <fieldset className="space-y-4 border-t border-gray-100 pt-5">
            <Legend>Beschäftigung</Legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Haupt- oder Nebenbeschäftigung" req>
                <select className={inp} value={q.haupt_oder_neben ?? ""} onChange={(e) => setQf({ haupt_oder_neben: e.target.value as QuestionnaireData["haupt_oder_neben"] })}>
                  <option value="">— bitte wählen —</option>
                  <option value="haupt">Hauptbeschäftigung</option>
                  <option value="neben">Nebenbeschäftigung</option>
                </select>
              </Field>
            </div>
            <CheckRow checked={!!q.weitere_beschaeftigungen} onChange={(v) => setQf({ weitere_beschaeftigungen: v, ...(v ? {} : { weitere_taetigkeit: "", weitere_geringfuegig: false }) })}>Ich habe weitere Beschäftigungen</CheckRow>
            {q.weitere_beschaeftigungen && (
              <>
                <Field label="Welche weitere(n) Beschäftigung(en)?" req><input className={inp} value={q.weitere_taetigkeit ?? ""} onChange={(e) => setQf({ weitere_taetigkeit: e.target.value })} placeholder="z. B. Aushilfe Gastronomie bei Firma XY" /></Field>
                <CheckRow checked={!!q.weitere_geringfuegig} onChange={(v) => setQf({ weitere_geringfuegig: v })}>Davon geringfügig (Minijob)</CheckRow>
              </>
            )}
          </fieldset>

          <fieldset className="space-y-4 border-t border-gray-100 pt-5">
            <Legend>Schul- und Berufsausbildung</Legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Höchster Schulabschluss" req>
                <select className={inp} value={q.schulabschluss ?? ""} onChange={(e) => setQf({ schulabschluss: e.target.value })}>
                  <option value="">— bitte wählen —</option>
                  <option value="ohne Schulabschluss">ohne Schulabschluss</option>
                  <option value="Haupt-/Volksschulabschluss">Haupt-/Volksschulabschluss</option>
                  <option value="Mittlere Reife / gleichwertiger Abschluss">Mittlere Reife / gleichwertiger Abschluss</option>
                  <option value="Abitur / Fachabitur">Abitur / Fachabitur</option>
                </select>
              </Field>
              <Field label="Höchste Berufsausbildung" req>
                <select className={inp} value={q.berufsausbildung ?? ""} onChange={(e) => setQf({ berufsausbildung: e.target.value })}>
                  <option value="">— bitte wählen —</option>
                  <option value="ohne beruflichen Ausbildungsabschluss">ohne beruflichen Ausbildungsabschluss</option>
                  <option value="Anerkannte Berufsausbildung">Anerkannte Berufsausbildung</option>
                  <option value="Meister / Techniker / gleichwertiger Fachschulabschluss">Meister / Techniker / gleichwertiger Fachschulabschluss</option>
                  <option value="Bachelor">Bachelor</option>
                  <option value="Diplom / Magister / Master / Staatsexamen">Diplom / Magister / Master / Staatsexamen</option>
                  <option value="Promotion">Promotion</option>
                </select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t border-gray-100 pt-5">
            <Legend>Steuerliche Angaben</Legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Steuer-ID" req><input className={inp} value={steuerId} onChange={(e) => setSteuerId(e.target.value)} /></Field>
              <Field label="Steuerklasse" req>
                <select className={inp} value={q.steuerklasse ?? ""} onChange={(e) => setQf({ steuerklasse: e.target.value })}>
                  <option value="">— bitte wählen —</option>
                  <option value="I">I</option>
                  <option value="II">II</option>
                  <option value="III">III</option>
                  <option value="IV">IV</option>
                  <option value="IV mit Faktor">IV mit Faktor</option>
                  <option value="V">V</option>
                  <option value="VI">VI</option>
                </select>
              </Field>
              <Field label="Kinderfreibeträge" req>
                <select className={inp} value={q.kinderfreibetraege ?? ""} onChange={(e) => setQf({ kinderfreibetraege: e.target.value })}>
                  <option value="">— bitte wählen —</option>
                  <option value="0">0</option>
                  <option value="0,5">0,5</option>
                  <option value="1">1</option>
                  <option value="1,5">1,5</option>
                  <option value="2">2</option>
                  <option value="2,5">2,5</option>
                  <option value="3">3</option>
                  <option value="3,5">3,5</option>
                  <option value="4">4</option>
                  <option value="4,5">4,5</option>
                  <option value="5">5</option>
                  <option value="5,5">5,5</option>
                  <option value="6">6</option>
                </select>
              </Field>
              <Field label="Konfession" req>
                <select className={inp} value={q.konfession ?? ""} onChange={(e) => setQf({ konfession: e.target.value })}>
                  <option value="">— bitte wählen —</option>
                  <option value="keine / konfessionslos">keine / konfessionslos</option>
                  <option value="römisch-katholisch">römisch-katholisch</option>
                  <option value="evangelisch">evangelisch</option>
                  <option value="altkatholisch">altkatholisch</option>
                  <option value="freireligiös">freireligiös</option>
                  <option value="jüdisch">jüdisch</option>
                </select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t border-gray-100 pt-5">
            <Legend>Sozialversicherung</Legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Krankenversicherung" req>
                <select className={inp} value={q.kv_art ?? ""} onChange={(e) => setQf({ kv_art: e.target.value as QuestionnaireData["kv_art"] })}>
                  <option value="">— bitte wählen —</option>
                  <option value="gesetzlich">Gesetzlich</option>
                  <option value="privat">Privat</option>
                </select>
              </Field>
              <Field label="Name der Krankenkasse / Versicherung" req><input className={inp} value={q.kv_name ?? ""} onChange={(e) => setQf({ kv_name: e.target.value })} /></Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t border-gray-100 pt-5">
            <Legend>Kinder</Legend>
            <p className="text-xs text-gray-500">
              Relevant für den Pflegeversicherungs-Beitrag (Kinder unter 25 Jahren). Wenn du keine Kinder hast, einfach leer lassen.
            </p>
            {(q.kinder ?? []).length > 0 && (
              <div className="space-y-3">
                {(q.kinder ?? []).map((k, i) => (
                  <div key={i} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                    <Field label="Name"><input className={inp} value={k.name ?? ""} onChange={(e) => updateKind(i, { name: e.target.value })} /></Field>
                    <Field label="Vorname"><input className={inp} value={k.vorname ?? ""} onChange={(e) => updateKind(i, { vorname: e.target.value })} /></Field>
                    <Field label="Geburtsdatum"><input type="date" className={inp} value={k.geburtsdatum ?? ""} onChange={(e) => updateKind(i, { geburtsdatum: e.target.value })} /></Field>
                    <button
                      type="button"
                      onClick={() => removeKind(i)}
                      className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
                    >
                      Entfernen
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={addKind}
              className="rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-400 hover:bg-gray-50"
            >
              + Kind hinzufügen
            </button>
          </fieldset>

          {error && <ErrorBox>{error}</ErrorBox>}
          <button
            onClick={sendQuestionnaire}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Personalfragebogen absenden
          </button>
        </Card>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-3xl space-y-6 px-4">
        <div className="flex justify-center"><SwipeflowLogo className="h-8 w-auto text-[#020f13]" /></div>
        {children}
        <footer className="pt-2 text-center text-xs text-gray-400">
          <p>Swipeflow GmbH · Ringstraße 6 · 32339 Espelkamp</p>
        </footer>
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">{children}</div>;
}
function Legend({ children }: { children: React.ReactNode }) {
  return <legend className="text-sm font-semibold text-gray-900">{children}</legend>;
}
function Field({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-500">
        {label}
        {req && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
function ErrorBox({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{children}</p>;
}
function Consent({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}
function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
function Dots({ step }: { step: number }) {
  return (
    <div className="mt-3 flex items-center justify-center gap-2">
      {[1, 2, 3].map((n) => (
        <span key={n} className={`h-2 w-2 rounded-full ${step === n ? "bg-primary" : "bg-gray-300"}`} />
      ))}
    </div>
  );
}
