// Fulfillment-Modul Typen.

export type LifecycleStage = "lead" | "deal" | "customer" | "archived";

export type ProjectStatus = "onboarding" | "active" | "paused" | "completed";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  onboarding: "Onboarding",
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  onboarding: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-gray-200 text-gray-700",
};

export type Salutation = "du" | "sie";

export interface CustomerContact {
  id: string;
  lead_id: string;
  first_name: string | null;
  last_name: string | null;
  name: string; // generated: first_name + ' ' + last_name
  salutation: Salutation;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  lead_id: string;
  name: string;
  status: ProjectStatus;
  vertical: "webdesign" | "recruiting" | "sonstiges" | null;
  clickup_list_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClickupTaskCached {
  clickup_task_id: string;
  project_id: string;
  name: string;
  status: string | null;
  status_color: string | null;
  assignees: Array<{ id: string; username?: string; email?: string }> | null;
  due_date: string | null;
  url: string | null;
  closed: boolean;
  last_synced_at: string;
}
