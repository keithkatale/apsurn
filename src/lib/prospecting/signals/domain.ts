import { webSearchResults } from "@/lib/search/web-search";
import { pickDomainForName } from "./domain-core";

/** Company name → its own domain via grounded web search, or null. Never throws: an unresolved company is simply skipped. */
export async function resolveCompanyDomain(name: string): Promise<string | null> {
  try {
    const results = await webSearchResults(`${name} official company website`, 6);
    return pickDomainForName(name, results.map((result) => ({ url: result.url, title: result.title })));
  } catch (error) {
    console.warn(`[signals] domain lookup failed for "${name}":`, error instanceof Error ? error.message : error);
    return null;
  }
}
