import type { CancelRule, CancelRuleCategory } from "@/lib/types";

export interface CancelCheckResult {
  cancelled: boolean;
  reasons: { ruleId: string; ruleName: string; reason: string }[];
}

/**
 * Prüft einen Lead gegen aktive Ausschlussregeln.
 * `phase` bestimmt, welche Regeln angewendet werden:
 * - "import": nur Regeln mit category "import" oder "both"
 * - "enrichment": nur Regeln mit category "enrichment" oder "both"
 */
export function evaluateCancelRules(
  lead: Record<string, unknown>,
  rules: CancelRule[],
  phase: "import" | "enrichment",
): CancelCheckResult {
  const reasons: CancelCheckResult["reasons"] = [];

  const applicableCategories: CancelRuleCategory[] =
    phase === "import" ? ["import", "both"] : ["enrichment", "both"];

  for (const rule of rules) {
    if (!rule.is_active) continue;
    if (!applicableCategories.includes(rule.category)) continue;

    const rawValue = lead[rule.field];
    const matches = evaluateRule(rawValue, rule.operator, rule.value);

    if (matches) {
      reasons.push({
        ruleId: rule.id,
        ruleName: rule.name,
        reason: `Regel "${rule.name}": ${rule.field} ${operatorLabel(rule.operator)} "${rule.value}"`,
      });
    }
  }

  return { cancelled: reasons.length > 0, reasons };
}

function evaluateRule(
  rawValue: unknown,
  operator: string,
  ruleValue: string,
): boolean {
  switch (operator) {
    case "is_empty":
      return rawValue == null || String(rawValue).trim() === "" || rawValue === 0;

    case "is_not_empty":
      return rawValue != null && String(rawValue).trim() !== "" && rawValue !== 0;

    case "greater_than": {
      const num = parseFloat(String(rawValue ?? ""));
      const threshold = parseFloat(ruleValue);
      return !isNaN(num) && !isNaN(threshold) && num > threshold;
    }

    case "less_than": {
      const num = parseFloat(String(rawValue ?? ""));
      const threshold = parseFloat(ruleValue);
      return !isNaN(num) && !isNaN(threshold) && num < threshold;
    }

    default: {
      // String-basierte Operatoren
      const fieldValue = String(rawValue ?? "").toLowerCase().trim();
      if (!fieldValue) return false;

      const compareValue = ruleValue.toLowerCase().trim();

      switch (operator) {
        case "equals":
          return fieldValue === compareValue;
        case "contains":
          return fieldValue.includes(compareValue);
        case "starts_with":
          return fieldValue.startsWith(compareValue);
        case "in_list": {
          try {
            const list = JSON.parse(ruleValue) as string[];
            return list.some((v) => v.toLowerCase().trim() === fieldValue);
          } catch {
            return false;
          }
        }
        default:
          return false;
      }
    }
  }
}

function operatorLabel(op: string): string {
  const labels: Record<string, string> = {
    equals: "gleich",
    contains: "enthält",
    starts_with: "beginnt mit",
    in_list: "in Liste",
    greater_than: "größer als",
    less_than: "kleiner als",
    is_empty: "ist leer",
    is_not_empty: "ist nicht leer",
  };
  return labels[op] ?? op;
}
