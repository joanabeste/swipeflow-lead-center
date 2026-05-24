import { redirect } from "next/navigation";

// Verschoben in /mein-konto — Mail-Konfiguration ist per-User, gehoert ins eigene Konto
// und nicht in den Admin-Bereich (sonst koennen normale Mitarbeiter ihre Mailbox nicht einrichten).
export default function EmailSettingsRedirect() {
  redirect("/mein-konto#email");
}
