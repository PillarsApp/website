// Domain types for the city pages Worker. Everything the renderer, the
// registry, the mosque source and the router agree on lives here. No wire
// types (masjid-times JSON, adhan objects, Request/Response) appear in this
// file: those stay private to the module that parses them.

// ---------- Place ----------

// URL segment for a country ("uk", not "gb"): fixed by the SEO scheme
// /prayer-times/{country}/{city}/. ISO code lives on Country.code.
export type CountrySlug = "uk" | "us" | "ca";

// Lower-case, [a-z0-9-], unique within a country. Collisions at GeoNames scale
// are resolved at import time (e.g. "london-ky"); the type does not change.
export type CitySlug = string;

// The identity of a city page. Both halves are needed: "london" exists in GB
// and CA, so nothing is ever keyed by slug alone (widget data, cache, links).
export interface CityRef {
  readonly country: CountrySlug;
  readonly slug: CitySlug;
}

export interface Country {
  readonly slug: CountrySlug;
  readonly code: "GB" | "US" | "CA"; // ISO 3166-1 alpha-2, for schema.org
  readonly name: string; // "United Kingdom"
  readonly short: string; // "UK"
  readonly lang: string; // BCP 47, "en-GB"
  readonly clock: 12 | 24; // display format for the whole page
  readonly calc: Calc; // the app's default for the country (prayer_time_manager.dart)
}

// ---------- Calculation ----------

export type Madhab = "Shafi" | "Hanafi";
export type HighLatitudeRule = "MiddleOfTheNight" | "SeventhOfTheNight" | "TwilightAngle";

// Named adhan methods the app uses. "Custom" carries its own angles so that
// fr/ma (18/18), id/my (20/18) and be/jo/tn (18/17) are representable; the
// renderer never branches on the method name to find angles, it asks CalcInfo.
export type NamedMethod =
  | "MoonsightingCommittee"
  | "MuslimWorldLeague"
  | "NorthAmerica"
  | "UmmAlQura"
  | "Egyptian"
  | "Karachi"
  | "Dubai"
  | "Kuwait"
  | "Qatar"
  | "Singapore"
  | "Turkey";

export type Calc =
  | { readonly method: NamedMethod; readonly madhab: Madhab; readonly highLatitudeRule: HighLatitudeRule }
  | {
      readonly method: "Custom";
      readonly fajrAngle: number;
      readonly ishaAngle: number;
      readonly ishaInterval?: number; // minutes after Maghrib, instead of an angle
      readonly madhab: Madhab;
      readonly highLatitudeRule: HighLatitudeRule;
    };

// ---------- City ----------

// One entry per page. Hand-curated prose is optional; the renderer has a
// default for every optional field. Nothing here is a URL: links are made by
// routes.ts from the CityRef. Nothing here is a placeholder: there is no
// field in which fake mosques could be written.
export interface City extends CityRef {
  readonly name: string; // "London"
  readonly lat: number;
  readonly lng: number;
  readonly timezone: string; // IANA, "Europe/London"
  readonly datePublished: LocalDate; // schema.org datePublished, first publish of this page
  readonly area?: string; // "Central London": the coordinates' name in the trust caption
  readonly calc?: Calc; // override of the country default (rare)
  readonly localTimetable?: { readonly name: string; readonly note: string };
  readonly listCaption?: string; // replaces the generated trust caption
  readonly timesSource?: string; // "Times calculated with the <timesSource>"
  readonly mosques?: MosqueQuery; // absent: the page has no mosque section
}

// How to find this city's mosques in masjid-times. Featured ids come first,
// then the nearest reliable others up to `max`.
export interface MosqueQuery {
  readonly radiusKm: number;
  readonly max: number; // 1..15 (one batch call)
  readonly featured: readonly MasjidId[];
}

// masjid-times canonical id, "plr_" + 16 hex. Validated where it enters (cities.ts data
// is checked by the registry at startup; API ids by the mosque source's parser).
export type MasjidId = `plr_${string}`;

// ---------- Time ----------

// Calendar date in the city's zone, "YYYY-MM-DD". Produced only by CityClock, so
// the renderer never does its own zone arithmetic.
export type LocalDate = `${number}-${number}-${number}`;

// Epoch milliseconds. A number on purpose: adhan and Intl both want it.
export type Instant = number;

// "HH:mm" in the mosque's own zone, as masjid-times publishes it.
export type WallClock = `${number}:${number}`;

// ---------- Mosques (domain, not wire) ----------

export type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export interface Mosque {
  readonly name: string; // already title-cased
  readonly address: string | null; // street + postcode joined, or null
  readonly postcode: string | null;
  readonly athan: Partial<Record<PrayerKey, WallClock>>;
  readonly iqamah: Partial<Record<PrayerKey, WallClock>>;
  readonly jummah: readonly WallClock[];
  // No `url`, no `slug`: the Worker serves no mosque pages, so the renderer
  // has nothing to link. When /mosques/... exists, add a route and a field.
}

// What the mosque section renders from. Exactly two states. "unavailable"
// renders no section and shortens the cache TTL; there is no third state in
// which made-up mosques could be shown.
export type MosqueSection =
  | { readonly kind: "live"; readonly date: LocalDate; readonly mosques: readonly Mosque[] }
  | { readonly kind: "unavailable"; readonly reason: "no-query" | "no-directory" | "error" | "timeout" | "empty" };

// ---------- Render input ----------

// Every URL the page is allowed to emit, built by routes.ts. The renderer
// cannot invent a path: it only has these.
export interface PageLinks {
  readonly canonical: string; // absolute, production origin
  readonly hub: string; // root-relative
  readonly country: string;
  readonly self: string;
  readonly widgetEmbed: string; // absolute, for the copy-paste snippet
  readonly widgetPreview: string; // root-relative, for the iframe on this page
  readonly nearby: readonly { readonly name: string; readonly href: string }[];
  readonly clientScript: string; // root-relative, content-hashed
  readonly assets: string; // root-relative prefix for fonts, images, vendor
  readonly logo: string; // absolute (Webflow CDN copy)
}

// Who the page is for. "public" is production: indexable, with analytics.
// "preview" is dev, staging and test: noindex, no analytics. Decided once, in index.ts.
export type Audience = "public" | "preview";

export interface PageInput {
  readonly city: City;
  readonly country: Country;
  readonly date: LocalDate; // city-local "today" at render time
  readonly now: Instant; // render instant, for "Updated" and dateModified
  readonly mosques: MosqueSection;
  readonly links: PageLinks;
  readonly audience: Audience;
}

// Output of a page render. `freshUntil` is the instant after which this HTML
// must not be served from cache: city-local midnight, or sooner when a part
// of the page (mosques) was unavailable. The cache layer reads it; nothing
// else decides TTLs.
export interface Rendered {
  readonly html: string;
  readonly freshUntil: Instant;
}
