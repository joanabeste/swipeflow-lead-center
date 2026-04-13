import type { BlacklistEntry, BlacklistRule } from "@/lib/types";

interface CheckResult {
  blocked: boolean;
  reasons: string[];
}

export function checkLead(
  lead: Record<string, string | null>,
  rules: BlacklistRule[],
  entries: BlacklistEntry[],
): CheckResult {
  const reasons: string[] = [];

  // Manuelle Blacklist-Einträge prüfen
  for (const entry of entries) {
    const leadValue = getMatchField(lead, entry.match_type)?.toLowerCase();
    if (!leadValue) continue;

    const entryValue = entry.match_value.toLowerCase();
    // Firmennamen: "enthält"-Match (z.B. "Siemens" matched "Siemens Energy GmbH")
    // Domain/Register-ID: exakter Match
    const matches = entry.match_type === "name"
      ? leadValue.includes(entryValue)
      : leadValue === entryValue;

    if (matches) {
      reasons.push(
        `Blacklist: ${entry.match_type} "${entry.match_value}"${entry.reason ? ` (${entry.reason})` : ""}`,
      );
    }
  }

  // Regelbasierte Filter prüfen
  for (const rule of rules) {
    if (!rule.is_active) continue;

    const fieldValue = lead[rule.field]?.toLowerCase() ?? "";
    if (!fieldValue) continue;

    const ruleValue = rule.value.toLowerCase();

    let matches = false;
    switch (rule.operator) {
      case "equals":
        matches = fieldValue === ruleValue;
        break;
      case "contains":
        matches = fieldValue.includes(ruleValue);
        break;
      case "starts_with":
        matches = fieldValue.startsWith(ruleValue);
        break;
      case "in_list": {
        try {
          const list = JSON.parse(rule.value) as string[];
          matches = list.some((v) => v.toLowerCase() === fieldValue);
        } catch {
          matches = false;
        }
        break;
      }
    }

    if (matches) {
      reasons.push(`Regel "${rule.name}": ${rule.field} ${rule.operator} "${rule.value}"`);
    }
  }

  return { blocked: reasons.length > 0, reasons };
}

function getMatchField(
  lead: Record<string, string | null>,
  matchType: string,
): string | null {
  switch (matchType) {
    case "name":
      return lead.company_name ?? null;
    case "domain":
      return lead.domain ?? null;
    case "register_id":
      return lead.register_id ?? null;
    default:
      return null;
  }
}
