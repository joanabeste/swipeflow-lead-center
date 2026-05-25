import type { LearningBlock } from "@/lib/types";

/**
 * Normalisiert das `blocks`-Feld einer Lesson defensiv:
 * - Array → returned as-is
 * - String (z.B. wenn jsonb von DB als String kommt) → JSON.parse
 * - Sonst → []
 *
 * Filtert ungueltige Items raus (kein type, falscher type, keine id).
 */
export function normalizeBlocks(raw: unknown): LearningBlock[] {
  let arr: unknown;
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  } else {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const valid: LearningBlock[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const type = obj.type;
    if (type !== "text" && type !== "video" && type !== "image" && type !== "file" && type !== "button") continue;
    if (typeof obj.id !== "string") {
      obj.id = crypto.randomUUID();
    }
    valid.push(obj as unknown as LearningBlock);
  }
  return valid;
}
