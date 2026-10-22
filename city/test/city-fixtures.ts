import { CITIES } from "../src/cities";
import type { City, Standard } from "../src/types";

export const ISNA_GPS: Standard = { kind: "gps", name: "ISNA method", asrFirst: "Shafi", badge: "Calculated with the ISNA method (15°).", isha: "Isha starts at 15°." };
export const MSC_GPS: Standard = { kind: "gps", name: "Moonsighting Committee method", asrFirst: "Shafi", badge: "Calculated with the Moonsighting Committee method.", isha: "Isha follows the Moonsighting Committee's seasonal rule." };

const fixture = (slug: string, name: string, lat: number, lng: number, timezone: string, country: "us" | "ca"): City => ({
  country, slug, name, lat, lng, timezone, datePublished: "2026-10-22", standard: ISNA_GPS,
});

export const NEW_YORK = fixture("new-york", "New York", 40.7127, -74.0059, "America/New_York", "us");
export const HOUSTON = fixture("houston", "Houston", 29.7602, -95.3694, "America/Chicago", "us");
export const CHICAGO = fixture("chicago", "Chicago", 41.8838, -87.632, "America/Chicago", "us");
export const LOS_ANGELES = fixture("los-angeles", "Los Angeles", 34.0537, -118.2429, "America/Los_Angeles", "us");
export const SEATTLE = fixture("seattle", "Seattle", 47.6039, -122.3301, "America/Los_Angeles", "us");
export const TORONTO = fixture("toronto", "Toronto", 43.6536, -79.384, "America/Toronto", "ca");
export const LONDON = CITIES.find((c) => c.slug === "london")!;
// London's coordinates and zone with a calculated standard: the UK page whose copy talks about the method.
export const CALCULATED_LONDON: City = { ...LONDON, standard: MSC_GPS };
export const BIRMINGHAM = CITIES.find((c) => c.slug === "birmingham")!;
export const GLASGOW = CITIES.find((c) => c.slug === "glasgow")!;
export const CAMBRIDGE = CITIES.find((c) => c.slug === "cambridge")!;
