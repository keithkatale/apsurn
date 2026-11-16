"use client";

import React, { useEffect, useState, useCallback } from "react";
import type {
  ApsurnSourcedCompany,
  CommercialPropertyRecord,
  EnrichedPermitRecord,
  LeadDatabaseSummary,
  RealEstateLead,
} from "@/lib/prospecting/real-estate/types";

const SAMPLE_PERMITS_CSV = `permit_number,address,permit_type,contractor_name,issue_date,state
2026-CV-1041,1450 Industrial Pkwy,Warehouse,Apex Construction LLC,2026-11-01,CA
2026-CV-1042,820 Commerce Blvd,Commercial Building,Lone Star Builders Inc,2026-11-04,TX
2026-CV-1043,310 Brickell Ave,Mixed Use Development,Sunshine Commercial Group,2026-11-06,FL`;

const SAMPLE_LAND_CSV = `property_address,sale_date,sale_price,buyer_name,seller_name,property_type
900 Enterprise Way,2026-10-18,$1.2M,Golden West Properties LLC,Pacific Holdings Corp,Commercial Land
450 Tech Blvd,2026-10-25,$650K,Skyline Realty Partners LP,Metro Trust,Industrial Land
210 Main St,2026-11-02,$420K,Robert Miller,Jane Doe,Retail Property`;

