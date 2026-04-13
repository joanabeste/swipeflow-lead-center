/** Erkennt den Delimiter anhand der ersten Zeilen */
export function detectDelimiter(text: string): string {
  const firstLines = text.split("\n").slice(0, 5);
  const candidates = [",", ";", "\t"];
  let bestDelimiter = ",";
  let bestScore = 0;

  for (const d of candidates) {
    const counts = firstLines.map((line) => line.split(d).length - 1);
    // Konsistente Anzahl und möglichst viele Spalten
    const allSame = counts.every((c) => c === counts[0]);
    const score = allSame ? counts[0] : 0;
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = d;
    }
  }

  return bestDelimiter;
}

/** Parst einen CSV-Text in Header + Zeilen */
export function parseCSV(
  text: string,
  delimiter?: string,
): { headers: string[]; rows: string[][] } {
  const d = delimiter ?? detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseLine(lines[0], d);
  const rows = lines.slice(1).map((line) => parseLine(line, d));

  return { headers, rows };
}

/** Parst eine einzelne CSV-Zeile mit einfachem Quote-Handling */
function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}

/** Versucht einen Text-Buffer als UTF-8 zu dekodieren.
 *  Bei Fehlern wird ISO-8859-1 angenommen. */
export function decodeBuffer(buffer: ArrayBuffer): string {
  // Prüfe BOM für UTF-8
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer);
  }

  // Versuch UTF-8
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  try {
    return utf8.decode(buffer);
  } catch {
    // Fallback auf ISO-8859-1 (Latin-1)
    return new TextDecoder("iso-8859-1").decode(buffer);
  }
}
