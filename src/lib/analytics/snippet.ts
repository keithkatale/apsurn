export function trackingSnippet(origin: string, siteId: string) {
  return `<script defer src="${origin}/trackify.js" data-site-id="${siteId}"></script>`;
}

export function publicOrigin(requestUrl: string) {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(requestUrl).origin;
}
