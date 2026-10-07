/** Working out the sender's name from their account. Pure, no `@/` imports. */

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Google and email sign-ups store the person's name in user metadata under a few keys. */
export function nameFromMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null;
  const direct = [meta.full_name, meta.name, meta.display_name].find((v) => typeof v === "string" && v.trim().length > 1) as string | undefined;
  if (direct) return direct.trim().replace(/\s+/g, " ");
  const given = typeof meta.given_name === "string" ? meta.given_name.trim() : "";
  const family = typeof meta.family_name === "string" ? meta.family_name.trim() : "";
  const joined = `${given} ${family}`.trim();
  return joined.length > 1 ? joined : null;
}

/** "rajiv.ramanan@x.com" → "Rajiv Ramanan". A single run of letters ("keithkatale1") is not a reliable name, so it gives nothing. */
export function nameFromEmail(email: string | null | undefined): string | null {
  const [local = "", domain = ""] = (email ?? "").split("@");
  // Guest accounts have machine-made addresses, not names.
  if (/(^|\.)guest\./i.test(domain)) return null;
  const parts = local.split(/[._-]+/).map((p) => p.replace(/\d+/g, "")).filter((p) => /^[a-z]{3,}$/i.test(p));
  if (parts.length < 2) return null;
  return parts.slice(0, 2).map(cap).join(" ");
}

export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  return first.length > 1 ? first : null;
}

/**
 * Models sometimes leave a placeholder like "[Sender Name]" in the sign-off.
 * Fill it with the real name, or drop it when the name is unknown, so no
 * email ever goes out with a bracketed stand-in.
 */
export function fillSenderPlaceholders(body: string, senderName: string | null): string {
  const named = body.replace(/\[\s*(?:sender|your|my|sender's|signature)[^\]]*\]/gi, senderName ?? "");
  return named
    .split("\n")
    // A line that is nothing but a bracketed stand-in ("[Company Name]") carries no information.
    .filter((line) => !/^\s*\[[^\]]+\]\s*$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}
