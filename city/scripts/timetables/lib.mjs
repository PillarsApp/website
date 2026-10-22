import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as adhan from "adhan";

const here = dirname(fileURLToPath(import.meta.url));
export const dataDir = join(here, "..", "..", "data", "timetables");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const hhmm = (s) => {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s ?? "");
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
};

export const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

const wall = (date, zone) => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t) => Number(p.find((x) => x.type === t).value);
  return get("hour") * 60 + get("minute");
};

// Moonsighting Committee at the city coordinates; used only as a sanity bound on sunrise and maghrib.
export function calculated(iso, { lat, lng, zone }) {
  const [y, m, d] = iso.split("-").map(Number);
  const params = adhan.CalculationMethod.MoonsightingCommittee();
  params.madhab = adhan.Madhab.Shafi;
  params.highLatitudeRule = adhan.HighLatitudeRule.TwilightAngle;
  const t = new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), new Date(Date.UTC(y, m - 1, d, 12)), params);
  return { sunrise: wall(t.sunrise, zone), maghrib: wall(t.maghrib, zone) };
}

export function validate(days, site) {
  const failures = [];
  for (const [iso, row] of Object.entries(days)) {
    const why = [];
    const set = row.map((v, i) => (v === null ? null : toMin(v))).map((v, i) => [v, i]).filter(([v]) => v !== null);
    for (let k = 1; k < set.length; k++) if (set[k][0] <= set[k - 1][0]) why.push(`not increasing at column ${set[k][1]}`);
    const calc = calculated(iso, site);
    if (row[1] !== null && Math.abs(toMin(row[1]) - calc.sunrise) > 20) why.push(`sunrise ${row[1]} vs calculated ${fromMin(calc.sunrise)}`);
    if (row[5] !== null && Math.abs(toMin(row[5]) - calc.maghrib) > 20) why.push(`maghrib ${row[5]} vs calculated ${fromMin(calc.maghrib)}`);
    if (why.length) failures.push({ date: iso, row, why });
  }
  return failures;
}

// `expectedDrops` lists dates a human has already judged unfixable, so a new failure fails the run.
export function writeTimetable({ id, name, publisher, sources, zone, site, days, corrections, expectedDrops = [] }) {
  const sorted = Object.fromEntries(Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)));
  const failures = validate(sorted, { ...site, zone });
  const unexpected = failures.filter((f) => !expectedDrops.includes(f.date));
  for (const f of failures) console.log(expectedDrops.includes(f.date) ? "dropped" : "FAILED", f.date, JSON.stringify(f.row), f.why.join("; "));
  if (unexpected.length) throw new Error(`${unexpected.length} unexpected validation failures`);
  for (const f of failures) delete sorted[f.date];
  const out = { id, name, publisher, sources, retrieved: new Date().toISOString().slice(0, 10), zone, corrections, days: sorted };
  mkdirSync(dataDir, { recursive: true });
  const body = JSON.stringify(out, null, 2).replace(/\[\s+("[\d:]{5}"|null)(?:,\s+("[\d:]{5}"|null))*\s+\]/g, (m) => m.replace(/\s+/g, " ").replace("[ ", "[").replace(" ]", "]"));
  writeFileSync(join(dataDir, `${id}.json`), body + "\n");
  const keys = Object.keys(sorted);
  const nulls = [0, 1, 2, 3, 4, 5, 6].filter((i) => keys.every((k) => sorted[k][i] === null));
  console.log(`${id}: ${keys.length} days ${keys[0]}..${keys.at(-1)}; all-null columns ${nulls}; ${corrections.length} corrections; dropped ${failures.length}`);
}
