const BLOCK_CLOSE = /<\/(div|p|li|h[1-6]|blockquote|tr)>/gi;

export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

export function plainToHtml(text: string): string {
  const value = text.trim();
  if (!value) return "";
  if (looksLikeHtml(value)) return value;
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<div>${paragraph.replace(/\n/g, "<br>")}</div>`)
    .join("");
}

/**
 * Plain text → the HTML that is actually sent. Each paragraph is a block and
 * a blank line between paragraphs is an explicit empty block, so Gmail and
 * other clients show the same spacing as the editor (bare <div>s collapse it).
 */
export function plainToEmailHtml(text: string): string {
  const value = text.trim();
  if (!value) return "";
  if (looksLikeHtml(value)) return value;
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => `<div>${paragraph.replace(/\n/g, "<br>")}</div>`)
    .join("<div><br></div>");
}

export function htmlToPlain(html: string): string {
  return html
    .replace(BLOCK_CLOSE, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|textarea|button)[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/expression\s*\(/gi, "");
}

export function wrapEmailHtml(html: string): string {
  const inner = sanitizeEmailHtml(html).trim() || "<div></div>";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222222;">${inner}</div>`;
}
