// Reine Logik, kein Server-Import — kann auch in Client-Komponenten genutzt werden.

const HR_ROLE_PATTERNS = [
  /personal/i,
  /\bhr\b/i,
  /human\s*resources/i,
  /recruit/i,
  /talent/i,
  /people/i,
  /ausbildung/i,
  /azubi/i,
  /bewerb/i,
  /referent.*personal/i,
  /personal.*referent/i,
  /lohn.*gehalt/i,
  /staffing/i,
  /employer\s*brand/i,
];

/** Prüft ob ein Kontakt eine HR-Rolle hat */
export function isHrContact(role: string | null | undefined): boolean {
  if (!role) return false;
  return HR_ROLE_PATTERNS.some((p) => p.test(role));
}
