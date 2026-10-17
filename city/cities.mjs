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
};

export const COUNTRIES = {
  uk: { name: 'United Kingdom', code: 'GB', lang: 'en-GB' },
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
    nearby: [
      ['Luton', 'luton'], ['Slough', 'slough'], ['Watford', 'watford'], ['Reading', 'reading'],
      ['Crawley', 'crawley'], ['Chelmsford', 'chelmsford'], ['Oxford', 'oxford'],
      ['Cambridge', 'cambridge'], ['Milton Keynes', 'milton-keynes'], ['Birmingham', 'birmingham'],
    ],
  },
};
