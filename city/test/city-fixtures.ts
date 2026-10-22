import { CITIES } from "../src/cities";
import type { City } from "../src/types";

const fixture = (slug: string, name: string, lat: number, lng: number, timezone: string, country: "us" | "ca"): City => ({
  country, slug, name, lat, lng, timezone, datePublished: "2026-10-22",
});

export const NEW_YORK = fixture("new-york", "New York", 40.7127, -74.0059, "America/New_York", "us");
export const HOUSTON = fixture("houston", "Houston", 29.7602, -95.3694, "America/Chicago", "us");
export const CHICAGO = fixture("chicago", "Chicago", 41.8838, -87.632, "America/Chicago", "us");
export const LOS_ANGELES = fixture("los-angeles", "Los Angeles", 34.0537, -118.2429, "America/Los_Angeles", "us");
export const SEATTLE = fixture("seattle", "Seattle", 47.6039, -122.3301, "America/Los_Angeles", "us");
export const TORONTO = fixture("toronto", "Toronto", 43.6536, -79.384, "America/Toronto", "ca");
export const LONDON = CITIES.find((c) => c.slug === "london")!;
