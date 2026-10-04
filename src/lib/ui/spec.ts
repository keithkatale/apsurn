/**
 * A small, safe UI vocabulary the Copilot composes into custom views, dashboards, calculators and
 * client-facing pages. It is data, never HTML or code: every field is validated and capped here,
 * and rendered by a fixed set of components, so model output can't inject markup or scripts.
 */

export type UiTone = "info" | "success" | "warning";
export type Accent = "neutral" | "blue" | "green" | "amber" | "red" | "purple";
export const ACCENTS: readonly Accent[] = ["neutral", "blue", "green", "amber", "red", "purple"];

/** Show a block only while the control with this id has this value (toggles use "true"/"false"). */
export type When = { id: string; equals: string };

export type TableCell = { text: string; tone?: Accent };

export type UiBody =
  | { type: "hero"; title: string; subtitle?: string; cta?: { label: string; href: string } }
  | { type: "heading"; text: string; level: 1 | 2 | 3 }
  | { type: "text"; markdown: string }
  | { type: "stats"; items: Array<{ label: string; value: string; hint?: string; tone?: Accent }> }
  | {
      type: "table";
      caption?: string;
      accent: Accent;
      striped: boolean;
      columns: Array<{ key: string; label: string }>;
      rows: Array<Record<string, TableCell>>;
    }
  | {
      type: "cards";
      columns: 1 | 2 | 3;
      items: Array<{
        title: string;
        subtitle?: string;
        body?: string;
        badge?: string;
        badgeTone?: Accent;
        href?: string;
        image?: string;
        logoDomain?: string;
      }>;
    }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "steps"; items: Array<{ title: string; body?: string }> }
  | { type: "key_values"; items: Array<{ label: string; value: string }> }
  | { type: "callout"; tone: UiTone; title?: string; text: string }
  | { type: "badges"; items: Array<{ text: string; tone: Accent }> }
  | { type: "progress"; label: string; value: number; tone: Accent }
  | { type: "quote"; text: string; by?: string }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "gallery"; items: Array<{ src: string; alt: string; caption?: string }> }
  | { type: "buttons"; items: Array<{ label: string; action: "prompt" | "link"; text?: string; href?: string }> }
  | { type: "divider" }
  // Interactive
  | { type: "tabs"; items: Array<{ label: string; blocks: UiBlock[] }> }
  | { type: "accordion"; items: Array<{ title: string; blocks: UiBlock[] }> }
  | { type: "select"; id: string; label: string; options: Array<{ value: string; label: string }>; value: string }
  | { type: "toggle"; id: string; label: string; value: boolean }
  | { type: "input"; id: string; label: string; inputType: "text" | "number"; placeholder?: string; value: string }
  | { type: "slider"; id: string; label: string; min: number; max: number; step: number; value: number }
  | {
      type: "metric";
      label: string;
      formula: string;
      format: "number" | "currency" | "percent";
      prefix?: string;
      suffix?: string;
      hint?: string;
    };

export type UiBlock = UiBody & { when?: When };

const MAX_BLOCKS = 60;
const MAX_ROWS = 200;
const MAX_ITEMS = 60;
const MAX_TEXT = 8000;
const MAX_DEPTH = 3;
const ID = /^[a-z][a-z0-9_]{0,30}$/;

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, max = 600): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optStr(value: unknown, max = 600): string | undefined {
  const s = str(value, max);
  return s ? s : undefined;
}

function arr(value: unknown, max = MAX_ITEMS): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function accent(value: unknown, fallback: Accent = "neutral"): Accent {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value) ? (value as Accent) : fallback;
}

function optAccent(value: unknown): Accent | undefined {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value) ? (value as Accent) : undefined;
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Only web links, mail links and in-app paths. No javascript:, data: or protocol-relative URLs. */
export function safeHref(value: unknown): string | undefined {
  const href = str(value, 800);
  if (!href) return undefined;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href;
  return undefined;
}

