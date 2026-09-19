"use client";

import { useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export interface ProspectSearchCriteria {
  industries: string;
  geographies: string;
  companySizeRange: string;
  personas: string;
  limit: number;
}

export function ProspectComposeModal({
  onSubmit,
  onTalkToAi,
}: {
  onSubmit: (criteria: ProspectSearchCriteria) => void;
  onTalkToAi: () => void;
}) {
  const [industries, setIndustries] = useState("");
  const [geographies, setGeographies] = useState("");
  const [companySizeRange, setCompanySizeRange] = useState("");
  const [personas, setPersonas] = useState("");
  const [limit, setLimit] = useState(15);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ industries, geographies, companySizeRange, personas, limit });
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="pr-8">
        <h1 className="text-base font-semibold text-neutral-900">Find prospects</h1>
        <p className="text-xs text-neutral-500">Describe who you&apos;re looking for. You&apos;ll see the agent work in real time.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">Industries (comma-separated)</span>
          <input
            className="input"
            placeholder="e.g. fintech, healthtech"
            value={industries}
            onChange={(e) => setIndustries(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">Geographies (comma-separated)</span>
          <input
            className="input"
            placeholder="e.g. United States, remote"
            value={geographies}
            onChange={(e) => setGeographies(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">Company size range</span>
          <input
            className="input"
            placeholder="e.g. 11-50 employees"
            value={companySizeRange}
            onChange={(e) => setCompanySizeRange(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">Target job titles (optional)</span>
          <input className="input" value={personas} onChange={(e) => setPersonas(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">Number of companies</span>
          <input
            type="number"
            min={1}
            max={30}
            className="input w-24"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>

        <p className="text-xs text-neutral-500">
          Apsurn searches public business sources and shows provenance and confidence for every contact.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <ThreeDButton type="submit" variant="solid" size="sm" className="whitespace-nowrap">
            <Search className="size-3.5" />
            <span>Run search</span>
          </ThreeDButton>
          <ThreeDButton type="button" variant="soft" size="sm" className="whitespace-nowrap" onClick={onTalkToAi}>
            <MessageCircle className="size-3.5" />
            <span>Talk to the AI instead</span>
          </ThreeDButton>
        </div>
      </form>
    </div>
  );
}
