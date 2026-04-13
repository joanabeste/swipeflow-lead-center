import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { mode } = await request.json();
  if (mode !== "recruiting" && mode !== "webdev") {
    return new Response("Invalid mode", { status: 400 });
  }

  const db = createServiceClient();
  await db.from("profiles").update({ service_mode: mode }).eq("id", user.id);

  return new Response("OK");
}
