import * as adhan from "adhan";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "timetables");
export const COLUMNS = ["fajr", "sunrise", "dhuhr", "asr1", "asr2", "maghrib", "isha"];

const PAUSE_MS = 1000;
const TRIES = 3;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};

export function rawDir() {
  const dir = flag("raw");
  if (dir === undefined) return mkdtempSync(join(tmpdir(), "timetable-raw-"));
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).length) throw new Error(`--raw ${dir} must be empty`);
  return dir;
}

// Sequential by construction: every request is followed by a pause. A 4xx other than 429 is the
// server's answer, so it is returned as null when `optional` and thrown otherwise, never retried.
export async function fetchPolite(url, init = {}, { optional = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
      await sleep(PAUSE_MS);
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        if (optional) return null;
        throw Object.assign(new Error(`HTTP ${res.status}`), { final: true });
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (err.final || attempt >= TRIES) throw new Error(`${url}: ${err.message}`);
      await sleep(2000 * attempt);
    }
  }
}

export const getText = async (url) => (await fetchPolite(url)).text();
export const getJson = async (url) => (await fetchPolite(url)).json();

export async function download(url, path, opts) {
  const res = await fetchPolite(url, {}, opts);
  if (!res) return false;
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return true;
}

export const postForm = async (url, fields) =>
  (await fetchPolite(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  })).text();

export const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function hhmm(s) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s ?? "");
  return m ? `${pad(m[1])}:${m[2]}` : null;
}

export function localHHMM(date, zone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("hour")}:${get("minute")}`;
}

// Moonsighting Committee at the city coordinates; the contract uses it only to bound sunrise and maghrib.
export function calculated(date, { lat, lng, zone }) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), new Date(y, m - 1, d, 12), adhan.CalculationMethod.MoonsightingCommittee());
  return { sunrise: localHHMM(t.sunrise, zone), maghrib: localHHMM(t.maghrib, zone) };
}

// A row that is not 7 times-or-nulls is a script bug and throws. Order and the adhan bound are
// data judgements: the day fails and is left out.
export function validateDays(days, place) {
  const failures = [];
  for (const [date, row] of Object.entries(days)) {
    if (row.length !== 7 || !row.every((v) => v === null || /^\d\d:\d\d$/.test(v))) throw new Error(`${date}: malformed row ${JSON.stringify(row)}`);
    const set = row.filter((v) => v !== null);
    if (!set.every((v, i) => i === 0 || toMin(v) > toMin(set[i - 1]))) {
      failures.push({ date, row, why: "not strictly increasing" });
      continue;
    }
    const calc = calculated(date, place);
    for (const [col, i] of [["sunrise", 1], ["maghrib", 5]]) {
      if (row[i] === null) continue;
      const diff = toMin(row[i]) - toMin(calc[col]);
      if (Math.abs(diff) > 20) failures.push({ date, row, why: `${col} ${row[i]} is ${diff} min from calculated ${calc[col]}` });
    }
  }
  return failures;
}

export function writeTimetable({ id, name, publisher, sources, zone, place, corrections, days }) {
  const failures = validateDays(days, { ...place, zone });
  const dropped = new Set(failures.map((f) => f.date));
  const sorted = Object.entries(days).filter(([d]) => !dropped.has(d)).sort(([a], [b]) => (a < b ? -1 : 1));
  for (const f of failures) console.log(`dropped ${f.date} ${JSON.stringify(f.row)}: ${f.why}`);
  const retrieved = new Date().toISOString().slice(0, 10);
  const head = JSON.stringify({ id, name, publisher, sources, retrieved, zone, corrections }, null, 2).slice(0, -2);
  const rows = sorted.map(([d, r]) => `    "${d}": ${JSON.stringify(r).replaceAll(",", ", ")}`);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, `${id}.json`), `${head},\n  "days": {\n${rows.join(",\n")}\n  }\n}\n`);
  const nulls = COLUMNS.filter((_, i) => sorted.every(([, r]) => r[i] === null));
  console.log(`${id}: ${sorted.length} days ${sorted[0][0]}..${sorted.at(-1)[0]}; all-null columns ${nulls.join(",") || "none"}; ${corrections.length} corrections; dropped ${dropped.size}`);
}
