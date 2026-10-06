// Platform email templates. Table layout and inline styles only, so they hold
// up in Gmail and Outlook. Every template returns { html, text }.

const BLUE = "#2f5fd0";
const INK = "#171717";
const MUTED = "#737373";
const BODY = "#525252";
const BORDER = "#e2e8f0";
const FIELD = "#f8fafd";
const HEAD = "Manrope,'Helvetica Neue',Arial,sans-serif";
const SANS = "Geist,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'Geist Mono',ui-monospace,Menlo,Consolas,monospace";

export function appOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://apsurn.com";
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const multiline = (value: string) => escapeHtml(value).replace(/\n/g, "<br/>");

function button(label: string, href: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${BLUE}" style="border-radius:12px;">
<a href="${escapeHtml(href)}" style="display:block;padding:15px 20px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

const divider = `<div style="height:1px;line-height:1px;background:${BORDER};margin:4px 0;">&nbsp;</div>`;
const gap = (px: number) => `<div style="height:${px}px;line-height:${px}px;">&nbsp;</div>`;
const para = (html: string, size = 16, color = BODY) =>
  `<p style="margin:0;font-family:${SANS};font-size:${size}px;line-height:1.55;color:${color};">${html}</p>`;
const small = (html: string) => para(html, 13, MUTED);

function shell(opts: { preheader: string; eyebrow: string; title: string; titleSize?: number; body: string; footer: string; internal?: boolean }) {
  const logo = `${appOrigin()}/branding/email-logo.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(opts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@800&family=Geist:wght@400;600&family=Geist+Mono:wght@500&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${FIELD};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${FIELD}"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
<tr><td style="padding:0 4px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
<td width="28" style="width:28px;"><img src="${logo}" width="28" height="28" alt="apsurn" style="display:block;border:0;border-radius:7px;"></td>
<td style="padding-left:8px;font-family:${HEAD};font-weight:800;font-size:20px;letter-spacing:-0.02em;color:${INK};">apsurn</td>${
    opts.internal
      ? `<td align="right" style="font-family:${SANS};font-size:12px;font-weight:600;color:${BODY};">Team only</td>`
      : ""
  }
</tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;padding:40px;">
<div style="font-family:${SANS};font-size:13px;font-weight:600;color:${BLUE};">${escapeHtml(opts.eyebrow)}</div>
${gap(12)}
<h1 style="margin:0;font-family:${HEAD};font-weight:800;font-size:${opts.titleSize ?? 28}px;line-height:1.15;letter-spacing:-0.02em;color:${INK};">${escapeHtml(opts.title)}</h1>
${gap(20)}
${opts.body}
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">${opts.footer}</td></tr>
</table></td></tr></table>
</body>
</html>`;
}

export function verificationEmail(params: { code: string; link: string }) {
  const boxes = params.code
    .split("")
    .map(
      (digit) =>
        `<td align="center" width="16%" style="padding:0 4px;"><div style="background:${FIELD};border:1px solid ${BORDER};border-radius:12px;padding:16px 0;font-family:${MONO};font-weight:500;font-size:28px;color:${INK};">${escapeHtml(digit)}</div></td>`
    )
    .join("");
  const body = [
    para("Enter this code in apsurn, or use the button to verify and pick up where you left off."),
    gap(20),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px;width:calc(100% + 8px);"><tr>${boxes}</tr></table>`,
    gap(24),
    button("Verify and continue", params.link),
    gap(20),
    divider,
    gap(8),
    small("Didn't ask for this? You can safely ignore this email. Nobody gets into your account without the code."),
  ].join("\n");
  const html = shell({
    preheader: `Your apsurn verification code is ${params.code}`,
    eyebrow: "Verify your email",
    title: "Confirm it's you to finish setting up",
    body,
    footer: "Sent by apsurn because someone used this address to create an account.<br>Questions? Just reply to this email.",
  });
  const text = [
    `Your apsurn verification code is ${params.code}.`,
    "",
    "Or open this link to verify and continue:",
    params.link,
    "",
    "Didn't ask for this? You can ignore this email.",
  ].join("\n");
  return { html, text };
}

export function welcomeEmail(params: { dashboardUrl?: string } = {}) {
  const url = params.dashboardUrl ?? `${appOrigin()}/dashboard/campaigns`;
  const steps: [string, string][] = [
    ["Describe who you want to reach", "Tell apsurn about your offer and it builds a campaign plan for you."],
    ["Find or upload your prospects", "Let apsurn prospect for you, or start from your own CSV list."],
    ["Connect your inbox and approve", "Messages send from your own address, and nothing goes out until you approve it."],
  ];
  const rows = steps
    .map(
      ([title, text], i) =>
        `<tr><td style="padding:18px;${i < steps.length - 1 ? `border-bottom:1px solid ${BORDER};` : ""}">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="top" width="28" style="width:28px;"><div style="width:28px;height:28px;line-height:28px;border-radius:14px;background:#e8effd;color:${BLUE};text-align:center;font-family:${HEAD};font-weight:800;font-size:14px;">${i + 1}</div></td>
<td style="padding-left:16px;"><div style="font-family:${SANS};font-weight:600;font-size:15px;color:${INK};">${escapeHtml(title)}</div><div style="font-family:${SANS};font-size:14px;line-height:1.5;color:${BODY};padding-top:2px;">${escapeHtml(text)}</div></td>
</tr></table></td></tr>`
    )
    .join("");
  const body = [
    para("apsurn finds the people worth contacting and helps you reach them from your own inbox. Here is how to get your first campaign moving."),
    gap(20),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:12px;">${rows}</table>`,
    gap(20),
    button("Start your first campaign", url),
    gap(20),
    divider,
    gap(8),
    para("Stuck on anything? Reply to this email or use the chat inside apsurn and a real person will help.", 14),
  ].join("\n");
  const html = shell({
    preheader: "Your account is ready. Here is how to launch your first campaign.",
    eyebrow: "Welcome",
    title: "Your account is ready",
    titleSize: 32,
    body,
    footer: "You're getting this because you created an apsurn account with this address.",
  });
  const text = [
    "Your apsurn account is ready.",
    "",
    "1. Describe who you want to reach.",
    "2. Find or upload your prospects.",
    "3. Connect your inbox and approve. Nothing sends until you do.",
    "",
    `Start your first campaign: ${url}`,
    "",
    "Stuck? Reply to this email and a real person will help.",
  ].join("\n");
  return { html, text };
}

export function supportReplyEmail(params: { content: string; chatUrl?: string }) {
  const url = params.chatUrl ?? appOrigin();
  const body = [
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="36" style="width:36px;"><div style="width:36px;height:36px;line-height:36px;border-radius:18px;background:#4379ee;color:#ffffff;text-align:center;font-family:${HEAD};font-weight:800;font-size:15px;">A</div></td>
<td style="padding-left:12px;"><div style="font-family:${SANS};font-weight:600;font-size:14px;color:${INK};">Apsurn support</div><div style="font-family:${SANS};font-size:12px;color:${MUTED};">replying to your message</div></td>
</tr></table>`,
    gap(16),
    `<div style="background:${FIELD};border:1px solid ${BORDER};border-radius:12px;padding:20px 22px;font-family:${SANS};font-size:16px;line-height:1.6;color:${INK};">${multiline(params.content)}</div>`,
    gap(20),
    button("Continue the chat in apsurn", url),
    gap(20),
    para("Prefer email? Reply here and it goes straight to the team.", 14),
  ].join("\n");
  const html = shell({
    preheader: params.content.slice(0, 90),
    eyebrow: "Support",
    title: "A reply from the Apsurn team",
    body,
    footer: "You're getting this because you chatted with apsurn support.",
  });
  const text = `${params.content}\n\n— Apsurn support\nReply to this email, or continue the chat: ${url}`;
  return { html, text };
}

export type TranscriptMessage = { role: "user" | "assistant" | "admin"; content: string };

export function supportAlertEmail(params: { intro: string; from: string; adminUrl: string; messages: TranscriptMessage[] }) {
  const style = {
    user: { label: "Customer", color: BODY, bg: "#eaeef5", border: "#eaeef5" },
    assistant: { label: "AI assistant", color: BLUE, bg: "#ffffff", border: "#c9d7f7" },
    admin: { label: "Team", color: "#0f6b3f", bg: "#ffffff", border: "#b7e0c9" },
  } as const;
  const bubbles = params.messages
    .map((m) => {
      const s = style[m.role];
      return `<div style="font-family:${SANS};font-size:12px;font-weight:600;color:${s.color};padding-bottom:6px;">${s.label}</div>
<div style="background:${s.bg};border:1px solid ${s.border};border-radius:4px 14px 14px 14px;padding:12px 16px;font-family:${SANS};font-size:15px;line-height:1.5;color:${INK};">${multiline(m.content)}</div>${gap(14)}`;
    })
    .join("\n");
  const body = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${FIELD}" style="background:${FIELD};border:1px solid ${BORDER};border-radius:12px;"><tr>
<td style="padding:16px 18px;"><div style="font-family:${SANS};font-size:12px;color:${MUTED};">From</div><div style="font-family:${SANS};font-size:15px;font-weight:600;color:${INK};">${escapeHtml(params.from)}</div></td>
<td align="right" style="padding:16px 18px;"><a href="${escapeHtml(params.adminUrl)}" style="display:inline-block;background:${BLUE};color:#ffffff;text-decoration:none;border-radius:10px;padding:11px 16px;font-family:${SANS};font-weight:600;font-size:14px;white-space:nowrap;">Open in admin</a></td>
</tr></table>`,
    gap(20),
    bubbles,
    divider,
    gap(8),
    small("Reply to this email to answer the customer directly."),
  ].join("\n");
  const html = shell({
    preheader: params.intro,
    eyebrow: "Support conversation",
    title: params.intro,
    body,
    footer: "Internal notification from the apsurn support inbox.",
    internal: true,
  });
  const text =
    `${params.intro}\n\nFrom: ${params.from}\nOpen in admin: ${params.adminUrl}\n\n` +
    params.messages.map((m) => `${style[m.role].label}: ${m.content}`).join("\n\n");
  return { html, text };
}

const REQUEST_LABELS: Record<string, string> = {
  access: "Access my data",
  correct: "Correct my data",
  delete: "Delete my data",
  suppress: "Stop contacting me",
};

export function privacyRequestEmail(params: { requestType: string; from: string; reference: string; details?: string | null }) {
  const label = REQUEST_LABELS[params.requestType] ?? params.requestType;
  const row = (k: string, v: string, mono = false, last = false) =>
    `<tr><td style="padding:14px 18px;${last ? "" : `border-bottom:1px solid ${BORDER};`}font-family:${SANS};font-size:13px;color:${MUTED};">${k}</td>
<td align="right" style="padding:14px 18px;${last ? "" : `border-bottom:1px solid ${BORDER};`}font-family:${mono ? MONO : SANS};font-size:${mono ? 13 : 14}px;font-weight:${mono ? 500 : 600};color:${INK};">${escapeHtml(v)}</td></tr>`;
  const body = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:12px;">${row("Request type", label)}${row("From", params.from)}${row("Reference", params.reference, true, true)}</table>`,
    params.details
      ? `${gap(20)}<div style="font-family:${SANS};font-size:12px;font-weight:600;color:${BODY};padding-bottom:8px;">Details from the requester</div>
<div style="background:${FIELD};border:1px solid ${BORDER};border-radius:12px;padding:16px 18px;font-family:${SANS};font-size:15px;line-height:1.55;color:${INK};">${multiline(params.details)}</div>`
      : "",
    gap(20),
    divider,
    gap(8),
    small("Quote the reference when you reply, so the request stays traceable."),
  ].join("\n");
  const html = shell({
    preheader: `${label} request from ${params.from}`,
    eyebrow: "Privacy request",
    title: `New request: ${label.toLowerCase()}`,
    body,
    footer: "Internal notification from the apsurn privacy form.",
    internal: true,
  });
  const text = `${label} request from ${params.from}\nReference: ${params.reference}\n\n${params.details ?? ""}`;
  return { html, text };
}
