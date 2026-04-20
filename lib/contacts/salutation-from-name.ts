/**
 * Heuristische Anrede-Erkennung aus Vornamen & E-Mail.
 *
 * Bewusst konservativ: mehrdeutige Namen (Andrea, Kim, Nikola, Conny, Toni,
 * Sascha, Dominique) sind NICHT in der Liste → Rückgabe `null`. Besser null
 * als falsch, weil eine falsche Anrede schlimmer wirkt als eine neutrale.
 *
 * Quelle: häufigste deutsche Vornamen (Statistisches Bundesamt / Destatis +
 * verbreitete internationale Vornamen in deutschen Firmen).
 *
 * Schichten von `guessSalutationFromName` (jede läuft nur, wenn die vorherige
 * `null` geliefert hat — Monotonie garantiert):
 *   A. Prefix-Anrede: erstes Wort ist "Herr"/"Frau"/"Hr."/"Mr."/"Mrs." → direkt.
 *   B. Komma-Swap: "Nachname, Vorname" — Teil nach Komma als Vorname nutzen.
 *   C. Klassischer Lookup auf erstem Nicht-Prefix-Token.
 *   D. Diakritika-Fallback: ohne Umlaute/Akzente nochmal lookupen.
 */

// Männliche Vornamen (Kleinbuchstaben, für Lookup).
const MALE_NAMES = new Set<string>([
  // Klassiker & häufige deutsche Vornamen
  "alexander", "andreas", "anton", "arne", "arno", "arthur", "axel",
  "ben", "benedikt", "benjamin", "bernd", "bernhard", "bjoern", "björn", "bjorn", "boris", "bruno", "burkhard",
  "carl", "carsten", "chris", "christian", "christoph", "christopher", "claus", "clemens",
  "daniel", "dave", "david", "detlef", "dieter", "dietmar", "dirk", "dominik", "dustin",
  "eberhard", "eduard", "egon", "elias", "emanuel", "emil", "erhard", "eric", "erich", "erik", "ernst", "erwin", "eugen",
  "fabian", "felix", "ferdinand", "finn", "florian", "frank", "franz", "friedrich", "fritz",
  "gabriel", "georg", "gerald", "gerd", "gerhard", "gerrit", "gert", "gilbert", "giovanni", "gregor", "guenter", "günter", "guenther", "günther", "gustav",
  "hagen", "hannes", "hans", "harald", "harry", "hartmut", "heiko", "heinrich", "heinz", "helmut", "hendrik", "henning", "henry", "henrik", "herbert", "herrmann", "hermann", "holger", "horst", "hubert", "hugo",
  "igor", "ingo", "ivan",
  "jakob", "jan", "janis", "janosch", "jannik", "jannis", "jason", "jean", "jens", "jeremy", "joachim", "joerg", "jörg", "johann", "johannes", "jonas", "jonathan", "josef", "joseph", "juergen", "jürgen", "julian", "julius", "justin",
  "karl", "karsten", "kasper", "kay", "kerem", "kevin", "klaus", "klemens", "konrad", "konstantin", "korbinian", "kurt",
  "lars", "laurin", "leander", "lennart", "leo", "leon", "leonard", "leonardo", "leopold", "levin", "lorenz", "lothar", "louis", "luca", "lucas", "ludger", "ludwig", "luis", "lukas", "luke",
  "maik", "malte", "manfred", "manuel", "marc", "marcel", "marco", "marcus", "mario", "marius", "mark", "markus", "martin", "marvin", "mathias", "mathis", "mats", "matteo", "matthias", "maurice", "max", "maximilian", "meik", "mert", "michael", "milan", "mirko", "moritz",
  "nick", "niclas", "nicolas", "niels", "niklas", "niko", "nikolai", "nikolaus", "nils", "noah", "norbert",
  "oliver", "olaf", "omar", "oskar", "otto",
  "pascal", "patrick", "paul", "peer", "peter", "phil", "philipp", "philippe",
  "rafael", "rainer", "ralf", "ralph", "raphael", "rasmus", "reinhard", "reiner", "richard", "robert", "robin", "roland", "rolf", "roman", "rudi", "rudolf", "ruediger", "rüdiger", "rupert",
  "samuel", "sebastian", "sergej", "siegfried", "silvio", "simon", "stefan", "stephan", "steffen", "sven",
  "thilo", "thomas", "thorben", "thorsten", "tilo", "tim", "timo", "timon", "tino", "tobias", "tom", "tommy", "torben", "tristan",
  "udo", "ulf", "uli", "ulrich", "uwe",
  "valentin", "victor", "viktor", "vincent", "volker",
  "walter", "werner", "wilfried", "wilhelm", "willi", "willy", "wolfgang",
  "yannick", "yannis",
  "zacharias", "zoran",
  // Internationale Namen, die häufig in DE vorkommen
  "aaron", "adam", "adrian", "ahmed", "ali", "alvaro", "andres", "antonio", "carlos",
  "dennis", "diego", "enrique", "fernando", "francesco", "giuseppe", "ivan", "jorge", "jose", "juan",
  "luigi", "manuel", "mehmet", "miguel", "mohamed", "muhammad", "murat", "omer", "pablo", "pedro",
  "piotr", "rafael", "raul", "ricardo", "sergio", "stefano", "umut", "yusuf",
]);

