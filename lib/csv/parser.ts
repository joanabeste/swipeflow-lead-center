/** Erkennt den Delimiter anhand der ersten Zeilen */
export function detectDelimiter(text: string): string {
  // Nur erste Zeile verwenden (sicher außerhalb von Multiline-Feldern)
  const firstLine = text.split("\n")[0] ?? "";
  const candidates = [",", ";", "\t"];
  let bestDelimiter = ",";
  let bestScore = 0;

  for (const d of candidates) {
    const score = firstLine.split(d).length - 1;
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = d;
    }
  }

  return bestDelimiter;
}

/** Parst einen CSV-Text in Header + Zeilen.
 * Unterstützt Multiline-Felder (Zeilenumbrüche innerhalb von Anführungszeichen). */
export function parseCSV(
  text: string,
  delimiter?: string,
): { headers: string[]; rows: string[][] } {
  const d = delimiter ?? detectDelimiter(text);
  const records = parseRecords(text, d);

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0];
  const rows = records.slice(1);

  return { headers, rows };
}

/** Parst den gesamten CSV-Text in Records (Zeichen-für-Zeichen, Multiline-safe) */
function parseRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let currentField = "";
  let currentRecord: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = i + 1 < text.length ? text[i + 1] : "";

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote ""
          currentField += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        // Any char inside quotes (including newlines)
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRecord.push(currentField.trim());
        currentField = "";
      } else if (char === "\r") {
        // Skip \r, handle \n
        continue;
      } else if (char === "\n") {
        currentRecord.push(currentField.trim());
        if (currentRecord.some((f) => f !== "")) {
          records.push(currentRecord);
        }
        currentRecord = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  // Letztes Feld/Record
  currentRecord.push(currentField.trim());
  if (currentRecord.some((f) => f !== "")) {
    records.push(currentRecord);
  }

  return records;
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
