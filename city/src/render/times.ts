// City-local calendar and prayer-time arithmetic. The only module that
// imports adhan and the only one that creates Intl.DateTimeFormat for a city
// zone. Per-city, with formatters memoized per isolate and days and zone
// abbreviations memoized per clock.

import * as adhan from "adhan"; // named exports only: `import adhan from` breaks under a bundler
import type { Calc, City, Country, Instant, LocalDate } from "../types";

export const PRAYERS = [
  { key: "fajr", name: "Fajr" },
  { key: "sunrise", name: "Sunrise" },
  { key: "dhuhr", name: "Dhuhr" },
  { key: "asr", name: "Asr" },
  { key: "maghrib", name: "Maghrib" },
  { key: "isha", name: "Isha" },
] as const;

// Six instants in PRAYERS order plus the Hanafi Asr.
export interface DayTimes {
  readonly date: LocalDate;
  readonly t: readonly [Instant, Instant, Instant, Instant, Instant, Instant];
  readonly asrHanafi: Instant;
}

// What the prose and the page's data block need to say about the method,
// without touching adhan.
export interface CalcInfo {
  readonly method: string; // adhan method name, as city.js reads it
  readonly madhab: string;
  readonly highLatitudeRule: string;
  readonly methodLabel: string; // "Moonsighting Committee"
  readonly fajrAngle: number;
  readonly ishaAngle: number;
  readonly ishaInterval: number; // 0 when angle-based
  readonly adjustments: readonly { readonly prayer: string; readonly minutes: number }[];
  readonly seasonalLimits: boolean; // Moonsighting Committee's high-latitude behaviour
}

export interface HijriDate {
  readonly day: number;
  readonly month: number; // 0-based
  readonly year: number;
  readonly long: string; // "11 Jumada al-Awwal 1448"
  readonly short: string; // "11 Jum I"
}

// Everything time-shaped the renderer asks for, for one city. Pure given
// (city, country); `now` is passed in so a render is a function of its inputs.
export interface CityClock {
  readonly timezone: string;
  readonly calc: CalcInfo;
  today(now: Instant): LocalDate;
  nextMidnight(now: Instant): Instant; // city-local 00:00 after `now`
  localInstant(d: LocalDate, h: number, mi: number): Instant; // the instant city-local wall time h:mi on d
  addDays(d: LocalDate, n: number): LocalDate;
  daysInMonth(year: number, month: number): number;
  day(d: LocalDate): DayTimes; // memoized per clock instance
  time(ms: Instant): string; // "06:00" / "6:00 AM"
  tableTime(ms: Instant): string; // compact "6:00" in 12h tables
  wallClock(hm: string | undefined, compact?: boolean): string; // mosque "HH:mm", reformatted
  hm(ms: Instant): string; // "HH:mm" for widget data
  isoLocal(ms: Instant): string; // "2026-10-22T06:00:00+01:00"
  longDate(d: LocalDate): string; // "Thursday 22 October 2026"
  appDate(d: LocalDate): string; // "Thursday 22 October"
  shortDay(d: LocalDate): string; // "Thu 22"
  monthYear(d: LocalDate): string; // "October 2026"
  weekday(d: LocalDate): number; // 0 = Sunday
  hijri(d: LocalDate): HijriDate;
  zoneAbbr(ms: Instant): string; // "BST"
  zoneLong(ms: Instant): string; // "British Summer Time"
  zoneAbbrOn(d: LocalDate): string; // abbreviation at noon UTC on that date, memoized
  // First date after `from` within a year on which the zone abbreviation
  // changes, or null (no DST).
  nextClockChange(from: LocalDate): LocalDate | null;
  qibla(): { bearing: number; compass: string };
}

const HIJRI_MONTHS = ["Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani", "Jumada al-Awwal", "Jumada al-Thani",
  "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhul-Qa'dah", "Dhul-Hijjah"];
const HIJRI_SHORT = ["Muh", "Saf", "Rab I", "Rab II", "Jum I", "Jum II", "Raj", "Sha", "Ram", "Shaw", "Dhul Q", "Dhul H"];
const METHOD_LABEL: Readonly<Record<string, string>> = {
  MoonsightingCommittee: "Moonsighting Committee", MuslimWorldLeague: "Muslim World League",
  NorthAmerica: "ISNA (North America)", UmmAlQura: "Umm al-Qura", Egyptian: "Egyptian General Authority",
  Karachi: "University of Islamic Sciences, Karachi", Dubai: "Dubai", Kuwait: "Kuwait", Qatar: "Qatar",
  Singapore: "Singapore", Turkey: "Diyanet (Turkey)", Custom: "Custom angles",
};
const COMPASS = ["north", "north-northeast", "northeast", "east-northeast", "east", "east-southeast", "southeast", "south-southeast",
  "south", "south-southwest", "southwest", "west-southwest", "west", "west-northwest", "northwest", "north-northwest"];
