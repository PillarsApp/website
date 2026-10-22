export type CountrySlug = "uk" | "us" | "ca";

export type CitySlug = string;

export interface CityRef {
  readonly country: CountrySlug;
  readonly slug: CitySlug;
}

export interface Country {
  readonly slug: CountrySlug;
  readonly code: "GB" | "US" | "CA";
  readonly name: string;
  readonly short: string;
  readonly lang: string;
  readonly clock: 12 | 24;
  readonly calc: Calc;
}

export type Madhab = "Shafi" | "Hanafi";
export type HighLatitudeRule = "MiddleOfTheNight" | "SeventhOfTheNight" | "TwilightAngle";

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
      readonly ishaInterval?: number;
      readonly madhab: Madhab;
      readonly highLatitudeRule: HighLatitudeRule;
    };

export interface City extends CityRef {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly timezone: string;
  readonly datePublished: LocalDate;
  readonly coordinatesLabel?: string;
  readonly calc?: Calc;
  readonly localTimetable?: { readonly name: string; readonly note: string };
  readonly listCaption?: string;
  readonly timesSource?: string;
  readonly mosques?: MosqueQuery;
}

export interface MosqueQuery {
  readonly radiusKm: number;
  readonly max: number;
  readonly featured: readonly { readonly id: MasjidId; readonly name: string }[];
}

export type MasjidId = `plr_${string}`;

export type LocalDate = `${number}-${number}-${number}`;

export type Instant = number;

export type WallClock = `${number}:${number}`;

export type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export interface Mosque {
  readonly name: string;
  readonly address: string | null;
  readonly postcode: string | null;
  readonly athan: Partial<Record<PrayerKey, WallClock>>;
  readonly iqamah: Partial<Record<PrayerKey, WallClock>>;
  readonly jummah: readonly WallClock[];
}

export type MosqueSection =
  | { readonly kind: "live"; readonly date: LocalDate; readonly mosques: readonly Mosque[] }
  | { readonly kind: "unavailable"; readonly reason: "no-query" | "no-directory" | "error" | "timeout" | "empty" };

export interface PageLinks {
  readonly canonical: string;
  readonly hub: string;
  readonly country: string;
  readonly self: string;
  readonly widgetEmbed: string;
  readonly widgetPreview: string;
  readonly nearby: readonly { readonly name: string; readonly href: string }[];
  readonly clientScript: string;
  readonly assets: string;
  readonly logo: string;
}

export type Audience = "public" | "preview";

export interface PageInput {
  readonly city: City;
  readonly country: Country;
  readonly date: LocalDate;
  readonly now: Instant;
  readonly mosques: MosqueSection;
  readonly links: PageLinks;
  readonly audience: Audience;
}

export interface Rendered {
  readonly html: string;
  readonly freshUntil: Instant;
}
