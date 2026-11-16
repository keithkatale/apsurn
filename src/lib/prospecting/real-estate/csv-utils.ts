/**
 * CSV serialization & parsing helpers for Real Estate Leads.
 * Compatible with Apsurn's `src/lib/prospecting/csv.ts`.
 */

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of record objects into a CSV string with sorted union headers
 * (matching Python's `csv.DictWriter` behavior in `generate_100_real_leads.py`).
 */
export function recordsToCsv<T extends object>(
  rows: T[],
  explicitColumns?: string[],
): string {
  if (rows.length === 0) return "";

  const fieldSet = new Set<string>();
  if (explicitColumns && explicitColumns.length > 0) {
    for (const col of explicitColumns) fieldSet.add(col);
  } else {
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        fieldSet.add(key);
      }
    }
  }

  const fieldnames =
    explicitColumns && explicitColumns.length > 0
      ? explicitColumns
      : Array.from(fieldSet).sort();

  const headerLine = fieldnames.map(escapeCsvCell).join(",");
  const dataLines = rows.map((row) => {
    const rec = row as Record<string, unknown>;
    return fieldnames.map((field) => escapeCsvCell(rec[field] ?? "")).join(",");
  });

  return [headerLine, ...dataLines].join("\n");
}

/**
 * Parses a CSV string (supporting quoted fields, escaped quotes, and CRLF/LF newlines)
 * into an array of string-keyed objects.
 */
export function parseCsvRecords(csvText: string): Record<string, string>[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  const text = csvText.replace(/^\uFEFF/, ""); // Strip BOM if present

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        currentRow.push(currentField);
        currentField = "";
      } else if (ch === "\r" && next === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());

  const result: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0].trim() === "") continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (row[c] ?? "").trim();
    }
    result.push(obj);
  }

  return result;
}
