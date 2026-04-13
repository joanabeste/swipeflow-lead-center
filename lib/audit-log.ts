import { createServiceClient } from "@/lib/supabase/server";

export async function logAudit(params: {
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  await supabase.from("audit_logs").insert({
    user_id: params.userId,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    details: params.details ?? {},
  });
}