// Weibliche Vornamen (Kleinbuchstaben, für Lookup).
const FEMALE_NAMES = new Set<string>([
  // Klassiker & häufige deutsche Vornamen
  "agnes", "aileen", "aimee", "alessa", "alexa", "alexandra", "alice", "alina", "alisa", "aliya", "amalia", "amelie", "amy", "anastasia", "angela", "angelika", "anika", "anita", "anja", "anke", "ann", "anna", "annabelle", "anne", "annegret", "annelie", "anneliese", "annette", "anni", "annika", "annkathrin", "antje", "astrid", "aylin",
  "barbara", "bea", "beate", "beatrice", "bettina", "bianca", "birgit", "brigitte",
  "carina", "carla", "carmen", "carolin", "caroline", "catharina", "catherine", "cathrin", "cathy", "cecilia", "celina", "charlotte", "chiara", "christa", "christel", "christiana", "christina", "christine", "cindy", "claire", "clara", "claudia", "cora", "cordula", "corinna", "cornelia",
  "dagmar", "daniela", "diana", "dominika", "dorina", "doris", "dorothea", "dorothee",
  "edeltraud", "edith", "edna", "elena", "eleonore", "elfriede", "eliane", "elif", "elisa", "elisabeth", "elise", "elke", "ella", "ellen", "elli", "elly", "elsa", "elvira", "emilia", "emily", "emma", "erika", "erna", "esther", "eva", "evelin", "eveline", "evelyn",
  "fabienne", "fanny", "fatima", "fatma", "felicitas", "fiona", "franka", "franziska", "frauke", "frieda", "friederike",
  "gabi", "gabriela", "gabriele", "gerda", "gertrud", "gertrude", "gesa", "gina", "gisela", "giulia", "grazia", "greta", "gudrun",
  "hanna", "hannah", "hanne", "hannelore", "hanni", "hedwig", "heide", "heidi", "heike", "helena", "helene", "helga", "henriette", "herta", "hilda", "hilde", "hildegard",
  "ida", "ilona", "ilse", "imke", "inga", "inge", "ingeborg", "ingrid", "irene", "iris", "irmgard", "isabel", "isabell", "isabella", "isabelle",
  "jana", "jane", "janina", "janine", "jasmin", "jasmine", "jennifer", "jenny", "jessica", "jette", "joana", "joanna", "johanna", "jolie", "josefa", "josefine", "josephine", "jovanna", "judith", "julia", "juliane", "julie", "juna", "juniper", "jutta",
  "karin", "karina", "karla", "karolin", "karoline", "katarina", "katerina", "kathalin", "katharina", "kathleen", "kathrin", "kathy", "katja", "katrin", "kerstin", "khadija", "kira", "klara", "kornelia", "kristin", "kristina",
  "lara", "larissa", "laura", "lea", "leah", "lena", "leonie", "leyla", "liana", "lidia", "lilian", "liliane", "lilli", "lilly", "lina", "linda", "lisa", "liselotte", "lorena", "lotte", "lotta", "louisa", "louise", "luana", "lucia", "luciana", "lucie", "luisa", "luise", "luna",
  "madeleine", "magdalena", "magdalene", "maike", "maja", "malin", "manja", "manuela", "mara", "marei", "maren", "margarethe", "margit", "margot", "margret", "margrit", "maria", "mariana", "marianne", "marie", "marieke", "mariella", "marielle", "marina", "marion", "marita", "maritta", "marlen", "marlene", "marta", "martha", "martina", "marzena", "mathilda", "mathilde", "mechthild", "melanie", "melina", "melissa", "mercedes", "meta", "mia", "michaela", "michelle", "mila", "milena", "mina", "minna", "mira", "miranda", "miriam", "mona", "monika", "monique",
  "nadia", "nadine", "nadja", "naomi", "natalia", "natalie", "natascha", "nele", "nicola", "nicole", "nicoletta", "nina", "nora",
  "olga", "olivia", "ottilie",
  "patricia", "patrizia", "paula", "pauline", "petra", "philippa", "pia",
  "rachel", "ramona", "regina", "renate", "renee", "rita", "roberta", "rosa", "rosalie", "rosemarie", "rosina", "rosmarie", "roswitha", "ruth",
  "sabina", "sabine", "sabrina", "saida", "samantha", "sandra", "sara", "sarah", "sarina", "saskia", "selena", "selina", "sevim", "sibel", "sibylle", "sidonie", "sigrid", "silke", "silvana", "silvia", "simone", "sina", "sofia", "sofie", "sonja", "sophia", "sophie", "stefanie", "stella", "stephanie", "stine", "susanna", "susanne", "susi", "svea", "svenja", "sybille", "sylvia",
  "tabea", "talia", "tamara", "tanja", "tara", "tatjana", "teresa", "theodora", "theresa", "therese", "thekla", "tina", "tine", "tuana",
  "ulla", "ulrike", "ursel", "ursula", "uta", "ute",
  "valentina", "valeria", "valerie", "vanessa", "vera", "veronika", "vicky", "victoria", "viola", "vivian",
  "walburga", "waltraud", "wiebke", "wilma",
  "xenia",
  "yasemin", "yasmin", "yesim", "yvette", "yvonne",
  "zaha", "zara", "zeynep", "zita", "zoe", "zoey",
  // Internationale Namen
  "adriana", "alba", "alessandra", "alicia", "amina", "ana", "antonia", "asya", "beatriz", "bernadette",
  "consuelo", "deborah", "dolores", "elena", "elisabetta", "emanuela", "esmeralda", "estela", "fatima", "francesca",
  "giovanna", "immaculata", "ines", "irena", "irina", "isabela", "jasmina", "katya", "kinga", "laura",
  "livia", "ludmilla", "lyudmila", "magda", "marcela", "margarita", "mariella", "marisa", "marta",
  "olga", "paula", "paulina", "raquel", "rosalia", "sabrina", "salome", "selma", "serena", "silvija",
  "teresa", "valentina", "vanda", "xiomara",
]);

