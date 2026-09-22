"use client";

import { CampaignIcon } from "@/components/campaigns/CampaignIcon";
import { PricingCardShell } from "@/components/ui/pricing-card-shell";

export type CampaignCardData = {
  name: string;
  description: string;
  pain: string;
  targeting: string[];
  sampleAccounts: string[];
  estimatedVolume: number | null;
  outreachMethod?: string;
  iconSvg?: string;
};

function formatVolume(n: number | null) {
  if (n == null) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

export function CampaignCard({ campaign }: { campaign: CampaignCardData }) {
  const volume = formatVolume(campaign.estimatedVolume);

  return (
    <PricingCardShell className="p-2.5" innerClassName="gap-2 p-3 sm:p-3">
      <div className="flex items-start gap-2.5">
        <CampaignIcon campaign={campaign} storedSvg={campaign.iconSvg} className="size-9" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-[16px] font-semibold tracking-[-0.04em] text-black">
            {campaign.name}
          </h3>
          {campaign.outreachMethod && (
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#4379EE]">{campaign.outreachMethod}</p>
          )}
        </div>
        {volume && <span className="shrink-0 text-[12px] font-medium text-[#605f5f]">{volume}</span>}
      </div>
      {campaign.description && (
        <p className="text-[13px] leading-snug tracking-[-0.03em] text-[#605f5f]">{campaign.description}</p>
      )}
      {campaign.pain && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Pain</p>
          <p className="text-[13px] text-neutral-800">{campaign.pain}</p>
        </>
      )}
      {campaign.targeting.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {campaign.targeting.map((line) => (
            <li key={line} className="flex items-start gap-2 text-[13px] text-[#605f5f]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#4379EE]" />
              {line}
            </li>
          ))}
        </ul>
      )}
      {campaign.sampleAccounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {campaign.sampleAccounts.map((account) => (
            <span key={account} className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">
              {account}
            </span>
          ))}
        </div>
      )}
    </PricingCardShell>
  );
}

export function CampaignCardSkeleton() {
  return (
    <PricingCardShell className="p-2.5" innerClassName="gap-2 p-3 sm:p-3">
      <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-200" />
      <div className="h-3 w-full animate-pulse rounded bg-neutral-100" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-neutral-100" />
    </PricingCardShell>
  );
}
