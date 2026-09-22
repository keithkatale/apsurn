import { cn } from "@/lib/cn";
import { campaignIconSvg, type CampaignIconInput } from "@/lib/campaigns/icon";

export function CampaignIcon({
  campaign,
  storedSvg,
  selected = false,
  className = "size-8",
}: {
  campaign: CampaignIconInput;
  storedSvg?: string | null;
  selected?: boolean;
  className?: string;
}) {
  const svg = campaignIconSvg(campaign, storedSvg);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-lg [&_svg]:size-full",
        selected && "ring-1 ring-[#4379EE]",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
