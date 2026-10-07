/**
 * Shape of a drafted email: the plain-text format the model writes, a parser
 * that works while it streams, and a formatter that guarantees real
 * paragraphs and line breaks instead of one block of text. Pure, no `@/`
 * imports, so it runs under `node --experimental-strip-types`.
 */

export const DRAFT_OUTPUT_FORMAT = `Write the email in exactly this plain-text shape and nothing else (no JSON, no markdown, no quotes around it):
SUBJECT: <the subject line>
---
<the body>

Formatting the body (this matters, it is read on a phone):
- The greeting is its own line, then a blank line.
- 2 to 4 short paragraphs of 1 to 3 sentences each, with a blank line between every paragraph. Never one block of text.
- The ask is its own short paragraph.
- End with a blank line, then a one-word sign-off ("Best,") on its own line and the sender's first name on the next line, using the name given under "Sender". If no sender name is given, stop after the sign-off word. Never write a placeholder such as [Sender Name] or [Your Name].`;

export interface ParsedDraft {
  subject: string;
  body: string;
}

const SIGN_OFF = /^(best|thanks|thank you|cheers|regards|best regards|kind regards|warmly|sincerely|talk soon|—|-)[,.!]?$/i;
const GREETING = /^(hi|hey|hello|dear|good (morning|afternoon|evening))\b[^\n]{0,60}[,:]\s*/i;

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z{"'(])/).map((s) => s.trim()).filter(Boolean);
}

/** One block of text becomes a greeting, short paragraphs and a sign-off. */
function paragraphsFromBlock(text: string): string[] {
  const out: string[] = [];
  let rest = text.trim();
  const greeting = rest.match(GREETING);
  if (greeting) {
    out.push(greeting[0].trim());
    rest = rest.slice(greeting[0].length).trim();
  }
  const sentences = splitSentences(rest);
  for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(" "));
  return out;
}

/** Real paragraphs: blank lines between them, greeting on its own line, sign-off kept with the name under it. */
export function formatEmailBody(raw: string): string {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/[ \t]+$/gm, "")
    .trim();
  if (!text) return "";

  let paragraphs: string[];
  if (/\n\s*\n/.test(text)) {
    paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  } else if (text.includes("\n")) {
    // One line per thought: each line is a paragraph, sign-off lines stay together.
    paragraphs = text.split("\n").map((p) => p.trim()).filter(Boolean);
  } else {
    paragraphs = paragraphsFromBlock(text);
  }

  // "Hi Jorge, I saw…" on one line: the greeting stands alone.
  if (paragraphs.length > 0) {
    const first = paragraphs[0];
    const greeting = first.match(GREETING);
    if (greeting && first.length > greeting[0].length + 1) {
      paragraphs = [greeting[0].trim(), first.slice(greeting[0].length).trim(), ...paragraphs.slice(1)];
    }
  }

  // "Best, Sam" on one line, or "Best," followed by its own name paragraph: keep the sign-off as two lines.
  const merged: string[] = [];
  for (let i = 0; i < paragraphs.length; i += 1) {
    const current = paragraphs[i];
    const inline = current.match(/^(best|thanks|cheers|regards|best regards|kind regards|warmly|sincerely)[,]?\s+(\S.{0,40})$/i);
    if (inline && i === paragraphs.length - 1 && !/[.!?]$/.test(inline[2])) {
      merged.push(`${inline[1].replace(/^./, (c) => c.toUpperCase())},\n${inline[2]}`);
    } else if (SIGN_OFF.test(current) && i < paragraphs.length - 1 && paragraphs[i + 1].split("\n").length === 1 && paragraphs[i + 1].length <= 40) {
      merged.push(`${current}\n${paragraphs[i + 1]}`);
      i += 1;
    } else {
      merged.push(current);
    }
  }
  return merged.join("\n\n");
}

/** Full model output (the SUBJECT/--- shape, or legacy JSON) → subject and formatted body. Null when there is no usable body. */
export function parseDraftText(raw: string): ParsedDraft | null {
  const text = raw.replace(/\r\n?/g, "\n").replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim();
  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text) as { subject?: unknown; body?: unknown };
      const subject = String(json.subject ?? "").trim();
      const body = formatEmailBody(String(json.body ?? ""));
      return subject && body ? { subject, body } : null;
    } catch {
      /* fall through to the text shape */
    }
  }
  const match = text.match(/^\s*subject:\s*(.+?)\s*\n\s*(?:-{3,}\s*\n)?([\s\S]*)$/i);
  if (!match) return null;
  const subject = match[1].replace(/^["']|["']$/g, "").trim();
  const body = formatEmailBody(match[2]);
  return subject && body ? { subject, body } : null;
}

export interface StreamPieces {
  subject?: string;
  body?: string;
}

/**
 * Feeds model text as it arrives and says what to append to the subject and
 * the body. Subject ends at the first newline after "SUBJECT:", the "---" line
 * is swallowed, everything after it is body.
 */
export class DraftStreamParser {
  private buffer = "";
  private phase: "subject" | "gap" | "body" = "subject";
  private subjectSent = 0;

  feed(delta: string): StreamPieces {
    this.buffer += delta;
    const out: StreamPieces = {};

    if (this.phase === "subject") {
      const label = this.buffer.match(/^\s*subject:\s*/i);
      if (!label) {
        // Not enough text yet to know whether the label is present; legacy JSON never streams to the user.
        if (this.buffer.trim().length > 12 && !/^\s*s(u(b(j(e(c(t)?)?)?)?)?)?$/i.test(this.buffer.trim().slice(0, 8))) {
          this.phase = "body";
          out.body = this.buffer;
          this.buffer = "";
        }
        return out;
      }
      const after = this.buffer.slice(label[0].length);
      const newline = after.indexOf("\n");
      if (newline === -1) {
        const piece = after.slice(this.subjectSent);
        if (piece) out.subject = piece;
        this.subjectSent = after.length;
        return out;
      }
      const subject = after.slice(0, newline);
      const piece = subject.slice(this.subjectSent);
      if (piece) out.subject = piece;
      this.buffer = after.slice(newline + 1);
      this.phase = "gap";
    }

    if (this.phase === "gap") {
      const dashes = this.buffer.match(/^\s*-{3,}[ \t]*\n/);
      if (dashes) this.buffer = this.buffer.slice(dashes[0].length);
      else if (/^\s*-{0,3}[ \t]*$/.test(this.buffer)) return out; // still deciding whether the separator is coming
      this.phase = "body";
    }

    if (this.phase === "body" && this.buffer) {
      out.body = (out.body ?? "") + this.buffer.replace(/^\s+/, (lead) => (this.bodyStarted ? lead : ""));
      this.bodyStarted = this.bodyStarted || out.body.length > 0;
      this.buffer = "";
    }
    return out;
  }

  private bodyStarted = false;
}
