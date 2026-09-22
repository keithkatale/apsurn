import { cn } from "@/lib/cn";
import { campaignIconSvg, type CampaignIconInput } from "@/lib/campaigns/icon";

export function CampaignIcon({
  campaign,
  storedSvg,
  className = "size-8",
}: {
  campaign: CampaignIconInput;
  storedSvg?: string | null;
  /** @deprecated Selection chrome removed — kept optional so callers don’t break. */
  selected?: boolean;
  className?: string;
}) {
  const svg = campaignIconSvg(campaign, storedSvg);
  return (
    <span
      className={cn("inline-flex shrink-0 text-black [&_svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