export function safeImage(value: unknown): string | undefined {
  const src = str(value, 800);
  return /^https:\/\//i.test(src) ? src : undefined;
}

function domainOf(value: unknown): string | undefined {
  const d = str(value, 120).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : undefined;
}

function sanitizeWhen(raw: unknown): When | undefined {
  const w = rec(raw);
  const id = str(w.id, 40);
  if (!ID.test(id)) return undefined;
  const equals = str(w.equals, 80);
  return { id, equals };
}

function sanitizeBody(raw: unknown, depth: number): UiBody | null {
  const b = rec(raw);
  switch (b.type) {
    case "hero": {
      const title = str(b.title, 200);
      if (!title) return null;
      const cta = rec(b.cta);
      const href = safeHref(cta.href);
      const label = str(cta.label, 60);
      return { type: "hero", title, subtitle: optStr(b.subtitle, 400), cta: href && label ? { label, href } : undefined };
    }
    case "heading": {
      const text = str(b.text, 200);
      if (!text) return null;
      return { type: "heading", text, level: b.level === 1 || b.level === 3 ? b.level : 2 };
    }
    case "text": {
      const markdown = str(b.markdown ?? b.text, MAX_TEXT);
      return markdown ? { type: "text", markdown } : null;
    }
    case "stats": {
      const items = arr(b.items, 8)
        .map((i) => ({
          label: str(rec(i).label, 60),
          value: str(rec(i).value, 40),
          hint: optStr(rec(i).hint, 80),
          tone: optAccent(rec(i).tone),
        }))
        .filter((i) => i.label && i.value);
      return items.length ? { type: "stats", items } : null;
    }
    case "table": {
      const columns = arr(b.columns, 12)
        .map((c) => {
          const col = rec(c);
          return { key: str(col.key ?? col.label, 60), label: str(col.label ?? col.key, 60) };
        })
        .filter((c) => c.key && c.label);
      if (!columns.length) return null;
      const rows = arr(b.rows, MAX_ROWS).map((r) => {
        const row = rec(r);
        const out: Record<string, TableCell> = {};
        for (const c of columns) {
          const cell = row[c.key];
          if (cell && typeof cell === "object" && !Array.isArray(cell)) {
            const o = rec(cell);
            out[c.key] = { text: str(o.text ?? o.value, 300), tone: optAccent(o.tone) };
          } else {
            out[c.key] = { text: str(cell, 300) };
          }
        }
        return out;
      });
      return {
        type: "table",
        caption: optStr(b.caption, 200),
        accent: accent(b.accent),
        striped: b.striped === true,
        columns,
        rows,
      };
    }
    case "cards": {
      const items = arr(b.items, 24)
        .map((i) => {
          const c = rec(i);
          return {
            title: str(c.title, 160),
            subtitle: optStr(c.subtitle, 200),
            body: optStr(c.body, 800),
            badge: optStr(c.badge, 40),
            badgeTone: optAccent(c.badgeTone),
            href: safeHref(c.href),
            image: safeImage(c.image),
            logoDomain: domainOf(c.logoDomain ?? c.logo_domain),
          };
        })
        .filter((c) => c.title);
      if (!items.length) return null;
      return { type: "cards", columns: b.columns === 1 || b.columns === 3 ? b.columns : 2, items };
    }
    case "list": {
      const items = arr(b.items).map((i) => str(i, 400)).filter(Boolean);
      return items.length ? { type: "list", ordered: b.ordered === true, items } : null;
    }
    case "steps": {
      const items = arr(b.items, 20)
        .map((i) => ({ title: str(rec(i).title, 160), body: optStr(rec(i).body, 600) }))
        .filter((i) => i.title);
      return items.length ? { type: "steps", items } : null;
    }
    case "key_values": {
      const items = arr(b.items, 30)
        .map((i) => ({ label: str(rec(i).label, 80), value: str(rec(i).value, 400) }))
        .filter((i) => i.label);
      return items.length ? { type: "key_values", items } : null;
    }
    case "callout": {
      const text = str(b.text, 1200);
      if (!text) return null;
      return { type: "callout", tone: b.tone === "success" || b.tone === "warning" ? b.tone : "info", title: optStr(b.title, 120), text };
    }
    case "badges": {
      const items = arr(b.items, 30)
        .map((i) => (typeof i === "object" && i ? { text: str(rec(i).text, 40), tone: accent(rec(i).tone) } : { text: str(i, 40), tone: "neutral" as Accent }))
        .filter((i) => i.text);
      return items.length ? { type: "badges", items } : null;
    }
    case "progress": {
      const label = str(b.label, 80);
      return label ? { type: "progress", label, value: Math.min(100, Math.max(0, num(b.value, 0))), tone: accent(b.tone, "blue") } : null;
    }
    case "quote": {
      const text = str(b.text, 600);
      return text ? { type: "quote", text, by: optStr(b.by, 80) } : null;
    }
    case "image": {
      const src = safeImage(b.src);
      return src ? { type: "image", src, alt: str(b.alt, 160), caption: optStr(b.caption, 200) } : null;
    }
    case "gallery": {
      const items = arr(b.items, 12)
        .map((i) => ({ src: safeImage(rec(i).src), alt: str(rec(i).alt, 160), caption: optStr(rec(i).caption, 160) }))
        .filter((i): i is { src: string; alt: string; caption: string | undefined } => Boolean(i.src));
      return items.length ? { type: "gallery", items } : null;
    }
    case "buttons": {
      const items = arr(b.items, 8)
        .map((i) => {
          const btn = rec(i);
          const label = str(btn.label, 60);
          if (!label) return null;
          if (btn.action === "link") {
            const href = safeHref(btn.href);
            return href ? { label, action: "link" as const, href } : null;
          }
          const text = str(btn.text ?? btn.label, 400);
          return text ? { label, action: "prompt" as const, text } : null;
        })
        .filter((i): i is NonNullable<typeof i> => i !== null);
      return items.length ? { type: "buttons", items } : null;
    }
    case "divider":
      return { type: "divider" };

    case "tabs": {
      if (depth >= MAX_DEPTH) return null;
      const items = arr(b.items, 8)
        .map((i) => ({ label: str(rec(i).label, 40), blocks: sanitizeAt(rec(i).blocks, depth + 1) }))
        .filter((i) => i.label && i.blocks.length);
      return items.length ? { type: "tabs", items } : null;
    }
    case "accordion": {
      if (depth >= MAX_DEPTH) return null;
      const items = arr(b.items, 12)
        .map((i) => ({ title: str(rec(i).title, 160), blocks: sanitizeAt(rec(i).blocks, depth + 1) }))
        .filter((i) => i.title && i.blocks.length);
      return items.length ? { type: "accordion", items } : null;
    }
    case "select": {
      const id = str(b.id, 40);
      const options = arr(b.options, 20)
        .map((o) => {
          const opt = rec(o);
          const label = str(opt.label ?? opt.value, 80);
          return { value: str(opt.value ?? opt.label, 80), label };
        })
        .filter((o) => o.value && o.label);
      if (!ID.test(id) || options.length < 2) return null;
      const wanted = str(b.value, 80);
      return {
        type: "select",
        id,
        label: str(b.label, 80) || id,
        options,
        value: options.some((o) => o.value === wanted) ? wanted : options[0].value,
      };
    }
    case "toggle": {
      const id = str(b.id, 40);
      return ID.test(id) ? { type: "toggle", id, label: str(b.label, 80) || id, value: b.value === true } : null;
    }
    case "input": {
      const id = str(b.id, 40);
      if (!ID.test(id)) return null;
      const inputType = b.inputType === "number" || b.type_hint === "number" ? "number" : "text";
      return {
        type: "input",
        id,
        label: str(b.label, 80) || id,
        inputType,
        placeholder: optStr(b.placeholder, 80),
        value: str(b.value, 200),
      };
    }
    case "slider": {
      const id = str(b.id, 40);
      if (!ID.test(id)) return null;
      const min = num(b.min, 0);
      const max = Math.max(min + 1, num(b.max, 100));
      const step = Math.max(0.0001, num(b.step, 1));
      return {
        type: "slider",
        id,
        label: str(b.label, 80) || id,
        min,
        max,
        step,
        value: Math.min(max, Math.max(min, num(b.value, min))),
      };
    }
    case "metric": {
      const label = str(b.label, 80);
      const formula = str(b.formula, 200);
      if (!label || !formula) return null;
      const format = b.format === "currency" || b.format === "percent" ? b.format : "number";
      return { type: "metric", label, formula, format, prefix: optStr(b.prefix, 8), suffix: optStr(b.suffix, 12), hint: optStr(b.hint, 120) };
    }
    default:
      return null;
  }
}