// Akademische Titel & Adelsprädikate, die vor dem eigentlichen Vornamen stehen
// können und übersprungen werden müssen.
const NAME_PREFIXES = new Set<string>([
  "dr", "dr.", "prof", "prof.", "dipl", "dipl.", "dipl.-ing", "dipl.-ing.",
  "mag", "mag.", "ing", "ing.", "herr", "frau", "hr", "hr.", "fr", "fr.",
  "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "mister", "miss", "med", "med.",
  "von", "van", "de", "di", "del", "della", "zu", "zur", "vom", "der",
]);

// Prefix-Wörter, die allein schon die Anrede festlegen (Layer A).
const PREFIX_HERR = new Set(["herr", "herrn", "hr", "mr"]);
const PREFIX_FRAU = new Set(["frau", "fr", "mrs", "ms"]);

// Rollen-Mailboxen (Layer E in guessSalutationFromEmailLocalpart).
const EMAIL_ROLE_KEYWORDS = new Set([
  "info", "kontakt", "contact", "office", "hr", "recruiting", "jobs",
  "bewerbung", "career", "careers", "sales", "support", "admin", "service",
  "team", "noreply", "no-reply", "hello", "hallo", "mail", "post", "buero",
]);

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Liefert das erste Wort (lowercased, ohne trailing Punkte/Kommas). */
function firstLoweredWord(fullName: string): string {
  const w = fullName.trim().split(/\s+/)[0] ?? "";
  return w.replace(/[,.]+$/g, "").toLowerCase();
}

