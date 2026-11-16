import { founderLinkedIn } from "./sources/community-parse";

/** A person's LinkedIn profile, only when the URL is a real linkedin.com/in/ link. */
export function linkedInProfile(url: string | null | undefined): string | null {
  return founderLinkedIn(url);
}

/** A lead counts only with an email address or a LinkedIn profile. */
export function hasEmailOrLinkedIn(input: { email?: string | null; linkedinUrl?: string | null }): boolean {
  const email = input.email?.trim() ?? "";
  return email.includes("@") || Boolean(linkedInProfile(input.linkedinUrl));
}