function sanitizeAt(input: unknown, depth: number): UiBlock[] {
  return arr(input, MAX_BLOCKS)
    .map((raw) => {
      const body = sanitizeBody(raw, depth);
      if (!body) return null;
      const block: UiBlock = body;
      const when = sanitizeWhen(rec(raw).when);
      if (when) block.when = when;
      return block;
    })
    .filter((b): b is UiBlock => b !== null);
}

/** Validates model-produced blocks. Unknown or malformed blocks are dropped rather than rendered. */
export function sanitizeBlocks(input: unknown): UiBlock[] {
  return sanitizeAt(input, 0);
}

/** Accepts the array itself, or a JSON string of it (what the tool schema asks the model for). */
export function parseBlocks(input: unknown): UiBlock[] {
  if (typeof input === "string") {
    try {
      return sanitizeBlocks(JSON.parse(input));
    } catch {
      return [];
    }
  }
  return sanitizeBlocks(input);
}

/** Compact vocabulary description reused in tool docs so the model knows what it can build. */
export const UI_SPEC_GUIDE = `Blocks (JSON array; each is an object with "type"). Any block may add "when":{"id":"<control id>","equals":"<value>"} to show only while that control has that value (toggle values are "true"/"false").
Display:
- hero {title, subtitle?, cta?:{label,href}}
- heading {text, level:1|2|3}
- text {markdown}  (full Markdown: bold, lists, links, tables, blockquotes)
- stats {items:[{label,value,hint?,tone?}]} (max 8)
- table {caption?, accent?, striped?, columns:[{key,label}], rows:[{<key>: "text" | {text, tone}}]}  tone/accent: neutral|blue|green|amber|red|purple. Use cell tones to colour statuses and scores.
- cards {columns:1|2|3, items:[{title,subtitle?,body?,badge?,badgeTone?,href?,image?(https),logoDomain?("acme.com" shows its logo)}]}
- list {ordered?, items:[string]}   steps {items:[{title,body?}]}   key_values {items:[{label,value}]}
- callout {tone:"info"|"success"|"warning", title?, text}   badges {items:[string | {text,tone}]}
- progress {label, value:0-100, tone?}   quote {text, by?}
- image {src(https only), alt, caption?}   gallery {items:[{src,alt,caption?}]}
- buttons {items:[{label, action:"prompt", text} | {label, action:"link", href}]}  ("prompt" sends text to Copilot when clicked; chat only)
- divider {}
Interactive (state lives in the page; ids are lowercase_snake):
- tabs {items:[{label, blocks:[...]}]}   accordion {items:[{title, blocks:[...]}]}
- select {id, label, options:[{value,label}], value?}  (a dropdown; pair with "when" on other blocks to change what is shown)
- toggle {id, label, value?:boolean}   input {id, label, inputType?:"text"|"number", placeholder?, value?}
- slider {id, label, min, max, step, value}
- metric {label, formula, format?:"number"|"currency"|"percent", prefix?, suffix?, hint?}  (formula uses control ids, + - * / ( ) and min() max() round(); e.g. "seats * price * 12". Toggles count as 1/0.)`;
