// City pages config. Adding a city is a data change: add an entry here and run
//   node city/build.mjs --city <slug> [--date YYYY-MM-DD]
// method / madhab / highLatitudeRule are adhan names and must match the app's
// defaults for the country (prayer_time_manager.dart countryCodeToParamMap):
//   us, ca: NorthAmerica · sa: UmmAlQura · qa: Qatar · eg, lb: Egyptian ·
//   pk, in: Karachi · ae: Dubai · kw: Kuwait · sg: Singapore · tr: Turkey ·
//   au, nl, za: MuslimWorldLeague · fr, ma: custom 18/18 · id, my: custom 20/18 ·
//   be, jo, tn: custom 18/17 · everything else (incl. gb): MoonsightingCommittee.
// The app always uses Shafi Asr by default and the TwilightAngle high-latitude rule.
//
// URLs follow the report's scheme /prayer-times/{country}/{city}/ (PROVISIONAL:
// not yet decided by the team, no route exists for it yet).

export const SITE = {
  origin: 'https://thepillarsapp.com',
  name: 'Pillars',
  logo: 'https://thepillarsapp.com/assets/icon-pillars-notification.png',
  hubPath: '/prayer-times/',
  // Pillars masjid-times Worker. Needs the X-App-Secret header, which build.mjs
  // reads from the MASJID_TIMES_SECRET env var at build time only; it must never
  // be committed or shipped in the page.
  masjidTimesApi: 'https://masjid-times-prod.omar-abb.workers.dev',
  // PROVISIONAL mosque page scheme (no route yet): /mosques/{country}/{city}/{slug}/
  mosquePath: (country, city, slug) => `/mosques/${country}/${city}/${slug}/`,
};

// clock: 12 or 24, the format most common locally. Applies to the whole page
// (app replica, baked HTML, live updates); ?clock=12|24 overrides it in the browser.
// Countries without an entry use DEFAULT_CLOCK.
export const DEFAULT_CLOCK = 12;

export const COUNTRIES = {
  uk: { name: 'United Kingdom', short: 'UK', code: 'GB', lang: 'en-GB', clock: 24 },
  us: { name: 'United States', short: 'USA', code: 'US', lang: 'en-US', clock: 12 },
  ca: { name: 'Canada', short: 'Canada', code: 'CA', lang: 'en-CA', clock: 12 },
};

export const CITIES = {
  london: {
    slug: 'london',
    country: 'uk',
    name: 'London',
    lat: 51.5072,
    lng: -0.1276,
    timezone: 'Europe/London',
    method: 'MoonsightingCommittee',
    madhab: 'Shafi',
    highLatitudeRule: 'TwilightAngle',
    datePublished: '2026-10-17',
    // Neutral note on the timetable most local mosques publish.
    localTimetable: {
      name: 'London Unified Prayer Timetable',
      note: 'Many London mosques, including East London Mosque and London Central Mosque, publish the London Unified Prayer Timetable. It is based on local observation rather than a fixed sun angle, so its Fajr and Isha can differ from the times on this page by several minutes, most of all in summer. Both are valid ways of working out the times. For jamaat (congregation) times, follow your local mosque.',
    },
    // Grey line under the app-replica list. Omit to get "Calculated using the
    // <method> method". Once the London Unified
    // timetable is wired up this becomes 'Source: London Unified Prayer Timetable'.
    listCaption: null,
    // Mosques section: these masjid-times ids first (well-known London mosques),
    // then the nearest others with reliable times, up to `max`. Without the API
    // secret the build falls back to data/london-mosques.sample.json.
    mosques: {
      radiusKm: 15,
      max: 10,
      sample: 'data/london-mosques.sample.json',
      featured: [
        'plr_6de9979e3da7f5d5', // London Central Mosque (Regent's Park)
        'plr_50a8ad8349ca78e0', // East London Mosque
        'plr_61d5192b45799700', // Finsbury Park Mosque
        'plr_43db5bc31100eb39', // Edgware Road Mosque
        'plr_9d8e8ee9885a7fee', // Muslim Welfare House
        'plr_83b105b2623a56f7', // Brick Lane Jamme Masjid
        'plr_4bfa198109fc1f07', // New Peckham Mosque
        'plr_b75acfea0976ddfb', // Holborn Muslim Community Association
        'plr_97b1aaec78a40a8c', // Al-Negashi Mosque & Centre
        'plr_6049986c2b4dec89', // Markazi Masjid
      ],
    },
    nearby: [
      ['Luton', 'luton'], ['Slough', 'slough'], ['Watford', 'watford'], ['Reading', 'reading'],
      ['Crawley', 'crawley'], ['Chelmsford', 'chelmsford'], ['Oxford', 'oxford'],
      ['Cambridge', 'cambridge'], ['Milton Keynes', 'milton-keynes'], ['Birmingham', 'birmingham'],
    ],
  },
};
