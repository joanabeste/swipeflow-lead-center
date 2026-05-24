import { redirect } from "next/navigation";

// Verschoben in /mein-konto — Vorlagen sind per-User.
export default function EmailTemplatesRedirect() {
  redirect("/mein-konto#email");
}
