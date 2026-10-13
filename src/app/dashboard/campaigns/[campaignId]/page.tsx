import { CampaignsPage } from "../campaigns-view";

// The workspace reads the campaign id from the address bar, so this is the same page opened on a campaign.
export default function CampaignPage() {
  return CampaignsPage({ searchParams: Promise.resolve({}) });
}

export const dynamic = "force-dynamic";
