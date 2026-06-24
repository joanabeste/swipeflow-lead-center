import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { buildEmploymentRenderInput } from "@/lib/employment/data";
import { renderEmploymentContractHtml } from "@/lib/employment/template";
import type { EmploymentContractRow, EmploymentQuestionnaireRow } from "@/lib/employment/types";
import { PublicEmploymentView } from "./_form";

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

function isExpired(row: EmploymentContractRow): boolean {
  if (!row.expires_at) return false;
  if (row.status === "signed" || row.status === "cancelled") return false;
  return new Date(row.expires_at).getTime() < Date.now();
}

export default async function PublicEmploymentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createServiceClient();

  const { data, error } = await db.from("employment_contracts").select("*").eq("token", token).maybeSingle();
  if (error || !data) notFound();
  const contract = data as unknown as EmploymentContractRow;

  if (contract.status === "cancelled") {
    return <Notice title="Vertrag nicht verfügbar" body="Dieser Arbeitsvertrag ist nicht mehr gültig. Bitte wende dich an uns." />;
  }
  if (isExpired(contract)) {
    return <Notice title="Link abgelaufen" body="Dieser Vertragslink ist abgelaufen. Bitte fordere bei uns einen neuen an." />;
  }

  // Signiert: Fragebogen-Status bestimmt, ob weiter zum Fragebogen oder fertig.
  let questionnaireDone = false;
  if (contract.status === "signed") {
    const { data: q } = await db
      .from("employment_questionnaires")
      .select("status")
      .eq("employment_contract_id", contract.id)
      .maybeSingle();
    questionnaireDone = (q as Pick<EmploymentQuestionnaireRow, "status"> | null)?.status === "submitted";
    if (questionnaireDone) {
      return (
        <Notice
          title="Alles erledigt — vielen Dank!"
          body="Dein Arbeitsvertrag ist unterschrieben und der Personalfragebogen wurde übermittelt."
        />
      );
    }
  }

  // Beim ersten Öffnen aus 'sent' → 'viewed'.
  if (contract.status === "sent") {
    await db
      .from("employment_contracts")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", contract.id)
      .eq("status", "sent");
    await db.from("employment_contract_events").insert({
      employment_contract_id: contract.id,
      event: "viewed",
      actor_user_id: null,
      meta: {},
    });
  }

  const viewHtml = renderEmploymentContractHtml(buildEmploymentRenderInput(contract, { mode: "view" }));

  return (
    <PublicEmploymentView
      token={token}
      variant={contract.variant}
      startStep={contract.status === "signed" ? "questionnaire" : "sign"}
      contractHtml={viewHtml}
      prefill={{
        firstName: contract.employee_first_name ?? "",
        lastName: contract.employee_last_name ?? "",
        street: contract.employee_street ?? "",
        zip: contract.employee_zip ?? "",
        city: contract.employee_city ?? "",
        email: contract.employee_email ?? "",
      }}
    />
  );
}
