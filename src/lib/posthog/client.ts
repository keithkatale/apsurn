import posthog from "posthog-js";

export function getPosthogKey() {
  return process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() || "";
}

export function getPosthogHost() {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
}

export function initPosthog() {
  const key = getPosthogKey();
  if (!key || typeof window === "undefined") return;
  if (posthog.__loaded) return;
  posthog.init(key, {
    api_host: getPosthogHost(),
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
  });
}

export { posthog };
