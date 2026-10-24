import type { City, Country, CountrySlug, Madhab, Standard, TimetableId } from "./types";

export const SITE = {
  origin: "https://thepillarsapp.com",
  name: "Pillars",
  logo: "https://cdn.prod.website-files.com/604d480efd2aff6558953436/6acd3e69afe51db7d1364753_icon-pillars-notification.png",
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

const msc = (asrFirst: Madhab, badge: string, isha: string): Standard =>
  ({ kind: "gps", name: "Moonsighting Committee method", asrFirst, badge, isha });
const isna = (asrFirst: Madhab, badge: string, isha: string): Standard =>
  ({ kind: "gps", name: "ISNA method", asrFirst, badge, isha });
const mosque = (name: string, timetable: TimetableId | null, asrFirst: Madhab, badge: string, isha: string): Standard =>
  ({ kind: "mosque", name, timetable, asrFirst, badge, isha });

const NEW = { datePublished: "2026-10-23", mosques: { radiusKm: 15, max: 10, featured: [] } } as const;
const NEW_WIDE = { ...NEW, mosques: { ...NEW.mosques, radiusKm: 25 } } as const;
const UK = { country: "uk", timezone: "Europe/London" } as const;

export const CITIES: readonly City[] = [
  {
    country: "uk",
    slug: "london",
    name: "London",
    live: true,
    coordinatesLabel: "Central London",
    lat: 51.5072,
    lng: -0.1276,
    timezone: "Europe/London",
    datePublished: "2026-10-17",
    seo: {
      title: "London Prayer Times Today | Fajr, Asr, Maghrib & Isha",
      descriptionTail: "London Unified Timetable & monthly calendar.",
      shareTitle: "London Prayer Times Today",
      shareDescription: "Fajr, Zuhr, Asr, Maghrib and Isha times for London from the London Unified Prayer Timetable, with a monthly calendar and local mosques.",
      image: { file: "og-london.png", alt: "London Prayer Times by Pillars: daily Fajr to Isha times from the London Unified Prayer Timetable" },
    },
    standard: {
      kind: "city-timetable",
      name: "London Unified Prayer Timetable",
      timetable: "london-unified",
      asrFirst: "Shafi",
      badge: "Times follow the London Unified Prayer Timetable, the start times East London Mosque and London Central Mosque (Regent's Park) publish.",
      isha: "Isha follows the London Unified Prayer Timetable, the same start time East London Mosque and London Central Mosque publish.",
      dialog: [
        "These are the start times of the London Unified Prayer Timetable, which London mosques agreed in 2011. East London Mosque and London Central Mosque (Regent's Park) publish the same times, and the timetable covers everywhere inside the M25.",
        "Fajr and Isha come from observations of dawn and dusk in the UK rather than a fixed sun angle, so other timetables can differ by several minutes, most of all in summer.",
        "Asr shows two start times: the earlier one these mosques list, and the later Hanafi time. Each mosque sets its own jama'ah times.",
      ],
    },
    mosques: {
      radiusKm: 15,
      max: 10,
      featured: [
        { id: "plr_6de9979e3da7f5d5", name: "London Central Mosque (Regent's Park)" },
        { id: "plr_50a8ad8349ca78e0", name: "East London Mosque" },
        { id: "plr_61d5192b45799700", name: "Finsbury Park Mosque" },
        { id: "plr_43db5bc31100eb39", name: "Edgware Road Mosque" },
        { id: "plr_9d8e8ee9885a7fee", name: "Muslim Welfare House" },
        { id: "plr_83b105b2623a56f7", name: "Brick Lane Jamme Masjid" },
        { id: "plr_4bfa198109fc1f07", name: "New Peckham Mosque" },
        { id: "plr_b75acfea0976ddfb", name: "Holborn Muslim Community Association" },
        { id: "plr_97b1aaec78a40a8c", name: "Al-Negashi Mosque & Centre" },
        { id: "plr_6049986c2b4dec89", name: "Markazi Masjid" },
      ],
    },
  },
  {
    ...UK, slug: "luton", name: "Luton", live: true, lat: 51.8784, lng: -0.4153, datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
    standard: msc("Shafi",
      "Calculated with the Moonsighting Committee method. Its Fajr matches Luton Central Masjid and Kokni Masjid to within 2 minutes.",
      "Luton Central Masjid lists Isha about 6 minutes later than this page."),
  },
  {
    ...UK, slug: "slough", name: "Slough", live: true, lat: 51.5111, lng: -0.5941, datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
    standard: msc("Shafi",
      "Calculated with the Moonsighting Committee method, which matches Jamia Masjid & Islamic Centre and Masjid Al-Jannah to within 2 minutes.",
      "Isha follows the Moonsighting Committee's seasonal rule, as both mosques' timetables do."),
  },
  {
    ...UK, slug: "watford", name: "Watford", live: true, lat: 51.6696, lng: -0.4106, datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
    standard: mosque("Watford Central Mosque", "watford-central", "Hanafi",
      "Times follow the permanent timetable of Watford Central Mosque, which North Watford Mosque also uses.",
      "Watford Central Mosque lists Isha about 80 minutes after sunset all year."),
  },
  {
    ...UK, slug: "reading", name: "Reading", live: true, lat: 51.4564, lng: -0.9701, datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
    standard: msc("Hanafi",
      "Calculated with the Moonsighting Committee method, which Central Jamme Masjid and Abu Bakr Masjid publish to the minute.",
      "In late June, Abu Bakr Masjid lists Isha up to 9 minutes earlier than this page."),
  },
  {
    ...UK, slug: "crawley", name: "Crawley", live: true, lat: 51.1103, lng: -0.1801, datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
    standard: msc("Hanafi",
      "Calculated with the Moonsighting Committee method, within 5 minutes of Crawley Mosque and Crawley Islamic Centre.",
      "Both Crawley mosques list Isha 2 to 5 minutes later than this page for most of the year."),
  },
  {
    ...UK, slug: "chelmsford", name: "Chelmsford", live: true, lat: 51.7345, lng: 0.4731, datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
    standard: mosque("Chelmsford Muslim Society", "chelmsford-cms", "Hanafi",
      "Times follow Chelmsford Muslim Society's timetable for its Central Mosque and Hamptons Centre.",
      "Isha follows Chelmsford Muslim Society's published timetable."),
  },
  {
    ...UK, slug: "oxford", name: "Oxford", live: true, lat: 51.752, lng: -1.2578, datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
    standard: mosque("Central Oxford Mosque", "oxford-coms", "Hanafi",
      "Times follow Central Oxford Mosque's published timetable, which starts Fajr when the sun is 18° below the horizon.",
      "Central Oxford Mosque sets Isha 80 to 105 minutes after sunset from February to October, and about two hours after sunset from November to January."),
  },
  {
    ...UK, slug: "cambridge", name: "Cambridge", live: true, lat: 52.1976, lng: 0.1392, datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
    standard: mosque("Cambridge Central Mosque", null, "Hanafi",
      "Times follow Cambridge Central Mosque's timetable, which uses the Moonsighting Committee method. Abu Bakr Jamia Mosque publishes the same times.",
      "Isha follows Cambridge Central Mosque's timetable."),
  },
  {
    ...UK, slug: "milton-keynes", name: "Milton Keynes", live: true, lat: 52.0407, lng: -0.7594, datePublished: "2026-10-22",
    mosques: { radiusKm: 8, max: 10, featured: [] },
    standard: msc("Hanafi",
      "Calculated with the Moonsighting Committee method, within 2 minutes of Milton Keynes Jamee Masjid and Central Jamia Mosque.",
      "Masjid Al-Rawdha lists Isha about 4 minutes later than this page."),
  },
  {
    ...UK, slug: "birmingham", name: "Birmingham", live: true, lat: 52.4798, lng: -1.9031, datePublished: "2026-10-22",
    mosques: { radiusKm: 10, max: 10, featured: [] },
    standard: mosque("Birmingham Central Mosque", "birmingham-central", "Hanafi",
      "Times follow Birmingham Central Mosque's timetable. Its Fajr comes from OpenFajr, a year of dawn photographs taken over Birmingham.",
      "Some Birmingham mosques list Isha several minutes earlier or later, most of all in summer."),
  },
  {
    ...UK, ...NEW, slug: "leicester", name: "Leicester", live: true, lat: 52.6334, lng: -1.133,
    standard: mosque("Masjid Umar", "leicester-masjid-umar", "Hanafi",
      "Times follow Masjid Umar's timetable, the same start times Jame Masjid, Madani Masjid, Masjid Ali and Masjid Aisha publish.",
      "Some Leicester mosques also list an earlier Shafi'i Isha."),
  },
  {
    ...UK, ...NEW, slug: "bradford", name: "Bradford", live: true, lat: 53.7924, lng: -1.7534,
    standard: mosque("Bradford Central Mosque", "bradford-central", "Hanafi",
      "Times follow Bradford Central Mosque (Jamiyat Tabligh-ul-Islam), whose timetable Jamia Masjid Hanfia also publishes.",
      "Bradford Central Mosque starts Isha about an hour after Maghrib all year; some mosques, including Bradford Grand Mosque, start it later."),
  },
  {
    ...UK, ...NEW, slug: "manchester", name: "Manchester", live: true, lat: 53.4792, lng: -2.2444,
    standard: mosque("Manchester Central Mosque", "manchester-central", "Hanafi",
      "Times follow Manchester Central Mosque (Victoria Park), whose start times North Manchester Jamia Mosque also publishes.",
      "From late April to late August, Manchester Central Mosque sets Isha no later than 10:15 pm."),
  },
  {
    ...UK, ...NEW, slug: "glasgow", name: "Glasgow", live: true, lat: 55.861, lng: -4.2488,
    standard: mosque("Glasgow Central Mosque", "glasgow-central", "Shafi",
      "Times follow Glasgow Central Mosque's published timetable.",
      "From May to August the sky never gets fully dark in Glasgow, so Glasgow Central Mosque sets Isha about a seventh of the night after sunset."),
  },
  {
    ...NEW, country: "ca", slug: "toronto", name: "Toronto", live: true, lat: 43.6536, lng: -79.384, timezone: "America/Toronto",
    standard: isna("Shafi",
      "Calculated with the ISNA method (15°). Toronto has no city-wide timetable; this Fajr matches MAC Masjid Toronto, the Islamic Institute of Toronto and the Scarborough Muslim Association to within 2 minutes.",
      "Toronto mosques set Isha in different ways, so your mosque's Isha can differ from this one by up to half an hour in summer."),
  },
  {
    ...NEW, country: "ca", slug: "ottawa", name: "Ottawa", live: true, lat: 45.4228, lng: -75.7031, timezone: "America/Toronto",
    standard: isna("Shafi",
      "Calculated with the ISNA method (15°), which Ottawa Main Mosque, South Nepean Muslim Community and Jami Omar publish.",
      "Isha starts when the sun is 15° below the horizon, the same rule Ottawa's main mosques use."),
  },
  {
    ...NEW, country: "us", slug: "new-york", name: "New York", live: true, lat: 40.7127, lng: -74.0059, timezone: "America/New_York",
    standard: isna("Shafi",
      "Calculated with the ISNA method (15°), which the Islamic Cultural Center of New York, Jamaica Muslim Center and most city mosques publish. Many Bangladeshi and Pakistani mosques list the later Hanafi Asr, so both Asr times are shown.",
      "A few mosques use 18°, which starts Isha 10 to 20 minutes later."),
  },
  {
    ...NEW, country: "us", slug: "philadelphia", name: "Philadelphia", live: true, lat: 39.9524, lng: -75.163, timezone: "America/New_York",
    standard: isna("Shafi",
      "Calculated with the ISNA method (15°), the setting Al-Aqsa Islamic Society, Masjid Al-Jamia and The Philadelphia Masjid use.",
      "Isha starts when the sun is 15° below the horizon, as on most Philadelphia timetables."),
  },
  {
    ...NEW, country: "us", slug: "boston", name: "Boston", live: true, lat: 42.3604, lng: -71.058, timezone: "America/New_York",
    standard: isna("Shafi",
      "Calculated with the ISNA method (15°), which the Islamic Society of Boston Cultural Center, ISB Cambridge and the Islamic Center of New England publish.",
      "Isha starts when the sun is 15° below the horizon, as on the main Boston mosques' timetables."),
  },
  {
    ...NEW_WIDE, country: "us", slug: "atlanta", name: "Atlanta", live: true, lat: 33.7486, lng: -84.3908, timezone: "America/New_York",
    standard: isna("Shafi",
      "Calculated with the ISNA method (15°), used by Roswell Community Masjid, the Islamic Center of Duluth and most metro Atlanta mosques.",
      "Al-Farooq Masjid in Midtown uses Muslim World League angles, so its Isha is about 10 minutes later and its Fajr about 15 minutes earlier."),
  },
  {
    ...NEW, country: "us", slug: "chicago", name: "Chicago", live: true, lat: 41.8838, lng: -87.632, timezone: "America/Chicago",
    standard: isna("Hanafi",
      "Calculated with the ISNA method (15°), matching MCC, the Mosque Foundation and the Islamic Center of Naperville. Asr is shown first at the later Hanafi time most Chicago mosques list.",
      "Isha starts at 15°, as on most Chicago timetables. Many suburban mosques start Fajr earlier, at 18°."),
  },
  {
    ...NEW_WIDE, country: "us", slug: "houston", name: "Houston", live: true, lat: 29.7602, lng: -95.3694, timezone: "America/Chicago",
    standard: {
      kind: "city-timetable", name: "ISGH timetable", timetable: null, asrFirst: "Shafi",
      badge: "Times follow the ISGH (Islamic Society of Greater Houston) timetable, which uses the ISNA method (15°) for its centres across Houston.",
      isha: "Some Houston mosques use 18°, which starts Isha about 15 minutes later.",
    },
  },
  {
    ...NEW, country: "us", slug: "minneapolis", name: "Minneapolis", live: true, lat: 44.9773, lng: -93.2651, timezone: "America/Chicago",
    standard: isna("Shafi",
      "Calculated with the ISNA method (15°), matching Dar Al-Hijrah, Abubakar As-Saddique Islamic Center and Dar Al-Farooq.",
      "In late June Isha starts close to 11 pm, because twilight lasts late into the evening."),
  },
  {
    ...NEW, country: "us", slug: "seattle", name: "Seattle", live: true, lat: 47.6039, lng: -122.3301, timezone: "America/Los_Angeles",
    calc: { method: "NorthAmerica", madhab: "Shafi", highLatitudeRule: "MiddleOfTheNight" },
    standard: isna("Shafi",
      "Calculated with the ISNA method (15°), matching Idris Mosque, MAPS Seattle and most mosques in the area.",
      "From early June to mid-July Isha starts after 11 pm. Some mosques, including MAPS Redmond, publish an earlier Isha then."),
  },
  {
    ...NEW_WIDE, country: "us", slug: "los-angeles", name: "Los Angeles", live: true, lat: 34.0537, lng: -118.2429, timezone: "America/Los_Angeles",
    standard: isna("Shafi",
      "Calculated with the ISNA method (15°), matching King Fahad Mosque and the Islamic Center of Irvine.",
      "Isha starts when the sun is 15° below the horizon, about 70 to 85 minutes after Maghrib."),
  },
];