/**
 * Prüft, ob Anrede direkt aus einem Prefix ("Herr X", "Frau Y") ableitbar ist.
 * Schicht A — vor jedem Lookup.
 */
function salutationFromPrefix(fullName: string): "herr" | "frau" | null {
  const w = firstLoweredWord(fullName);
  if (PREFIX_HERR.has(w)) return "herr";
  if (PREFIX_FRAU.has(w)) return "frau";
  return null;
}

/**
 * Tokenisiert einen Namens-String. Bei Komma-Format ("Nachname, Vorname")
 * wird der Teil NACH dem Komma vorgezogen; der Teil davor landet als
 * Fallback ganz am Ende (nötig für `extractLastName`).
 */
function tokenize(fullName: string): { raw: string; lower: string }[] {
  const trimmed = fullName.trim();
  if (!trimmed) return [];
  const commaIdx = trimmed.indexOf(",");
  let ordered: string;
  if (commaIdx >= 0) {
    const before = trimmed.slice(0, commaIdx).trim();
    const after = trimmed.slice(commaIdx + 1).trim();
    ordered = after && before ? `${after} ${before}` : after || before;
  } else {
    ordered = trimmed;
  }
  return ordered
    .split(/\s+/)
    .map((t) => {
      const cleaned = t.replace(/[,.]+$/g, "");
      return { raw: cleaned, lower: cleaned.toLowerCase() };
    })
    .filter((t) => t.raw.length > 0);
}

function isPrefix(lower: string): boolean {
  return NAME_PREFIXES.has(lower);
}

/**
 * Gibt den ersten Vornamen zurück. Berücksichtigt akademische Titel, Adels-
 * Prädikate, Komma-Formate ("Müller, Thomas") und Bindestrich-Namen
 * ("Hans-Peter" → "Hans"). Default liefert lowercased (für Lookups).
 * Mit `{ preserveCase: true }` in Original-Schreibweise — für Templates.
 */
export function extractFirstName(
  fullName: string | null | undefined,
  opts?: { preserveCase?: boolean },
): string | null {
  if (!fullName) return null;
  const tokens = tokenize(fullName);
  // Sonderfall: "Herr Özdemir" / "Frau Nguyen" — Anrede-Prefix + genau ein
  // weiteres Token → dieses Token ist der Nachname, kein Vorname bekannt.
  if (salutationFromPrefix(fullName)) {
    const nonPrefix = tokens.filter((t) => !isPrefix(t.lower));
    if (nonPrefix.length <= 1) return null;
  }
  for (const t of tokens) {
    if (isPrefix(t.lower)) continue;
    const baseRaw = t.raw.split(/[-–]/)[0];
    const baseLower = t.lower.split(/[-–]/)[0];
    if (!baseLower || isPrefix(baseLower)) continue;
    return opts?.preserveCase ? baseRaw : baseLower;
  }
  return null;
}

/**
 * Gibt den Nachnamen zurück — letztes Nicht-Prefix-Token. Bei Komma-Format
 * ("Müller, Thomas") → das Teil VOR dem Komma. Bewahrt die Original-
 * Schreibweise (für "Sehr geehrter Herr Müller").
 */
export function extractLastName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;

  const commaIdx = trimmed.indexOf(",");
  const source = commaIdx >= 0 ? trimmed.slice(0, commaIdx).trim() : trimmed;
  if (!source) return null;

  const tokens = source
    .split(/\s+/)
    .map((t) => ({ raw: t.replace(/[,.]+$/g, ""), lower: t.replace(/[,.]+$/g, "").toLowerCase() }))
    .filter((t) => t.raw.length > 0);

  const nonPrefix = tokens.filter((t) => !isPrefix(t.lower));

  // Sonderfall: "Herr Özdemir" — ein Anrede-Prefix + genau ein weiteres Token
  // → dieses Token ist explizit der Nachname.
  if (commaIdx < 0 && salutationFromPrefix(trimmed) && nonPrefix.length === 1) {
    return nonPrefix[0].raw;
  }

  // Sonst: im Nicht-Komma-Fall brauchen wir mindestens 2 Nicht-Prefix-Tokens,
  // um Vorname/Nachname unterscheiden zu können.
  if (commaIdx < 0 && nonPrefix.length < 2) return null;

  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!isPrefix(tokens[i].lower)) return tokens[i].raw;
  }
  return null;
}