const KAABA = { lat: 21.4225, lng: 39.8262 };

const pad = (n: number) => String(n).padStart(2, "0");
// The one place a string is asserted to be a calendar date.
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}` as LocalDate;
const ymdParts = (d: LocalDate) => d.split("-").map(Number) as [number, number, number];
const noonUTC = (d: LocalDate) => { const [y, m, day] = ymdParts(d); return new Date(Date.UTC(y, m - 1, day, 12)); };

// Formatters are immutable and expensive to create: one per (locale, zone,
// options) per isolate.
const formatterCache = new Map<string, Intl.DateTimeFormat>();
export function formatter(timeZone: string, options: Intl.DateTimeFormatOptions, locale = "en-GB"): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone, ...options });
    formatterCache.set(key, f);
  }
  return f;
}

const utcFormat = (options: Intl.DateTimeFormatOptions) => formatter("UTC", options);

export function calcInfo(calc: Calc): CalcInfo {
  const p = paramsFor(calc, calc.madhab);
  return {
    method: calc.method,
    madhab: calc.madhab,
    highLatitudeRule: calc.highLatitudeRule,
    methodLabel: METHOD_LABEL[calc.method] ?? calc.method,
    fajrAngle: p.fajrAngle,
    ishaAngle: p.ishaAngle,
    ishaInterval: p.ishaInterval,
    adjustments: Object.entries(p.methodAdjustments)
      .filter(([, minutes]) => minutes)
      .map(([prayer, minutes]) => ({ prayer: prayer[0].toUpperCase() + prayer.slice(1), minutes })),
    seasonalLimits: calc.method === "MoonsightingCommittee",
  };
}

function paramsFor(calc: Calc, madhab: "Shafi" | "Hanafi"): adhan.CalculationParameters {
  let p: adhan.CalculationParameters;
  if (calc.method === "Custom") {
    p = adhan.CalculationMethod.Other();
    p.fajrAngle = calc.fajrAngle;
    p.ishaAngle = calc.ishaAngle;
    p.ishaInterval = calc.ishaInterval ?? 0;
  } else {
    p = adhan.CalculationMethod[calc.method]();
  }
  p.madhab = adhan.Madhab[madhab];
  p.highLatitudeRule = adhan.HighLatitudeRule[calc.highLatitudeRule];
  return p;
}

export function cityClock(city: City, country: Country): CityClock {
  const calc: Calc = city.calc ?? country.calc;
  const tz = city.timezone;
  const coords = new adhan.Coordinates(city.lat, city.lng);
  const standard = paramsFor(calc, calc.madhab);
  const hanafi = paramsFor(calc, "Hanafi");
  const info = calcInfo(calc);
  const clock12 = country.clock === 12;

  const partsFmt = formatter(tz, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  function partsOf(ms: Instant) {
    const p: Record<string, string> = {};
    for (const x of partsFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
  }
  const offsetMin = (ms: Instant) => {
    const p = partsOf(ms);
    return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000);
  };
  const zoned = (y: number, mo: number, d: number, h: number, mi: number) => {
    const g = Date.UTC(y, mo - 1, d, h, mi);
    return g - offsetMin(g - offsetMin(g) * 60000) * 60000;
  };
  const ymdOf = (ms: Instant) => { const p = partsOf(ms); return ymd(p.y, p.mo, p.d); };

  const addDays = (d: LocalDate, n: number) => {
    const [y, m, day] = ymdParts(d);
    const t = new Date(Date.UTC(y, m - 1, day + n, 12));
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  };

  // fmtHM mirrors city.js formatTime (the app's "HH:mm" / "h:mm a", including
  // its 12:00 quirk); compact is the 12-hour table form without AM/PM.
  const fmtHM = (h: number, mi: number, compact: boolean) => {
    if (!clock12 || (!compact && h === 12 && mi === 0)) return `${pad(h)}:${pad(mi)}`;
    return `${h % 12 === 0 ? 12 : h % 12}:${pad(mi)}${compact ? "" : h < 12 ? " AM" : " PM"}`;
  };

  const zoneName = (style: "short" | "long") => (ms: Instant) =>
    formatter(tz, { timeZoneName: style }).formatToParts(new Date(ms)).find((x) => x.type === "timeZoneName")!.value;
  const zoneAbbr = zoneName("short");
  const zoneLong = zoneName("long");

  const days = new Map<LocalDate, DayTimes>();
  const dayFor = (d: LocalDate): DayTimes => {
    let cached = days.get(d);
    if (!cached) {
      const [y, m, day] = ymdParts(d);
      const at = new Date(y, m - 1, day);
      const pt = new adhan.PrayerTimes(coords, at, standard);
      cached = {
        date: d,
        t: [pt.fajr, pt.sunrise, pt.dhuhr, pt.asr, pt.maghrib, pt.isha].map((x) => x.getTime()) as unknown as DayTimes["t"],
        asrHanafi: new adhan.PrayerTimes(coords, at, hanafi).asr.getTime(),
      };
      days.set(d, cached);
    }
    return cached;
  };

  const abbrByDate = new Map<LocalDate, string>();
  const abbrAt = (d: LocalDate) => {
    let a = abbrByDate.get(d);
    if (a === undefined) { a = zoneAbbr(noonUTC(d).getTime()); abbrByDate.set(d, a); }
    return a;
  };
  const clockChanges = new Map<LocalDate, LocalDate | null>();

  const hijri = (d: LocalDate): HijriDate => {
    const p: Record<string, string> = {};
    for (const x of formatter("UTC", { day: "numeric", month: "numeric", year: "numeric" }, "en-GB-u-ca-islamic-umalqura-nu-latn").formatToParts(noonUTC(d))) p[x.type] = x.value;
    const day = parseInt(p.day, 10), month = parseInt(p.month, 10) - 1, year = parseInt(p.year, 10);
    return { day, month, year, long: `${day} ${HIJRI_MONTHS[month]} ${year}`, short: `${day} ${HIJRI_SHORT[month]}` };
  };

  return {
    timezone: tz,
    calc: info,
    today: ymdOf,
    nextMidnight(now) {
      const [y, m, d] = ymdParts(addDays(ymdOf(now), 1));
      return zoned(y, m, d, 0, 0);
    },
    localInstant(d, h, mi) {
      const [y, m, day] = ymdParts(d);
      return zoned(y, m, day, h, mi);
    },
    addDays,
    daysInMonth: (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate(),
    day: dayFor,
    time(ms) { const p = partsOf(ms); return fmtHM(p.h, p.mi, false); },
    tableTime(ms) { const p = partsOf(ms); return fmtHM(p.h, p.mi, true); },
    wallClock(hm, compact = true) {
      const m = /^(\d{1,2}):(\d{2})/.exec(hm ?? "");
      return m ? fmtHM(+m[1], +m[2], compact) : "–";
    },
    hm(ms) { const p = partsOf(ms); return `${pad(p.h)}:${pad(p.mi)}`; },
    isoLocal(ms) {
      const p = partsOf(ms), o = offsetMin(ms), sign = o < 0 ? "-" : "+", a = Math.abs(o);
      return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
    },
    longDate: (d) => utcFormat({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(noonUTC(d)).replace(",", ""),
    appDate: (d) => utcFormat({ weekday: "long", day: "numeric", month: "long" }).format(noonUTC(d)).replace(",", ""),
    shortDay: (d) => utcFormat({ weekday: "short", day: "numeric" }).format(noonUTC(d)).replace(",", ""),
    monthYear: (d) => utcFormat({ month: "long", year: "numeric" }).format(noonUTC(d)),
    weekday: (d) => noonUTC(d).getUTCDay(),
    hijri,
    zoneAbbr,
    zoneLong,
    zoneAbbrOn: abbrAt,
    nextClockChange(from) {
      if (clockChanges.has(from)) return clockChanges.get(from)!;
      let found: LocalDate | null = null;
      for (let i = 1; i <= 366 && !found; i++) {
        const d = addDays(from, i);
        if (abbrAt(d) !== abbrAt(addDays(d, -1))) found = d;
      }
      clockChanges.set(from, found);
      return found;
    },
    qibla() {
      const r = Math.PI / 180, p1 = city.lat * r, p2 = KAABA.lat * r, dl = (KAABA.lng - city.lng) * r;
      const b = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
      const bearing = Math.round((b / r + 360) % 360);
      return { bearing, compass: COMPASS[Math.round(bearing / 22.5) % 16] };
    },
  };
}