export default function RealEstateLeadsPage() {
  const [leads, setLeads] = useState<RealEstateLead[]>([]);
  const [filteredTopLeads, setFilteredTopLeads] = useState<RealEstateLead[]>([]);
  const [blendedLeads, setBlendedLeads] = useState<RealEstateLead[]>([]);
  const [sourcedCompanies, setSourcedCompanies] = useState<ApsurnSourcedCompany[]>([]);
  const [summary, setSummary] = useState<LeadDatabaseSummary | null>(null);
  const [activeTab, setActiveTab] = useState<
    "all" | "top15" | "blended" | "enrich" | "apsurn"
  >("all");
  const [stateFilter, setStateFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Enrichment playground state
  const [permitCsvInput, setPermitCsvInput] = useState<string>(SAMPLE_PERMITS_CSV);
  const [enrichedPermits, setEnrichedPermits] = useState<EnrichedPermitRecord[]>([]);
  const [landCsvInput, setLandCsvInput] = useState<string>(SAMPLE_LAND_CSV);
  const [landCounty, setLandCounty] = useState<string>("Los Angeles");
  const [landState, setLandState] = useState<string>("CA");
  const [enrichedLand, setEnrichedLand] = useState<CommercialPropertyRecord[]>([]);

  const generateLeads = useCallback(async (saveToDisk = false) => {
    setLoading(true);
    setStatusBanner(null);
    try {
      const res = await fetch("/api/prospecting/real-estate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          contractorCount: 40,
          buyerCount: 60,
          blendedCount: 20,
          filterTopCount: 15,
          saveToDisk,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLeads(data.leads ?? []);
      setFilteredTopLeads(data.filteredTopLeads ?? []);
      setBlendedLeads(data.blendedLeads ?? []);
      setSourcedCompanies(data.sourcedCompanies ?? []);
      setSummary(data.summary ?? null);
      if (saveToDisk && data.savedFiles?.length) {
        setStatusBanner(
          `Saved 100 leads & Top 15 filtered leads to disk (${data.savedFiles.length} files updated).`,
        );
      }
    } catch (err) {
      console.error("Failed to generate real estate leads:", err);
      setStatusBanner("Error generating leads. Check console logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  const runPermitEnrich = async () => {
    const res = await fetch("/api/prospecting/real-estate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enrich_permits", csv: permitCsvInput }),
    });
    const data = await res.json();
    setEnrichedPermits(data.records ?? []);
  };

  const runLandEnrich = async () => {
    const res = await fetch("/api/prospecting/real-estate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "enrich_land",
        csv: landCsvInput,
        county: landCounty,
        state: landState,
      }),
    });
    const data = await res.json();
    setEnrichedLand(data.records ?? []);
  };

  useEffect(() => {
    void generateLeads(false);
  }, [generateLeads]);

  const activeList =
    activeTab === "top15" ? filteredTopLeads : activeTab === "blended" ? blendedLeads : leads;

  const visibleLeads =
    stateFilter === "ALL" ? activeList : activeList.filter((l) => l.state === stateFilter);

  const availableStates = summary ? Object.keys(summary.byState).sort() : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Commercial Real Estate Lead System
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Next.js / Apsurn Ready
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Construction Permits (PermitStack + State Licensing) &amp; Commercial Land Acquisitions (County Assessor + SOS Registries)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void generateLeads(true)}
            disabled={loading}
            className="cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {loading ? "Generating..." : "Generate & Save 100 Leads"}
          </button>
          <a
            href="/api/prospecting/real-estate?format=csv&only=all"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Download 100 CSV
          </a>
          <a
            href="/api/prospecting/real-estate?format=csv&only=top"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Download Top 15 CSV
          </a>
        </div>
      </div>

      {statusBanner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
          {statusBanner}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="text-xs uppercase text-neutral-500">Total Leads</div>
            <div className="mt-1 text-2xl font-bold">{summary.total}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Across {Object.keys(summary.byState).length} US states
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="text-xs uppercase text-neutral-500">Permit Contractors</div>
            <div className="mt-1 text-2xl font-bold">{summary.contractors}</div>
            <div className="mt-1 text-xs text-neutral-500">PermitStack + CSLB/State DB</div>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="text-xs uppercase text-neutral-500">Commercial Land Buyers</div>
            <div className="mt-1 text-2xl font-bold">{summary.buyers}</div>
            <div className="mt-1 text-xs text-neutral-500">County Assessor + SOS LLC</div>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="text-xs uppercase text-neutral-500">High Confidence</div>
            <div className="mt-1 text-2xl font-bold">
              {summary.byConfidence.high + summary.byConfidence.veryHigh} (
              {Math.round(
                ((summary.byConfidence.high + summary.byConfidence.veryHigh) /
                  Math.max(1, summary.total)) *
                  100,
              )}
              %)
            </div>
            <div className="mt-1 text-xs text-neutral-500">Phone + Email + Physical Address</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === "all"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border border-neutral-300 dark:border-neutral-700"
            }`}
          >
            All 100 Leads ({leads.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("top15")}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === "top15"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border border-neutral-300 dark:border-neutral-700"
            }`}
          >
            Top 15 Filtered ({filteredTopLeads.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("blended")}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === "blended"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border border-neutral-300 dark:border-neutral-700"
            }`}
          >
            Dual-Match Priority ({blendedLeads.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("enrich")}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === "enrich"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border border-neutral-300 dark:border-neutral-700"
            }`}
          >
            Permit &amp; Land CSV Enricher
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("apsurn")}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === "apsurn"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border border-neutral-300 dark:border-neutral-700"
            }`}
          >
            Apsurn SourcedCompany Format ({sourcedCompanies.length})
          </button>
        </div>

        {(activeTab === "all" || activeTab === "top15" || activeTab === "blended") && (
          <div className="flex items-center gap-2">
            <label htmlFor="state-filter" className="text-sm text-neutral-500">
              State:
            </label>
            <select
              id="state-filter"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="rounded-md border border-neutral-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-neutral-700"
            >
              <option value="ALL">All States</option>
              {availableStates.map((st) => (
                <option key={st} value={st}>
                  {st} ({summary?.byState[st] ?? 0})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {(activeTab === "all" || activeTab === "top15" || activeTab === "blended") && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="min-w-full divide-y divide-neutral-200 text-left text-sm dark:divide-neutral-800">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Company &amp; Contact</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Phone &amp; Email</th>
                <th className="px-4 py-3">Signal / Value</th>
                <th className="px-4 py-3">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {visibleLeads.map((lead) => (
                <tr key={lead.lead_id} className="hover:bg-neutral-50/60 dark:hover:bg-neutral-900/50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{lead.lead_id}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-medium">{lead.lead_type}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{lead.company}</div>
                    <div className="text-xs text-neutral-500">
                      {lead.name} · {lead.title}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div>
                      {lead.city}, {lead.state} {lead.zip}
                    </div>
                    <div className="text-xs text-neutral-500">{lead.address}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div>{lead.phone}</div>
                    <div className="text-xs text-neutral-500">{lead.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {lead.permit_type && (
                      <div>
                        Permit: {lead.permit_type} ({lead.permit_value}) · {lead.permit_date}
                      </div>
                    )}
                    {lead.property_type && (
                      <div>
                        Land: {lead.property_type} ({lead.sale_price}) · {lead.sale_date}
                      </div>
                    )}
                    {lead.recent_permit && (
                      <div>
                        {lead.recent_permit} | {lead.recent_land_purchase}
                      </div>
                    )}
                    <div className="text-neutral-500">{lead.data_freshness}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">
                    {lead.contact_confidence}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "enrich" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-lg font-semibold">1. Construction Permit Enricher</h2>
            <p className="text-xs text-neutral-500">
              Paste raw PermitStack CSV records to resolve state contractor licensing portals and lookup instructions.
            </p>
            <textarea
              rows={5}
              value={permitCsvInput}
              onChange={(e) => setPermitCsvInput(e.target.value)}
              className="w-full rounded-md border border-neutral-300 p-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="button"
              onClick={() => void runPermitEnrich()}
              className="cursor-pointer rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Enrich Permits CSV
            </button>
            {enrichedPermits.length > 0 && (
              <div className="space-y-2 pt-2">
                {enrichedPermits.map((p, idx) => (
                  <div
                    key={idx}
                    className="rounded border border-neutral-200 p-2.5 text-xs dark:border-neutral-800"
                  >
                    <div className="font-semibold">
                      {p.contractor_name} ({p.state}) — {p.permit_type}
                    </div>
                    <div className="text-neutral-500">DB: {p.contractor_database}</div>
                    <div className="text-blue-600 dark:text-blue-400">{p.contractor_lookup_url}</div>
                    <div className="mt-1 text-neutral-600 dark:text-neutral-400">{p.next_step}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-lg font-semibold">2. Commercial Land Purchase Enricher</h2>
            <p className="text-xs text-neutral-500">
              Paste County Assessor property transfer CSV records to classify LLC vs. Individual buyers and resolve Secretary of State registries.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={landCounty}
                onChange={(e) => setLandCounty(e.target.value)}
                placeholder="County"
                className="w-1/2 rounded-md border border-neutral-300 px-2.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              />
              <input
                type="text"
                value={landState}
                onChange={(e) => setLandState(e.target.value)}
                placeholder="State (e.g. CA)"
                className="w-1/2 rounded-md border border-neutral-300 px-2.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
            <textarea
              rows={5}
              value={landCsvInput}
              onChange={(e) => setLandCsvInput(e.target.value)}
              className="w-full rounded-md border border-neutral-300 p-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="button"
              onClick={() => void runLandEnrich()}
              className="cursor-pointer rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Enrich Land Purchases CSV
            </button>
            {enrichedLand.length > 0 && (
              <div className="space-y-2 pt-2">
                {enrichedLand.map((r, idx) => (
                  <div
                    key={idx}
                    className="rounded border border-neutral-200 p-2.5 text-xs dark:border-neutral-800"
                  >
                    <div className="font-semibold">
                      {r.buyer_name} — {r.sale_price} ({r.property_type})
                    </div>
                    <div className="text-neutral-500">
                      Classification: {r.buyer_type} · Status: {r.contact_status}
                    </div>
                    <div className="mt-1 text-neutral-600 dark:text-neutral-400">{r.next_step}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "apsurn" && (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="text-sm font-medium">
            Apsurn <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">SourcedCompany[]</code> Output Preview (First 10 Records)
          </div>
          <pre className="max-h-96 overflow-auto rounded-md bg-neutral-950 p-4 text-xs text-neutral-100">
            {JSON.stringify(sourcedCompanies.slice(0, 10), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
