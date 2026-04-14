import { redirect } from "next/navigation";

// /export wurde durch das neue /crm ersetzt. Alte Bookmarks leiten weiter.
export default function ExportRedirect() {
  redirect("/crm");
}
