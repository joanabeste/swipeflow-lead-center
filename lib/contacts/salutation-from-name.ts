/**
 * Heuristische Anrede-Erkennung aus Vornamen.
 *
 * Bewusst konservativ: mehrdeutige Namen (Andrea, Kim, Nikola, Conny, Toni,
 * Sascha, Dominique) sind NICHT in der Liste → Rückgabe `null`. Besser null
 * als falsch, weil eine falsche Anrede schlimmer wirkt als eine neutrale.
 *
 * Quelle: häufigste deutsche Vornamen (Statistisches Bundesamt / Destatis +
 * verbreitete internationale Vornamen in deutschen Firmen).
 */

// Männliche Vornamen (Kleinbuchstaben, für Lookup).
const MALE_NAMES = new Set<string>([
  // Klassiker & häufige deutsche Vornamen
  "alexander", "andreas", "anton", "arne", "arno", "arthur", "axel",
  "ben", "benedikt", "benjamin", "bernd", "bernhard", "bjoern", "björn", "boris", "bruno", "burkhard",
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
  "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "mister", "miss",
  "von", "van", "de", "di", "del", "della", "zu", "zur", "vom", "der",
]);

function extractFirstName(fullName: string): string | null {
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[,.]+$/g, "").toLowerCase());
  for (const token of tokens) {
    if (!token) continue;
    if (NAME_PREFIXES.has(token)) continue;
    // Mehrteilige Vornamen (z. B. "Hans-Peter"): ersten Teil verwenden.
    const base = token.split(/[-–]/)[0];
    if (base && !NAME_PREFIXES.has(base)) return base;
    if (token && !NAME_PREFIXES.has(token)) return token;
  }
  return null;
}

/**
 * Rät die Anrede aus einem vollen Namen. Gibt `null` zurück, wenn der
 * Vorname nicht im Wörterbuch ist oder mehrdeutig wäre.
 */
export function guessSalutationFromName(fullName: string | null | undefined): "herr" | "frau" | null {
  if (!fullName) return null;
  const firstName = extractFirstName(fullName);
  if (!firstName) return null;
  if (MALE_NAMES.has(firstName)) return "herr";
  if (FEMALE_NAMES.has(firstName)) return "frau";
  return null;
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
