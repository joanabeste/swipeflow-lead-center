import { headers } from "next/headers";
import { Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { PageHeader } from "../_components/ui";
import { PhonemondoManager } from "../phonemondo-manager";

export default async function PhonemondoPage() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const webhookUrl = `${proto}://${host}/api/phonemondo/webhook`;

  const status = {
    hasToken: !!process.env.PHONEMONDO_API_TOKEN,
    hasSecret: !!process.env.PHONEMONDO_WEBHOOK_SECRET,
    baseUrl: process.env.PHONEMONDO_API_BASE_URL ?? "https://www.phonemondo.com/api",
  };

  return (
    <div>
      <PageHeader
        icon={Phone}
        category="Integrationen"
        title="PhoneMondo"
        subtitle="Click-to-Call im CRM. Server-Integration + Durchwahlen pro Nutzer."
      />
      <PhonemondoManager
        status={status}
        profiles={(profiles as Profile[]) ?? []}
        webhookUrl={webhookUrl}
      />
    </div>
  );
}
