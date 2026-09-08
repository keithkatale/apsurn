export interface GeoData {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

export async function getGeolocation(ip: string): Promise<GeoData> {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") {
    return {
      country: "Localhost",
      countryCode: "LO",
      region: "Local",
      city: "Local",
      latitude: 0,
      longitude: 0,
    };
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,lat,lon`, {
      signal: AbortSignal.timeout(4_000),
    });
    const data = (await response.json()) as {
      status?: string;
      country?: string;
      countryCode?: string;
      regionName?: string;
      city?: string;
      lat?: number;
      lon?: number;
    };
    if (data.status === "success") {
      return {
        country: data.country,
        countryCode: data.countryCode,
        region: data.regionName,
        city: data.city,
        latitude: data.lat,
        longitude: data.lon,
      };
    }
  } catch (error) {
    console.error("[analytics] geo lookup failed", error);
  }

  return {};
}