/** Lookup mit Diakritika-Fallback (Schicht D). */
function lookupName(lower: string): "herr" | "frau" | null {
  if (!lower) return null;
  if (MALE_NAMES.has(lower)) return "herr";
  if (FEMALE_NAMES.has(lower)) return "frau";
  const stripped = stripDiacritics(lower);
  if (stripped !== lower) {
    if (MALE_NAMES.has(stripped)) return "herr";
    if (FEMALE_NAMES.has(stripped)) return "frau";
  }
  return null;
}

/**
 * Rät die Anrede aus einem vollen Namen. Gibt `null` zurück, wenn weder
 * Prefix noch Vornamen-Lookup etwas liefern.
 */
export function guessSalutationFromName(fullName: string | null | undefined): "herr" | "frau" | null {
  if (!fullName) return null;

  // Schicht A: "Herr Özdemir", "Frau Nguyen", "Hr. Schmidt" — Prefix gewinnt.
  const prefixHit = salutationFromPrefix(fullName);
  if (prefixHit) return prefixHit;

  // Schichten B+C+D: tokenize (mit Komma-Swap) + Lookup pro Token, Bindestrich-Basis.
  const tokens = tokenize(fullName);
  for (const t of tokens) {
    if (isPrefix(t.lower)) continue;
    const base = t.lower.split(/[-–]/)[0];
    const hit = lookupName(base) ?? lookupName(t.lower);
    if (hit) return hit;
    // Stoppen nach dem ersten Nicht-Prefix-Token: Wir wollen nicht durch alle
    // Tokens iterieren, sonst könnten mehrdeutige Konstellationen wie
    // "Andrea Thomas" (Vorname mehrdeutig, Nachname = männlicher Vorname)
    // zu Fehlklassifikationen führen. Die Komma-Swap-Logik in `tokenize`
    // erledigt den Surname-First-Fall bereits explizit.
    return null;
  }
  return null;
}

/**
 * Erkennt die Anrede aus einem E-Mail-Localpart (Schicht E, Fallback wenn
 * Namensfeld nichts liefert). Beispiel: "thomas.mueller@firma.de" → "herr".
 * Guard: Rollen-Postfächer (info@, hr@, …) geben `null` zurück.
 */
export function guessSalutationFromEmailLocalpart(
  email: string | null | undefined,
): "herr" | "frau" | null {
  if (!email) return null;
  const atIdx = email.indexOf("@");
  const local = (atIdx > 0 ? email.slice(0, atIdx) : email).toLowerCase().trim();
  if (!local) return null;

  const parts = local.split(/[._+\-0-9]+/).filter((p) => p.length >= 2);
  if (parts.length === 0) return null;

  // Rollen-Guard: wenn einer der Parts ein Rollen-Keyword ist → abbrechen.
  if (parts.some((p) => EMAIL_ROLE_KEYWORDS.has(p))) return null;

  for (const p of parts) {
    const hit = lookupName(p);
    if (hit) return hit;
  }
  return null;
}

/**
 * Composite-Entrypoint: versucht in Reihenfolge rawSalutation → Name → E-Mail.
 * Alle Quellen sind optional; gibt `null` zurück, wenn nichts greift.
 */
export function guessSalutation(input: {
  name?: string | null;
  email?: string | null;
  rawSalutation?: string | null;
}): "herr" | "frau" | null {
  return (
    normalizeSalutationString(input.rawSalutation) ??
    guessSalutationFromName(input.name) ??
    guessSalutationFromEmailLocalpart(input.email)
  );
}

/**
 * Normalisiert Roh-Strings aus CSV/Text (z. B. "Herr", "Frau", "Hr.") auf
 * unsere Enum-Werte. Unbekannte Werte → null.
 */
export function normalizeSalutationString(raw: string | null | undefined): "herr" | "frau" | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase().replace(/\.+$/, "");
  if (lower === "herr" || lower === "hr" || lower === "mr" || lower === "herrn") return "herr";
  if (lower === "frau" || lower === "fr" || lower === "mrs" || lower === "ms") return "frau";
  return null;
}
