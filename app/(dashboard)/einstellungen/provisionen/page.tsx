import { redirect } from "next/navigation";

// Provisionen + Loehne leben jetzt zentral unter /admin/provisionen (Phase B Admin-Audit).
export default function ProvisionenRedirect() {
  redirect("/admin/provisionen");
}
