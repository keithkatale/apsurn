import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LeadGenerator,
  PermitDataEnricher,
  LandPurchaseExtractor,
  findRealEstateCompanies,
  realEstateDataSource,
  parseCsvRecords,
} from "./index.ts";

describe("Commercial Real Estate Lead System (Node.js / Next.js)", () => {
  it("generates 100 leads (40 contractors + 60 buyers) and top 15 filtered leads", () => {
    const generator = new LeadGenerator();
    const { allLeads, blendedLeads, filteredTopLeads, summary } = generator.generateAllLeads();

    assert.equal(allLeads.length, 100);
    assert.equal(summary.contractors, 40);
    assert.equal(summary.buyers, 60);
    assert.equal(blendedLeads.length, 20);
    assert.equal(filteredTopLeads.length, 15);

    for (const lead of allLeads) {
      assert.ok(lead.phone);
      assert.ok(lead.email.includes("@"));
      assert.ok(lead.address);
      assert.ok(lead.company);
      assert.ok(lead.state.length === 2);
    }
  });

  it("serializes leads to valid CSV and parses them back", () => {
    const generator = new LeadGenerator();
    const contractors = generator.generatePermitContractors(5, ["CA", "TX"]);
    const csv = generator.toCsv(contractors);
    const parsed = parseCsvRecords(csv);

    assert.equal(parsed.length, 5);
    assert.equal(parsed[0].company, contractors[0].company);
    assert.equal(parsed[0].email, contractors[0].email);
  });

  it("enriches construction permit CSV records with state license databases", () => {
    const sampleCsv = [
      "permit_number,address,permit_type,contractor_name,issue_date,state",
      "2026-CV-1001,123 Main St,Commercial Building,Apex Construction LLC,2026-11-01,CA",
      "2026-CV-1002,500 Commerce St,Warehouse,Lone Star Builders Inc,2026-11-03,TX",
    ].join("\n");

    const enricher = new PermitDataEnricher();
    const { records } = enricher.processPermitsCsv(sampleCsv);

    assert.equal(records.length, 2);
    assert.ok(records[0].contractor_database.includes("California"));
    assert.equal(records[0].lookup_method, "web_portal");
    assert.ok(records[1].contractor_database.includes("Texas"));
  });

  it("enriches commercial land purchase CSV records and classifies LLC vs Individual buyers", () => {
    const sampleCsv = [
      "property_address,sale_date,sale_price,buyer_name,seller_name,property_type",
      "900 Industrial Blvd,2026-10-15,$1.2M,Golden West Properties LLC,Old Corp,Commercial Land",
      "450 Oak Ave,2026-10-20,$450K,John Smith,Jane Doe,Retail Property",
    ].join("\n");

    const extractor = new LandPurchaseExtractor();
    const { records, stats } = extractor.processCountyExportCsv(sampleCsv, "Los Angeles", "CA");

    assert.equal(stats.total, 2);
    assert.equal(stats.businessEntities, 1);
    assert.equal(stats.individuals, 1);
    assert.equal(records[0].buyer_type, "Business Entity (likely LLC/Corp)");
    assert.equal(records[0].contact_status, "lookup_in_SOS");
    assert.equal(records[1].buyer_type, "Individual");
    assert.equal(records[1].contact_status, "google_search_recommended");
  });

  it("converts leads into Apsurn SourcedCompany and ProspectDataSource formats", async () => {
    const sourced = await findRealEstateCompanies({
      geographies: ["CA", "TX"],
      limit: 10,
    });

    assert.equal(sourced.length, 10);
    assert.ok(sourced[0].name);
    assert.ok(sourced[0].domain);
    assert.ok(sourced[0].signal);
    assert.ok(sourced[0].signalEvidence);

    const companies = await realEstateDataSource.findCompanies(
      { industries: ["Commercial Real Estate"], geographies: ["FL"] },
      { limit: 5 },
    );
    assert.equal(companies.length, 5);
    assert.equal(companies[0].source, "real_estate_leads");
  });
});
