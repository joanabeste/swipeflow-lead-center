import { redirect } from "next/navigation";

// Nutzer-Verwaltung lebt jetzt zentral unter /admin/team (siehe Phase B des Admin-Audits).
export default function TeamPage() {
  redirect("/admin/team#nutzer-verwalten");
}
