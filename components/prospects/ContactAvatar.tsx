"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

function linkedinHandle(url: string): string | null {
  const match = url.trim().match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\/+$/, "");
  } catch {
    return match[1].replace(/\/+$/, "");
  }
}

function emailOf(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function initialsOf(name?: string | null, email?: string | null): string {
  const cleaned = (name ?? "")
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Component}|\uFE0F|\u200D/gu, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts.length === 1 && parts[0].length > 0) {
    const letters = [...parts[0]].filter((ch) => /\p{L}|\p{N}/u.test(ch));
    if (letters.length >= 2) return `${letters[0]}${letters[1]}`.toUpperCase();
    if (letters.length === 1) return letters[0].toUpperCase();
  }
  const local = emailOf(email)?.split("@")[0];
  if (local) {
    const letters = [...local].filter((ch) => /[a-z0-9]/i.test(ch));
    if (letters.length >= 2) return `${letters[0]}${letters[1]}`.toUpperCase();
    if (letters.length === 1) return letters[0].toUpperCase();
  }
  return "?";
}

const FEMALE_NAMES = new Set([
  "aisha", "alexandra", "alice", "alicia", "allison", "alyssa", "amanda", "amber", "amelia", "amy", "ana", "andrea",
  "angela", "anna", "anne", "annie", "aria", "ariana", "ashley", "audrey", "ava", "barbara", "beatrice", "bella",
  "beth", "betty", "beverly", "bianca", "bonnie", "brenda", "brianna", "bridget", "brooke", "caitlin", "camila",
  "camille", "candice", "cara", "carla", "carmen", "carol", "carolina", "caroline", "carolyn", "carrie", "cassandra",
  "catherine", "cecilia", "celeste", "charlotte", "chelsea", "cheryl", "chloe", "christina", "christine", "cindy",
  "claire", "clara", "claudia", "colleen", "connie", "cora", "courtney", "crystal", "cynthia", "daisy", "dana",
  "daniela", "danielle", "daphne", "darlene", "dawn", "debbie", "deborah", "debra", "delilah", "denise", "diana",
  "diane", "donna", "doris", "dorothy", "ebony", "eden", "edith", "eileen", "elaine", "eleanor", "elena", "eliana",
  "elisa", "elisabeth", "elise", "eliza", "elizabeth", "ella", "ellen", "ellie", "eloise", "elsie", "emilia", "emily",
  "emma", "erica", "erika", "erin", "esther", "eva", "evelyn", "faith", "fatima", "felicia", "fiona", "florence",
  "frances", "francisca", "gabriela", "gabrielle", "gail", "gemma", "genevieve", "georgia", "geraldine", "gia",
  "gina", "giselle", "glenda", "gloria", "grace", "gracie", "gwendolyn", "hailey", "haley", "hannah", "harper",
  "hazel", "heather", "heidi", "helen", "helena", "hilary", "holly", "hope", "imogen", "ingrid", "irene", "iris",
  "isabel", "isabella", "isabelle", "isla", "ivy", "jacqueline", "jade", "jaime", "jamie", "jana", "jane", "janet",
  "janice", "jasmine", "jean", "jeanette", "jeanne", "jenna", "jennifer", "jenny", "jessica", "jill", "jillian",
  "joan", "joanna", "joanne", "jocelyn", "jodi", "jodie", "jolene", "josephine", "joy", "joyce", "judith", "judy",
  "julia", "juliana", "julianna", "julie", "juliet", "june", "justine", "kaitlyn", "karen", "karina", "karla", "kate",
  "katelyn", "katherine", "kathleen", "kathryn", "kathy", "katie", "katrina", "kay", "kayla", "kaylee", "keisha",
  "kelly", "kelsey", "kendall", "kendra", "kerry", "kim", "kimberly", "kirsten", "krista", "kristen", "kristi",
  "kristin", "kristina", "kristine", "kristy", "kylie", "lacey", "lana", "lara", "larissa", "laura", "lauren",
  "laurie", "layla", "lea", "leah", "leila", "lena", "leslie", "leticia", "lia", "liliana", "lillian", "lilly",
  "lily", "linda", "lindsay", "lindsey", "lisa", "livia", "lois", "lorena", "loretta", "lori", "lorraine", "louise",
  "lucia", "lucille", "lucy", "luisa", "luna", "lydia", "lynn", "mabel", "mackenzie", "madeline", "madelyn",
  "madison", "mae", "magdalena", "maggie", "maia", "makayla", "mallory", "mandy", "manuela", "mara", "marcela",
  "marcia", "margaret", "margarita", "margaux", "marie", "marilyn", "marina", "marion", "marisa", "marissa",
  "marjorie", "marlene", "marsha", "marta", "martha", "martina", "mary", "matilda", "maureen", "maya", "megan",
  "meghan", "melanie", "melinda", "melissa", "melody", "mercedes", "meredith", "mia", "michaela", "michele",
  "michelle", "mila", "mildred", "millie", "mindy", "miranda", "miriam", "misty", "molly", "mona", "monica",
  "monique", "morgan", "mya", "myra", "nadia", "nadine", "nancy", "naomi", "natalia", "natalie", "natasha", "nellie",
  "nia", "nichole", "nicole", "nina", "noelle", "nora", "norma", "octavia", "olga", "olive", "olivia", "opal",
  "paige", "pam", "pamela", "patricia", "patsy", "patty", "paula", "pauline", "pearl", "peggy", "penelope", "penny",
  "peyton", "phoebe", "phyllis", "piper", "polly", "priscilla", "priya", "quinn", "rachael", "rachel", "ramona",
  "raquel", "reagan", "rebecca", "rebekah", "regina", "renee", "rhonda", "riley", "rita", "roberta", "robin",
  "robyn", "rochelle", "rosa", "rosalie", "rose", "rosemary", "rosie", "roxanne", "ruby", "ruth", "sabrina", "sadie",
  "sally", "samantha", "sandra", "sandy", "sara", "sarah", "savannah", "scarlett", "selena", "serena", "shannon",
  "shari", "sharon", "shauna", "shawna", "sheila", "shelby", "shelley", "shelly", "sheri", "sherri", "sherry",
  "shirley", "sienna", "sierra", "silvia", "simone", "sofia", "sonia", "sonja", "sonya", "sophia", "sophie",
  "stacey", "staci", "stacie", "stacy", "stella", "stephanie", "sue", "summer", "susan", "susana", "susanna",
  "suzanne", "sydney", "sylvia", "tabitha", "tamara", "tami", "tammy", "tania", "tanya", "tara", "tasha", "tatiana",
  "taylor", "teresa", "teri", "terri", "terry", "tessa", "thelma", "theresa", "tiffany", "tina", "toni", "tonya",
  "tracey", "traci", "tracie", "tracy", "tricia", "trina", "trinity", "trisha", "ursula", "valeria", "valerie",
  "vanessa", "vera", "veronica", "vicki", "vickie", "vicky", "victoria", "violet", "virginia", "vivian", "wanda",
  "wendy", "whitney", "willow", "wilma", "winifred", "yasmin", "yesenia", "yolanda", "yvette", "yvonne", "zara",
  "zoe", "zoey",
]);

