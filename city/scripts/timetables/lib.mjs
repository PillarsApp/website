import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as adhan from "adhan";

export const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "timetables");
export const scratch = (name) => mkdtempSync(join(tmpdir(), `${name}-`));

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function calcTimes(dateIso, lat, lng, zone) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const params = adhan.CalculationMethod.MoonsightingCommittee();
  const pt = new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), new Date(y, m - 1, d, 12), params);
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false });
  const at = (dt) => f.format(dt).replace(/^24/, "00");
  return { sunrise: at(pt.sunrise), maghrib: at(pt.maghrib) };
}

// Strictly increasing over non-null entries, sunrise/maghrib within 20 min of adhan.
export function validateDay(dateIso, row, lat, lng, zone) {
  const problems = [];
  const vals = row.filter((v) => v !== null);
  for (let i = 1; i < vals.length; i++) {
    if (toMin(vals[i]) <= toMin(vals[i - 1])) problems.push(`not increasing at ${vals[i - 1]} -> ${vals[i]}`);
  }
  const c = calcTimes(dateIso, lat, lng, zone);
  if (row[1] && Math.abs(toMin(row[1]) - toMin(c.sunrise)) > 20) problems.push(`sunrise ${row[1]} vs calc ${c.sunrise}`);
  if (row[5] && Math.abs(toMin(row[5]) - toMin(c.maghrib)) > 20) problems.push(`maghrib ${row[5]} vs calc ${c.maghrib}`);
  return problems;
}

export function finish({ meta, days, lat, lng }) {
  const keys = Object.keys(days).sort();
  const sorted = {};
  const dropped = [];
  for (const k of keys) {
    const row = days[k];
    if (row.length !== 7) throw new Error(`${k}: ${row.length} entries`);
    const p = validateDay(k, row, lat, lng, meta.zone);
    if (p.length) dropped.push({ date: k, problems: p });
    else sorted[k] = row;
  }
  mkdirSync(dataDir, { recursive: true });
  const head = JSON.stringify(meta, null, 2).slice(0, -2);
  const lines = Object.entries(sorted).map(([k, v]) => `    "${k}": ${JSON.stringify(v)}`);
  writeFileSync(join(dataDir, `${meta.id}.json`), `${head},\n  "days": {\n${lines.join(",\n")}\n  }\n}\n`);
  const ks = Object.keys(sorted);
  console.log(`${meta.id}: ${ks.length} days ${ks[0]}..${ks.at(-1)}; dropped ${dropped.length}`);
  for (const d of dropped) console.log("  dropped", d.date, d.problems.join("; "));
  return { dropped };
}
