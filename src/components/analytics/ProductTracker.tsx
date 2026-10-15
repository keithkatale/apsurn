"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const VISITOR_KEY = "apsurn_vid";
const SESSION_KEY = "apsurn_sid";
const SESSION_SEEN_KEY = "apsurn_sid_seen";
const IDLE_MS = 30 * 60_000;

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function read(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    /* private mode: the id just lives for this page */
  }
}

/**
 * Records page views for the admin analytics: who came, from where, what they open, and when they return.
 * A visitor id lives in localStorage; a session ends after 30 minutes without activity.
 */
export function ProductTracker() {
  const pathname = usePathname();
  const memory = useRef<{ visitor?: string; session?: string }>({});

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const now = Date.now();

    let visitor = read(window.localStorage, VISITOR_KEY) ?? memory.current.visitor;
    if (!visitor) {
      visitor = newId();
      write(window.localStorage, VISITOR_KEY, visitor);
    }
    memory.current.visitor = visitor;

    let session = read(window.sessionStorage, SESSION_KEY) ?? memory.current.session;
    const lastSeen = Number(read(window.sessionStorage, SESSION_SEEN_KEY) ?? 0);
    const startsSession = !session || now - lastSeen > IDLE_MS;
    if (startsSession) {
      session = newId();
      write(window.sessionStorage, SESSION_KEY, session);
    }
    write(window.sessionStorage, SESSION_SEEN_KEY, String(now));
    memory.current.session = session as string;

    const params = new URLSearchParams(window.location.search);
    const payload = {
      visitorId: visitor,
      sessionId: session,
      event: "pageview",
      path: `${pathname}`,
      // Where the visit came from only matters on the first page of a session.
      ...(startsSession && document.referrer ? { referrer: document.referrer } : {}),
      ...(startsSession && (params.get("utm_source") || params.get("utm_medium") || params.get("utm_campaign"))
        ? {
            utm: {
              source: params.get("utm_source") ?? undefined,
              medium: params.get("utm_medium") ?? undefined,
              campaign: params.get("utm_campaign") ?? undefined,
            },
          }
        : {}),
    };
    const body = JSON.stringify(payload);
    try {
      if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
      }
    } catch {
      /* analytics must never break the page */
    }
  }, [pathname]);

  return null;
}