const MALE_PORTRAIT_POOL: string[] = [
  ...Array.from({ length: 99 }, (_, i) => `https://randomuser.me/api/portraits/men/${i + 1}.jpg`),
  "https://randomuser.me/api/portraits/men/0.jpg",
];

const FEMALE_PORTRAIT_POOL: string[] = [
  ...Array.from({ length: 99 }, (_, i) => `https://randomuser.me/api/portraits/women/${i + 1}.jpg`),
  "https://randomuser.me/api/portraits/women/0.jpg",
];

/**
 * Module-level collision-free registries so two different people NEVER receive
 * or display the same portrait image URL anywhere in the app.
 */
const assignedPortraitsByPerson = new Map<string, string>();
const usedPortraitUrls = new Set<string>();
const claimedLoadedImageUrls = new Map<string, string>();

function normalizePersonIdentity(
  name?: string | null,
  email?: string | null,
  linkedinUrl?: string | null,
): string {
  const cleanName = (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (cleanName && cleanName !== "unknown") return `name:${cleanName}`;
  const cleanEmail = emailOf(email);
  if (cleanEmail) return `email:${cleanEmail}`;
  const handle = linkedinUrl ? linkedinHandle(linkedinUrl) : null;
  if (handle) return `li:${handle.toLowerCase()}`;
  return `anon:${cleanName || "lead"}`;
}

function hashString(seed: string): number {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h1 ^= seed.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  // Murmur-style avalanche finalizer to eliminate clustering
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}

function uniquePortraitForPerson(
  personKey: string,
  name?: string | null,
  email?: string | null,
): string {
  const existing = assignedPortraitsByPerson.get(personKey);
  if (existing) return existing;

  const firstWord = (name || "")
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^a-z]/gi, "")
    .toLowerCase();

  const isFemale = Boolean(
    firstWord &&
      (FEMALE_NAMES.has(firstWord) ||
        (firstWord.length > 3 &&
          (firstWord.endsWith("a") ||
            firstWord.endsWith("ia") ||
            firstWord.endsWith("na") ||
            firstWord.endsWith("ine") ||
            firstWord.endsWith("elle")))),
  );

  const primaryPool = isFemale ? FEMALE_PORTRAIT_POOL : MALE_PORTRAIT_POOL;
  const secondaryPool = isFemale ? MALE_PORTRAIT_POOL : FEMALE_PORTRAIT_POOL;
  const combinedPool = [...primaryPool, ...secondaryPool];

  const hash = hashString(`${personKey}|${email || ""}`);
  const startIdx = hash % primaryPool.length;

  // Step through primary pool with coprime stride (37 is coprime to 100) to avoid adjacent lookalikes
  for (let i = 0; i < primaryPool.length; i++) {
    const idx = (startIdx + i * 37) % primaryPool.length;
    const candidate = primaryPool[idx];
    if (!usedPortraitUrls.has(candidate)) {
      usedPortraitUrls.add(candidate);
      assignedPortraitsByPerson.set(personKey, candidate);
      return candidate;
    }
  }

  // Fallback across combined pool if >100 leads of the same gender are rendered
  for (let i = 0; i < combinedPool.length; i++) {
    const candidate = combinedPool[(hash + i) % combinedPool.length];
    if (!usedPortraitUrls.has(candidate)) {
      usedPortraitUrls.add(candidate);
      assignedPortraitsByPerson.set(personKey, candidate);
      return candidate;
    }
  }

  // Ultimate fallback if >200 leads in one session
  const fallback = primaryPool[startIdx];
  assignedPortraitsByPerson.set(personKey, fallback);
  return fallback;
}

