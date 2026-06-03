import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { buildRenderInput, decryptIban } from "@/lib/contracts/render";
import { loadCreditor } from "@/lib/contracts/settings";
import { renderContractHtml } from "@/lib/contracts/template";
import { isExpired, type ContractRow, type ContractLead } from "@/lib/contracts/types";
import { PublicContractView } from "./_form";

export const dynamic = "force-dynamic";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">{body}</p>
      </div>
    </main>
  );
}

export default async function PublicContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createServiceClient();

  const { data, error } = await db.from("contracts").select("*").eq("token", token).maybeSingle();
  if (error || !data) notFound();
  const contract = data as unknown as ContractRow;

  if (contract.status === "cancelled") {
    return <Notice title="Vertrag nicht verfügbar" body="Dieser Vertrag ist nicht mehr gültig. Bitte kontaktieren Sie uns." />;
  }
  if (contract.status === "signed") {
    return (
      <Notice
        title="Vielen Dank!"
        body="Dieser Vertrag wurde bereits erfolgreich unterschrieben. Sie erhalten in Kürze eine Bestätigung."
      />
    );
  }
  if (isExpired(contract)) {
    return <Notice title="Link abgelaufen" body="Dieser Vertragslink ist abgelaufen. Bitte fordern Sie bei uns einen neuen an." />;
  }

  // Beim ersten Öffnen aus 'sent' → 'viewed' (einmalig).
  if (contract.status === "sent") {
    await db.from("contracts").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", contract.id).eq("status", "sent");
    await db.from("contract_events").insert({ contract_id: contract.id, event: "viewed", actor_user_id: null, meta: {} });
  }

  const { data: leadData } = await db
    .from("leads")
    .select("id, company_name, street, zip, city, email")
    .eq("id", contract.lead_id)
    .maybeSingle();
  const lead = (leadData as ContractLead | null) ?? null;

  const creditor = await loadCreditor();
  const viewHtml = renderContractHtml(buildRenderInput(contract, lead, { mode: "view", creditor }));

  const prefill = {
    company: contract.billing_company || lead?.company_name || "",
    street: contract.billing_street || lead?.street || "",
    zip: contract.billing_zip || lead?.zip || "",
    city: contract.billing_city || lead?.city || "",
    email: contract.billing_email || lead?.email || "",
    // Bereits gespeicherte SEPA-Daten vorbefüllen, damit ein Zwischenstand beim
    // erneuten Öffnen nicht neu eingegeben werden muss (IBAN wird entschlüsselt).
    holder: contract.sepa_account_holder || "",
    iban: contract.payment_method === "sepa" ? decryptIban(contract) || "" : "",
  };

  return (
    <PublicContractView
      token={token}
      contractType={contract.type}
      contractHtml={viewHtml}
      paymentMethod={contract.payment_method}
      prefill={prefill}
      costs={{
        setupPriceCents: contract.setup_price_cents,
        monthlyMaintCents: contract.monthly_maint_cents,
        paymentMode: contract.payment_mode,
        installmentCount: contract.installment_count,
        adBudgetCents: contract.ad_budget_cents,
      }}
    />
  );
}
