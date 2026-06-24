import { createServiceClient } from "@/lib/supabase/server";
import { requireSection } from "@/lib/auth";
import { permissionsFromProfile, type LeadTodo, type Profile } from "@/lib/types";
import { TodosManager } from "./todos-manager";

export interface TodoLeadInfo {
  id: string;
  company_name: string;
  city: string | null;
  phone: string | null;
}

export interface TodoWithLead extends LeadTodo {
  lead: TodoLeadInfo | null;
  /** Name des Besitzers (created_by) — für die Ersteller-Pille in der „Alle"-Ansicht. */
  created_by_name: string | null;
}

/** Person für den Umschalter / Assignee-Auswahl. */
export interface TodoPerson {
  id: string;
  name: string;
}

export default async function TodosPage() {
  const { user } = await requireSection("can_vertrieb");
  const db = createServiceClient();

  // Alle offenen Todos + alle erledigten der letzten 7 Tage. Erledigte älter
  // als 7 Tage werden ausgeblendet (sonst wächst die Liste ewig). Für eine
  // Vollhistorie hat jeder Lead seine eigene Todos-Card im Detail.
  // eslint-disable-next-line react-hooks/purity -- bewusst frischer Stichtag pro Server-Render
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: todos } = await db
    .from("lead_todos")
    .select("*")
    .or(`done_at.is.null,done_at.gte.${sevenDaysAgo}`)
    .order("due_date", { ascending: true })
    .limit(2000);

  const todoRows = (todos ?? []) as LeadTodo[];

  // Leads dazu laden — ein einziger Roundtrip
  const leadIds = Array.from(new Set(todoRows.map((t) => t.lead_id).filter(Boolean)));
  const leadsById = new Map<string, TodoLeadInfo>();
  if (leadIds.length > 0) {
    const { data: leads } = await db
      .from("leads")
      .select("id, company_name, city, phone")
      .in("id", leadIds)
      .is("deleted_at", null);
    for (const l of leads ?? []) {
      leadsById.set(l.id as string, {
        id: l.id as string,
        company_name: l.company_name as string,
        city: (l.city as string | null) ?? null,
        phone: (l.phone as string | null) ?? null,
      });
    }
  }

  // Auch alle Leads (id+name) für die @-Mention im Quick-Add — nur kurze
  // Liste, sonst zu groß. Wir laden bei Bedarf via Server-Action; hier
  // schicken wir die Top-300 nach updated_at für initiale Vorschläge.
  const { data: recentLeads } = await db
    .from("leads")
    .select("id, company_name, city")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(300);
  const leadCatalog = (recentLeads ?? []).map((l) => ({
    id: l.id as string,
    company_name: l.company_name as string,
    city: (l.city as string | null) ?? null,
  }));

  // Vertriebs-Team laden — für den Personen-Umschalter, die Assignee-Auswahl im
  // Quick-Add und die Ersteller-Pille. Nur aktive Profile mit can_vertrieb.
  const { data: profileRows } = await db
    .from("profiles")
    .select("id, name, role, status, can_vertrieb, can_fulfillment, can_zeit, can_learning, can_vertraege")
    .eq("status", "active");
  const nameById = new Map<string, string>();
  const people: TodoPerson[] = [];
  for (const p of (profileRows ?? []) as Profile[]) {
    nameById.set(p.id, p.name);
    if (permissionsFromProfile(p).can_vertrieb) people.push({ id: p.id, name: p.name });
  }
  people.sort((a, b) => a.name.localeCompare(b.name));

  const todosWithLead: TodoWithLead[] = todoRows.map((t) => ({
    ...t,
    lead: leadsById.get(t.lead_id) ?? null,
    created_by_name: t.created_by ? nameById.get(t.created_by) ?? null : null,
  }));

  return (
    <TodosManager
      initialTodos={todosWithLead}
      leadCatalog={leadCatalog}
      people={people}
      currentUserId={user.id}
    />
  );
}
