/**
 * Cold-email copywriting knowledge shared by every AI email writer in the app, plus a formatter that guarantees
 * the result always has paragraphs, even when a model returns one long run of text.
 */

export const COLD_EMAIL_PLAYBOOK = `COLD EMAIL PLAYBOOK (follow it strictly)

FORMAT (non-negotiable)
- Write the body as plain text with real line breaks. Separate every paragraph with ONE BLANK LINE (two newline characters, "\\n\\n").
- Layout: greeting on its own line, blank line, 3-4 short paragraphs of 1-2 sentences each, blank line, one-line question, blank line, sign-off ("Best," on its own line, then the sender name on the next line).
- Never return a single block of text. Never use markdown, bullets, bold, emojis, links or images.
- 50-90 words in the body for a first email, 40-60 for follow-ups. Shorter beats longer. Reads well on a phone.

STRUCTURE (first email)
1. Greeting: "Hi {{first_name}},".
2. Relevance line: one sentence proving this was written for them (their role, company, a trigger or a pain point). Never open with "I hope this finds you well", "My name is", or a company pitch.
3. Problem: the specific pain people in their seat have, in their words, not product jargon.
4. Proof or value: one concrete outcome, number or example. One idea per email. Say what changes for them, not what the product has (benefit over feature).
5. Single low-friction call to action: a question that is easy to answer yes or no to ("Worth a quick look?", "Is this on your radar at {{company}}?"). Never ask for 30 minutes in the first email. Only one ask.
6. Sign-off: "Best," then the sender name.

STYLE
- Write like a smart peer, not a marketer. Plain words, contractions, second person ("you"), active voice. 6th-grade reading level.
- Be specific, never generic: no "revolutionary", "cutting-edge", "synergy", "leverage", "game-changing", "best-in-class", "streamline", "solutions".
- No flattery, no fake familiarity, no false urgency, no "just following up", no apologies, no exclamation marks, no ALL CAPS.
- Do not invent facts, customers, results or mutual connections. If you lack proof, lead with a sharp observation or question instead.
- Subject line: 2-5 words, lowercase, specific and curiosity-driven, looks like an internal email ("quick question on {{company}}", "idea for {{company}}"). No clickbait, no "Re:" tricks on a first email.

FOLLOW-UPS
- Day 3: add NEW value (an insight, a short example, a different angle), do not just "bump" the thread. Keep it 2-3 short paragraphs.
- Day 7: a polite, short breakup that gives them an easy out ("Should I close the loop?"). No guilt.

MERGE TAGS
- Use only these tags, written exactly like this: {{first_name}}, {{full_name}}, {{title}}, {{company}}, {{domain}}. Do not invent others.`;

const GREETING = /^((?:hi|hey|hello|dear)\b[^,\n]{0,40},)\s*/i;
const SIGN_OFF = /\s*((?:best(?: regards)?|thanks(?: so much)?|thank you|cheers|regards|sincerely|warmly|talk soon)),?\s*([^\n]{0,60})$/i;

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

/**
 * Normalizes an email body into readable paragraphs separated by one blank line.
 * Bodies that already have paragraphs are only cleaned up; a single run of text is split into a greeting,
 * short paragraphs (up to 2 sentences each) and a sign-off.
 */
export function formatEmailBody(input: string): string {
  let text = (input ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\n/g, "\n") // models sometimes return a literal backslash-n
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return "";

  // Keep "Best," and the name on separate lines even when paragraphs already exist.
  const tidy = (value: string) =>
    value
      .replace(/\n{3,}/g, "\n\n")
      .replace(/((?:^|\n)(?:best(?: regards)?|thanks|thank you|cheers|regards|sincerely),)[ \t]+(\S)/gi, "$1\n$2")
      .trim();

  if (/\n\s*\n/.test(text)) return tidy(text);

  // One block (or only single line breaks): rebuild the structure.
  const flat = text.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  let rest = flat;
  const blocks: string[] = [];

  const greeting = rest.match(GREETING);
  if (greeting) {
    blocks.push(greeting[1]);
    rest = rest.slice(greeting[0].length);
  }

  let signoff: string | null = null;
  const sign = rest.match(SIGN_OFF);
  if (sign && sign.index !== undefined && sign.index > 20) {
    signoff = `${sign[1].replace(/^./, (c) => c.toUpperCase())},${sign[2] ? `\n${sign[2].trim()}` : ""}`;
    rest = rest.slice(0, sign.index).trim();
  }

  const sentences = splitSentences(rest);
  const question = sentences.length > 2 && sentences[sentences.length - 1].endsWith("?") ? sentences.pop()! : null;
  for (let i = 0; i < sentences.length; i += 2) blocks.push(sentences.slice(i, i + 2).join(" "));
  if (question) blocks.push(question);
  if (signoff) blocks.push(signoff);

  return tidy(blocks.join("\n\n"));
}
