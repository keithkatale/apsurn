import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  outreachSendPass,
  refreshProspectIndex,
  runMarketDeepScan,
  runMarketScan,
  runProspecting,
  runScheduledProspecting,
} from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runProspecting, refreshProspectIndex, outreachSendPass, runScheduledProspecting, runMarketScan, runMarketDeepScan],
});
