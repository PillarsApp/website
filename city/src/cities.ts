// City pages data. Adding a city is one entry in CITIES and nothing else:
// no build to run, no file to write, no list elsewhere to update. The
// registry (registry.ts) validates this file at startup and tests fail on a
// duplicate (country, slug), an unknown country, or an id that is not a
// masjid-times id.
//
// method / madhab / highLatitudeRule are the app's defaults for the country
// (prayer_time_manager.dart countryCodeToParamMap). The app uses Shafi Asr
// and TwilightAngle everywhere.

import type { City, Country, CountrySlug } from "./types";

export const SITE = {
  origin: "https://thepillarsapp.com",
  name: "Pillars",
  // Byte-identical to the repo's assets/icon-pillars-notification.png, served
  // by the Webflow CDN, so the page needs no icon route of its own.
  logo: "https://cdn.prod.website-files.com/604d480efd2aff6558953436/6acd3e69afe51db7d1364753_icon-pillars-notification.png",
  // The homepage's Organization @id. The city page must reference the same node.
  organizationId: "https://thepillarsapp.com/#org",
} as const;

export const COUNTRIES: Readonly<Record<CountrySlug, Country>> = {
  uk: {
    slug: "uk", code: "GB", name: "United Kingdom", short: "UK", lang: "en-GB", clock: 24,
    calc: { method: "MoonsightingCommittee", madhab: "Shafi", highLatitudeRule: "TwilightAngle" },
  },
  us: {
    slug: "us", code: "US", name: "United States", short: "USA", lang: "en-US", clock: 12,
    calc: { method: "NorthAmerica", madhab: "Shafi", highLatitudeRule: "TwilightAngle" },
  },
  ca: {
    slug: "ca", code: "CA", name: "Canada", short: "Canada", lang: "en-CA", clock: 12,
    calc: { method: "NorthAmerica", madhab: "Shafi", highLatitudeRule: "TwilightAngle" },
  },
};

// An array, not an object keyed by slug: the key is (country, slug) and the
// registry builds the index, so the data file cannot silently drop a
// duplicate.
export const CITIES: readonly City[] = [
  {
    country: "uk",
    slug: "london",
    name: "London",
    area: "Central London",
    lat: 51.5072,
    lng: -0.1276,
    timezone: "Europe/London",
    datePublished: "2026-10-17",
    localTimetable: {
      name: "London Unified Prayer Timetable",
      note: "Many London mosques, including East London Mosque and London Central Mosque, publish the London Unified Prayer Timetable. It is based on local observation rather than a fixed sun angle, so its Fajr and Isha can differ from the times on this page by several minutes, most of all in summer. Both are valid ways of working out the times. For jamaat (congregation) times, follow your local mosque.",
    },
    timesSource: "Moonsighting Committee method",
    mosques: {
      radiusKm: 15,
      max: 10,
      featured: [
        "plr_6de9979e3da7f5d5", // London Central Mosque (Regent's Park)
        "plr_50a8ad8349ca78e0", // East London Mosque
        "plr_61d5192b45799700", // Finsbury Park Mosque
        "plr_43db5bc31100eb39", // Edgware Road Mosque
        "plr_9d8e8ee9885a7fee", // Muslim Welfare House
        "plr_83b105b2623a56f7", // Brick Lane Jamme Masjid
        "plr_4bfa198109fc1f07", // New Peckham Mosque
        "plr_b75acfea0976ddfb", // Holborn Muslim Community Association
        "plr_97b1aaec78a40a8c", // Al-Negashi Mosque & Centre
        "plr_6049986c2b4dec89", // Markazi Masjid
      ],
    },
  },
  {
    country: "uk", slug: "luton", name: "Luton",
    lat: 51.8784, lng: -0.4153, timezone: "Europe/London", datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
  },
  {
    country: "uk", slug: "slough", name: "Slough",
    lat: 51.5111, lng: -0.5941, timezone: "Europe/London", datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
  },
  {
    country: "uk", slug: "watford", name: "Watford",
    lat: 51.6696, lng: -0.4106, timezone: "Europe/London", datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
  },
  {
    country: "uk", slug: "reading", name: "Reading",
    lat: 51.4564, lng: -0.9701, timezone: "Europe/London", datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
  },
  {
    country: "uk", slug: "crawley", name: "Crawley",
    lat: 51.1103, lng: -0.1801, timezone: "Europe/London", datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
  },
  {
    country: "uk", slug: "chelmsford", name: "Chelmsford",
    lat: 51.7345, lng: 0.4731, timezone: "Europe/London", datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
  },
  {
    country: "uk", slug: "oxford", name: "Oxford",
    lat: 51.752, lng: -1.2578, timezone: "Europe/London", datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
  },
  {
    country: "uk", slug: "cambridge", name: "Cambridge",
    lat: 52.1976, lng: 0.1392, timezone: "Europe/London", datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
  },
  {
    country: "uk", slug: "milton-keynes", name: "Milton Keynes",
    lat: 52.0407, lng: -0.7594, timezone: "Europe/London", datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
  },
  {
    country: "uk", slug: "birmingham", name: "Birmingham",
    lat: 52.4798, lng: -1.9031, timezone: "Europe/London", datePublished: "2026-10-22",
    mosques: { radiusKm: 10, max: 10, featured: [] },
  },
];
