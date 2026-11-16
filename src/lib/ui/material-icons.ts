/** Google Material Symbols used for task marks. Names are ligatures, not drawn SVGs. */
export const MATERIAL_ICON_NAMES = [
  "ads_click",
  "apartment",
  "bolt",
  "bug_report",
  "business_center",
  "campaign",
  "database",
  "forum",
  "forward_to_inbox",
  "group",
  "handshake",
  "help",
  "hub",
  "lightbulb",
  "mail",
  "monitoring",
  "payments",
  "person_search",
  "redeem",
  "rocket_launch",
  "schedule",
  "send",
  "settings",
  "storefront",
  "trending_up",
  "verified",
  "waving_hand",
  "work",
] as const;

export type MaterialIconName = (typeof MATERIAL_ICON_NAMES)[number];

export function materialSymbolsStylesheet() {
  const names = [...MATERIAL_ICON_NAMES].sort().join(",");
  return `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=${names}`;
}