export function contactPhotoSources(
  linkedinUrl?: string | null,
  email?: string | null,
  photoUrl?: string | null,
  name?: string | null,
): string[] {
  const personKey = normalizePersonIdentity(name, email, linkedinUrl);
  const sources: string[] = [];

  if (photoUrl && /^https:\/\//i.test(photoUrl)) {
    sources.push(photoUrl);
  }
  const handle = linkedinUrl ? linkedinHandle(linkedinUrl) : null;
  if (handle) {
    sources.push(`https://unavatar.io/linkedin/${encodeURIComponent(handle)}?fallback=false`);
  }
  const address = emailOf(email);
  if (address) {
    sources.push(`https://unavatar.io/gravatar/${encodeURIComponent(address)}?fallback=false`);
  }

  sources.push(uniquePortraitForPerson(personKey, name, email));
  return [...new Set(sources)];
}

function looksLikePlaceholder(src: string): boolean {
  return /unavatar\.io\/(fallback|static)|ghosts?\.gif|default[-_](profile|avatar)|d=identicon|dicebear|blank/i.test(
    src,
  );
}

export function ContactAvatar({
  name,
  linkedinUrl,
  email,
  photoUrl,
  className = "size-9",
}: {
  name: string | null | undefined;
  linkedinUrl?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  className?: string;
}) {
  const personKey = useMemo(
    () => normalizePersonIdentity(name, email, linkedinUrl),
    [name, email, linkedinUrl],
  );
  const sources = useMemo(
    () => contactPhotoSources(linkedinUrl, email, photoUrl, name),
    [linkedinUrl, email, photoUrl, name],
  );
  const initials = useMemo(() => initialsOf(name, email), [name, email]);
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const [photoReady, setPhotoReady] = useState(false);
  const src = sources[index] ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIndex(0);
    setPhotoReady(false);
  }, [linkedinUrl, email, photoUrl, name]);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[11px] font-semibold tracking-wide text-muted-foreground ring-1 ring-white/10",
        className,
      )}
      aria-hidden={photoReady}
    >
      <span className={cn(photoReady && "opacity-0")}>{initials}</span>
      {mounted && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-200",
            photoReady ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onError={() => {
            setPhotoReady(false);
            setIndex((current) => current + 1);
          }}
          onLoad={(event) => {
            const loaded = event.currentTarget.currentSrc || event.currentTarget.src;
            if (looksLikePlaceholder(loaded)) {
              setPhotoReady(false);
              setIndex((current) => current + 1);
              return;
            }
            // Prevent two different people from ever sharing the same resolved image URL
            const existingOwner = claimedLoadedImageUrls.get(loaded);
            if (existingOwner && existingOwner !== personKey) {
              setPhotoReady(false);
              setIndex((current) => current + 1);
              return;
            }
            claimedLoadedImageUrls.set(loaded, personKey);
            setPhotoReady(true);
          }}
        />
      ) : null}
    </span>
  );
}
