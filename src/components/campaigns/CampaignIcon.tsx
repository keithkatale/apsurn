import { cn } from "@/lib/cn";
import { campaignMaterialIcon, type CampaignIconInput } from "@/lib/campaigns/icon";

export function CampaignIcon({
  campaign,
  storedSvg,
  className = "size-4",
}: {
  campaign: CampaignIconInput;
  storedSvg?: string | null;
  /** @deprecated Selection chrome removed — kept optional so callers don’t break. */
  selected?: boolean;
  className?: string;
}) {
  const name = campaignMaterialIcon(campaign, storedSvg);
  return (
    <span
      className={cn(
        "material-symbols-outlined inline-flex shrink-0 items-center justify-center leading-none",
        className,
      )}
      style={{ fontSize: 18 }}
      aria-hidden
    >
      {name}
    </span>
  );
}
