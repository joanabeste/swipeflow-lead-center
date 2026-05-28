// Deterministische Farb-Palette für Mitarbeiter-Einfärbung in Chart-Widgets.
// Keine DB — Farben werden nach Rang (z. B. Call-Aufkommen) vergeben.

export type MemberColor = { bar: string; dot: string };

export const MEMBER_PALETTE: MemberColor[] = [
  { bar: "bg-emerald-500", dot: "bg-emerald-500" },
  { bar: "bg-blue-500", dot: "bg-blue-500" },
  { bar: "bg-violet-500", dot: "bg-violet-500" },
  { bar: "bg-amber-500", dot: "bg-amber-500" },
  { bar: "bg-rose-500", dot: "bg-rose-500" },
  { bar: "bg-cyan-500", dot: "bg-cyan-500" },
  { bar: "bg-fuchsia-500", dot: "bg-fuchsia-500" },
  { bar: "bg-lime-500", dot: "bg-lime-500" },
];

// Neutralgrau für den gebündelten "Andere"-Bucket.
export const OTHERS_COLOR: MemberColor = { bar: "bg-gray-400", dot: "bg-gray-400" };

export const OTHERS_KEY = "__others__";

// Anzahl der Mitarbeiter mit eigener Farbe; Rest wird zu "Andere".
export const MEMBER_TOP_N = MEMBER_PALETTE.length;
