import * as adhan from "adhan";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(here, "..", "..", "data", "timetables");
export const COLUMNS = ["fajr", "sunrise", "dhuhr", "asr1", "asr2", "maghrib", "isha"];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function rawDir(argv) {
  const i = argv.indexOf("--raw");
  if (i < 0) return mkdtempSync(join(tmpdir(), "timetable-raw-"));
  const dir = argv[i + 1];
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).length) throw new Error(`--raw ${dir} must be empty`);
  return dir;
}

export async function request(url, init = {}, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url}: ${err.message}`);
      await sleep(2000 * attempt);
    }
  }
}

export function postForm(url, fields) {
  return request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

export const pad = (n) => String(n).padStart(2, "0");
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function to24(hour, minute, meridiem) {
  let h = Number(hour) % 12;
  if (/^p/i.test(meridiem)) h += 12;
  return `${pad(h)}:${pad(Number(minute))}`;
}

export function localHHMM(date, zone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

export function calculate(date, { lat, lng, zone }) {
  const [y, m, d] = date.split("-").map(Number);
  const params = adhan.CalculationMethod.MoonsightingCommittee();
  params.highLatitudeRule = adhan.HighLatitudeRule.TwilightAngle;
  const t = new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), new Date(y, m - 1, d), params);
  const out = {};
  for (const k of ["fajr", "sunrise", "dhuhr", "maghrib", "isha"]) out[k] = localHHMM(t[k], zone);
  params.madhab = adhan.Madhab.Hanafi;
  out.asr2 = localHHMM(new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), new Date(y, m - 1, d), params).asr, zone);
  return out;
}

export function validateDays(days, place) {
  const failures = [];
  for (const [date, row] of Object.entries(days)) {
    const set = row.filter((v) => v !== null);
    if (!set.every((v) => /^\d\d:\d\d$/.test(v))) {
      failures.push({ date, why: `malformed entry ${JSON.stringify(row)}` });
      continue;
    }
    if (!set.every((v, i) => i === 0 || toMin(v) > toMin(set[i - 1]))) {
      failures.push({ date, why: `not strictly increasing ${JSON.stringify(row)}` });
      continue;
    }
    const calc = calculate(date, place);
    for (const [col, idx] of [["sunrise", 1], ["maghrib", 5]]) {
      const diff = toMin(row[idx]) - toMin(calc[col]);
      if (Math.abs(diff) > 20) failures.push({ date, why: `${col} ${row[idx]} is ${diff} min from calculated ${calc[col]}` });
    }
  }
  return failures;
}

// Large gaps that pass the contract's checks, for a human to look at; never dropped.
export function warnings(days, place, limit = 45) {
  const out = [];
  for (const [date, row] of Object.entries(days)) {
    const calc = calculate(date, place);
    for (const [col, idx] of [["fajr", 0], ["dhuhr", 2], ["asr2", 4], ["isha", 6]]) {
      if (row[idx] === null) continue;
      const diff = toMin(row[idx]) - toMin(calc[col]);
      if (Math.abs(diff) > limit) out.push(`${date} ${col} ${row[idx]} vs calculated ${calc[col]} (${diff} min)`);
    }
  }
  return out;
}

export function finish({ id, name, publisher, sources, zone, place, corrections, days }) {
  const failures = validateDays(days, place);
  for (const f of failures) delete days[f.date];
  const sorted = Object.fromEntries(Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)));
  const file = join(DATA_DIR, `${id}.json`);
  mkdirSync(DATA_DIR, { recursive: true });
  const meta = JSON.stringify(
    { id, name, publisher, sources, retrieved: new Date().toISOString().slice(0, 10), zone, corrections },
    null,
    2,
  ).slice(0, -2);
  const rows = Object.entries(sorted).map(([d, r]) => `    "${d}": ${JSON.stringify(r).replaceAll(",", ", ")}`);
  const body = `${meta},\n  "days": {\n${rows.join(",\n")}\n  }\n}`;
  writeFileSync(file, body + "\n");
  const dates = Object.keys(sorted);
  console.log(`${id}: ${dates.length} days, ${dates[0]} to ${dates.at(-1)}`);
  const nulls = COLUMNS.filter((_, i) => Object.values(sorted).every((r) => r[i] === null));
  console.log(`all-null columns: ${nulls.join(", ") || "none"}`);
  console.log(`corrections: ${corrections.length}`);
  console.log(`dropped by validation: ${failures.length}`);
  for (const f of failures) console.log(`  ${f.date}: ${f.why}`);
  const warn = warnings(sorted, place);
  console.log(`large-gap warnings (kept): ${warn.length}`);
  for (const w of warn.slice(0, 40)) console.log(`  ${w}`);
  return { failures, days: sorted };
}
