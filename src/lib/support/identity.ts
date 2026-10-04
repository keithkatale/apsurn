import { createClient } from "@/lib/supabase/server";

/** The signed-in user, if any. The support chat is also available to signed-out visitors. */
export async function getOptionalUser(): Promise<{ id: string; email: string | null } | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id, email: user.email ?? null } : null;
  } catch {
    return null;
  }
}

export const VISITOR_ID = /^[A-Za-z0-9_-]{16,80}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Explicit asks to speak to a person. Anything subtler is left to the AI's [[HANDOFF]] signal. */
const HUMAN_REQUEST = [
  /\b(real|live|actual)\s+(human|person|people|agent)\b/i,
  /\b(talk|speak|chat|connect|escalate|transfer)\w*\s+(me\s+)?(to|with)\s+(a|an|the|your|some)?\s*(human|person|people|agent|someone|somebody|representative|support|team|staff|founder|admin)\b/i,
  /\b(human|agent|representative)\s+(please|support|help)\b/i,
  /\b(contact|reach|email|call)\s+(your\s+)?(support|team|a human|someone)\b/i,
  /\b(customer service|support team|support agent)\b/i,
  /\bhuman\b/i,
];

export function asksForHuman(text: string): boolean {
  return HUMAN_REQUEST.some((pattern) => pattern.test(text));
}
