import { NextRequest, NextResponse } from "next/server";
import { DEMO, demoEmbedUrl, demoPageUrl, demoThumbnailUrl, siteOrigin } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*" };

/**
 * oEmbed provider for the demo page, so link unfurlers (Slack, Notion, Iframely, Embedly and similar)
 * can show an inline player. Only the demo URL is supported.
 */
export function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url") ?? "";
  const normalize = (value: string) => value.replace(/\/+$/, "").replace(/^http:/, "https:").replace(/^https:\/\/www\./, "https://");
  if (normalize(target) !== normalize(demoPageUrl())) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }
  if (request.nextUrl.searchParams.get("format") === "xml") {
    return NextResponse.json({ error: "Only JSON is supported" }, { status: 501, headers: CORS });
  }

  const maxWidth = Number(request.nextUrl.searchParams.get("maxwidth")) || DEMO.width;
  const maxHeight = Number(request.nextUrl.searchParams.get("maxheight")) || DEMO.height;
  const scale = Math.min(1, maxWidth / DEMO.width, maxHeight / DEMO.height);
  const width = Math.round(DEMO.width * scale);
  const height = Math.round(DEMO.height * scale);

  return NextResponse.json(
    {
      version: "1.0",
      type: "video",
      provider_name: "apsurn",
      provider_url: siteOrigin(),
      title: DEMO.title,
      author_name: "apsurn",
      author_url: siteOrigin(),
      width,
      height,
      html: `<iframe src="${demoEmbedUrl()}" width="${width}" height="${height}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${DEMO.title}"></iframe>`,
      thumbnail_url: demoThumbnailUrl(),
      thumbnail_width: 3478,
      thumbnail_height: 2104,
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } },
  );
}
