import { NextRequest, NextResponse } from "next/server";
import * as path from "node:path";
import {
  LeadGenerator,
  PermitDataEnricher,
  LandPurchaseExtractor,
  COUNTY_SOURCES,
  SOS_REGISTRIES,
  STATE_CONTRACTOR_DATABASES,
} from "@/lib/prospecting/real-estate";

export const runtime = "nodejs";

/**
 * GET /api/prospecting/real-estate
 *
 * Query parameters:
 * - `contractors`: number of permit contractor leads (default 40)
 * - `buyers`: number of land purchase buyer leads (default 60)
 * - `blended`: number of dual-match blended leads (default 20)
 * - `states`: comma-separated state codes, e.g. "CA,TX,FL,NY"
 * - `only`: "all" | "top" | "blended" (default "all")
 * - `filterTop`: number of top leads to filter (default 15)
 * - `format`: "json" | "csv" | "apsurn" | "sources" (default "json")
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "json").toLowerCase();

  if (format === "sources") {
    return NextResponse.json({
      contractorDatabases: STATE_CONTRACTOR_DATABASES,
      countyAssessorSources: COUNTY_SOURCES,
      secretaryOfStateRegistries: SOS_REGISTRIES,
    });
  }

  const contractorCount = Math.min(500, Math.max(0, Number(searchParams.get("contractors") ?? 40)));
  const buyerCount = Math.min(500, Math.max(0, Number(searchParams.get("buyers") ?? 60)));
  const blendedCount = Math.min(200, Math.max(0, Number(searchParams.get("blended") ?? 20)));
  const filterTopCount = Math.min(200, Math.max(1, Number(searchParams.get("filterTop") ?? 15)));
  const only = (searchParams.get("only") ?? "all").toLowerCase();

  const statesParam = searchParams.get("states");
  const states = statesParam
    ? statesParam
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : undefined;

  const generator = new LeadGenerator();
  const { allLeads, blendedLeads, filteredTopLeads, summary } = generator.generateAllLeads({
    contractorCount,
    buyerCount,
    blendedCount,
    states,
    filterTopCount,
  });

  const targetLeads =
    only === "top" ? filteredTopLeads : only === "blended" ? blendedLeads : allLeads;

  if (format === "csv") {
    const csv = generator.toCsv(targetLeads);
    const filename =
      only === "top" ? "top_15_filtered_leads.csv" : "100_commercial_leads.csv";
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === "apsurn") {
    return NextResponse.json({
      summary,
      sourcedCompanies: generator.toSourcedCompanies(targetLeads),
      candidates: generator.toCandidateCompaniesAndContacts(targetLeads),
    });
  }

  return NextResponse.json({
    summary,
    leads: targetLeads,
    filteredTopLeads,
    blendedLeads,
  });
}

/**
 * POST /api/prospecting/real-estate
 *
 * Body payloads supported:
 * 1. `{ action: "generate", contractorCount?, buyerCount?, blendedCount?, states?, filterTopCount?, saveToDisk? }`
 * 2. `{ action: "enrich_permits", csv: string }`
 * 3. `{ action: "enrich_land", csv: string, county: string, state: string }`
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "generate";

  if (action === "enrich_permits") {
    const csvInput = typeof body.csv === "string" ? body.csv : "";
    if (!csvInput.trim()) {
      return NextResponse.json(
        { error: "Missing `csv` string containing raw permit records" },
        { status: 400 },
      );
    }
    const enricher = new PermitDataEnricher();
    const { records, csv } = enricher.processPermitsCsv(csvInput);
    return NextResponse.json({
      count: records.length,
      records,
      csv,
      sourcedCompanies: enricher.toSourcedCompanies(records),
    });
  }

  if (action === "enrich_land") {
    const csvInput = typeof body.csv === "string" ? body.csv : "";
    const county = typeof body.county === "string" ? body.county.trim() : "Los Angeles";
    const state = typeof body.state === "string" ? body.state.trim().toUpperCase() : "CA";

    if (!csvInput.trim()) {
      return NextResponse.json(
        { error: "Missing `csv` string containing county property transfer records" },
        { status: 400 },
      );
    }

    const extractor = new LandPurchaseExtractor();
    const { records, csv, stats } = extractor.processCountyExportCsv(csvInput, county, state);
    return NextResponse.json({
      stats,
      records,
      csv,
      sourcedCompanies: extractor.toSourcedCompanies(records),
    });
  }

  // Default action: "generate"
  const contractorCount =
    typeof body.contractorCount === "number" ? Math.min(500, Math.max(0, body.contractorCount)) : 40;
  const buyerCount =
    typeof body.buyerCount === "number" ? Math.min(500, Math.max(0, body.buyerCount)) : 60;
  const blendedCount =
    typeof body.blendedCount === "number" ? Math.min(200, Math.max(0, body.blendedCount)) : 20;
  const filterTopCount =
    typeof body.filterTopCount === "number" ? Math.min(200, Math.max(1, body.filterTopCount)) : 15;
  const states = Array.isArray(body.states)
    ? body.states.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
    : undefined;

  const generator = new LeadGenerator();
  const { allLeads, blendedLeads, filteredTopLeads, summary } = generator.generateAllLeads({
    contractorCount,
    buyerCount,
    blendedCount,
    states,
    filterTopCount,
  });

  let savedFiles: string[] = [];
  if (body.saveToDisk === true) {
    const cwd = process.cwd();
    const leadDataDir = path.join(cwd, "Lead Data");
    savedFiles = await generator.saveToDirectories(allLeads, filteredTopLeads, [cwd, leadDataDir]);
  }

  return NextResponse.json({
    summary,
    leads: allLeads,
    filteredTopLeads,
    blendedLeads,
    sourcedCompanies: generator.toSourcedCompanies(allLeads),
    savedFiles,
  });
}
