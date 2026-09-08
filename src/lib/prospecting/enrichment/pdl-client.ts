export interface PdlPerson {
  fullName: string | null;
  title: string | null;
  workEmail: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  raw: Record<string, unknown>;
}

interface PdlSearchResponseRecord {
  full_name?: string;
  job_title?: string;
  work_email?: string;
  emails?: Array<{ address?: string }>;
  mobile_phone?: string;
  phone_numbers?: string[];
  linkedin_url?: string;
  [key: string]: unknown;
}

interface PdlSearchResponse {
  data?: PdlSearchResponseRecord[];
}

function mapRecord(record: PdlSearchResponseRecord): PdlPerson {
  const email = record.work_email ?? record.emails?.[0]?.address ?? null;
  const phone = record.mobile_phone ?? record.phone_numbers?.[0] ?? null;
  return {
    fullName: record.full_name ?? null,
    title: record.job_title ?? null,
    workEmail: email,
    phone,
    linkedinUrl: record.linkedin_url ?? null,
    raw: record,
  };
}

/**
 * Searches People Data Labs for real people working at a company, optionally
 * narrowed to target job titles. Throws on missing config, out-of-credits
 * (402), or rate-limit (429) so callers can log a clear cause — callers
 * should catch and degrade to "no contacts for this company" rather than
 * failing the whole prospecting run.
 */
export async function searchPeopleAtCompany(
  domain: string,
  opts: { titles?: string[]; limit: number }
): Promise<PdlPerson[]> {
  const apiKey = process.env.PDL_API_KEY;
  if (!apiKey) {
    throw new Error("[pdl-client] PDL_API_KEY is not configured");
  }

  const must: Record<string, unknown>[] = [
    { term: { job_company_website: domain } },
  ];
  if (opts.titles && opts.titles.length > 0) {
    must.push({ terms: { job_title_role: opts.titles } });
  }

  const query = { bool: { must } };

  const response = await fetch("https://api.peopledatalabs.com/v5/person/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      query,
      size: opts.limit,
    }),
  });

  if (response.status === 402) {
    throw new Error("[pdl-client] out of PDL credits (402)");
  }
  if (response.status === 429) {
    throw new Error("[pdl-client] PDL rate limit exceeded (429)");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`[pdl-client] request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as PdlSearchResponse;
  return (json.data ?? []).map(mapRecord);
}
