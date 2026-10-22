import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sleep, hhmm, toMin, fromMin, writeTimetable } from "./lib.mjs";

// Usage: node leicester-masjid-umar.mjs <empty-download-dir>
// Downloads go into the given directory, never the repo. Re-running with files already there skips the fetch.
const dir = process.argv[2];
if (!dir) throw new Error("pass an empty directory for the downloaded PDFs");
const umarDir = join(dir, "umar");
const madaniDir = join(dir, "madani");
mkdirSync(umarDir, { recursive: true });
mkdirSync(madaniDir, { recursive: true });

const MONTH_NAMES = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const YEARS = [2025, 2026];
const mediaApi = "https://masjid-umar.org/wp-json/wp/v2/media?mime_type=application/pdf&per_page=100&page=";
const madaniUrl = (ym) => `https://madanihigh.leicester.sch.uk/data/prayer/${ym}.pdf`;

async function download(url, path) {
  if (existsSync(path)) return true;
  const res = await fetch(url);
  await sleep(1000);
  if (!res.ok) return false;
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return true;
}

const umarFiles = [];
for (let page = 1; ; page++) {
  const res = await fetch(mediaApi + page);
  await sleep(1000);
  if (!res.ok) break;
  for (const m of await res.json()) umarFiles.push({ url: m.source_url, uploaded: m.date.slice(0, 10) });
}
// File names are unreliable (two "Ramadan" files, a "-1" copy); the PDF header decides the month.
const umarPdfs = [];
for (const f of umarFiles) {
  const name = f.url.split("/").slice(-3).join("_");
  if (!(await download(f.url, join(umarDir, name)))) continue;
  umarPdfs.push({ ...f, path: join(umarDir, name) });
}

// Beginning-time columns print as 12-hour clock times with no am/pm.
const to24 = (col, h, m) => {
  if (col === "fajr" || col === "sunrise") return `${String(h).padStart(2, "0")}:${m}`;
  if (col === "dhuhr") return `${String(h <= 6 ? h + 12 : h).padStart(2, "0")}:${m}`;
  return `${String(h === 12 ? 0 : h < 12 ? h + 12 : h).padStart(2, "0")}:${m}`;
};
const TIME = String.raw`(\d{1,2})[.:](\d{2})`;
const ROW = new RegExp(String.raw`^\s*([A-Z]{3,5})\s+(\d{1,2})\s+\d{1,2}\*?\s+${TIME}\s+${TIME}\s+${TIME}\s+${TIME}\s+${TIME}\b`);
const SPLIT_HEAD = /^\s*([A-Z]{3,5})\s+(\d{1,2})(?:\s+[A-Za-z' -]+)?\s*$/;
const SPLIT_TAIL = new RegExp(String.raw`^\s*\d{1,2}\*?\s+${TIME}\s+${TIME}\s+${TIME}\s+${TIME}\s+${TIME}\b`);
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Madani wraps a row across lines where an Islamic month heading falls on it; stitch those back together.
function rowLines(text) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (SPLIT_HEAD.test(lines[i])) {
      const tail = lines.slice(i + 1, i + 4).find((l) => SPLIT_TAIL.test(l));
      if (tail) {
        out.push(`${lines[i].replace(/\s+[A-Za-z' -]+$/, "").trim()} ${tail.trim()}`);
        lines[lines.indexOf(tail, i + 1)] = "";
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out;
}

function parse(text, startYear, startMonth) {
  const rows = rowLines(text).map((l) => ROW.exec(l)).filter(Boolean);
  const out = {};
  let year = startYear;
  let month = startMonth;
  // Madani's April 2025 sheet opens with 31 March.
  if (rows.length > 1 && Number(rows[0][2]) > 15 && Number(rows[1][2]) < 5) {
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
  }
  let prevDay = 0;
  for (const m of rows) {
    const day = Number(m[2]);
    if (day < prevDay) {
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    prevDay = day;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()] !== m[1].slice(0, 3)) throw new Error(`${iso} is not a ${m[1]}`);
    const t = (i) => [Number(m[3 + 2 * i]), m[4 + 2 * i]];
    const [fajr, sunrise, noon, asr, esha] = [0, 1, 2, 3, 4].map(t);
    out[iso] = {
      fajr: to24("fajr", ...fajr),
      sunrise: to24("sunrise", ...sunrise),
      noon: to24("dhuhr", ...noon),
      asr2: to24("asr", ...asr),
      isha: to24("isha", ...esha),
    };
  }
  return out;
}
const pdftotext = (path) => execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });

const umar = {};
const umarFrom = {};
const conflicts = [];
// Later uploads win where two files cover the same date.
for (const f of umarPdfs.sort((a, b) => a.uploaded.localeCompare(b.uploaded))) {
  const text = pdftotext(f.path);
  const head = text.split("\n").slice(0, 8).map((l) => l.replace(/\s+/g, "").toUpperCase());
  const h = head.map((l) => /^([A-Z]+)(?:\/[A-Z]+)?(\d{4})$/.exec(l)).find((x) => x && MONTH_NAMES.includes(x[1]));
  if (!h) throw new Error(`no month header in ${f.url}`);
  const year = Number(h[2]);
  if (!YEARS.includes(year)) continue;
  for (const [iso, v] of Object.entries(parse(text, year, MONTH_NAMES.indexOf(h[1]) + 1))) {
    if (!YEARS.includes(Number(iso.slice(0, 4)))) continue;
    if (umar[iso] && JSON.stringify(umar[iso]) !== JSON.stringify(v)) conflicts.push(`${iso}: ${JSON.stringify(umar[iso])} (${umarFrom[iso]}) replaced by ${JSON.stringify(v)} (${f.url})`);
    umar[iso] = v;
    umarFrom[iso] = f.url;
  }
}

const madani = {};
for (const y of YEARS) {
  for (let mo = 1; mo <= 12; mo++) {
    const ym = `${y}-${String(mo).padStart(2, "0")}`;
    const path = join(madaniDir, `${ym}.pdf`);
    if (!(await download(madaniUrl(ym), path))) continue;
    Object.assign(madani, parse(pdftotext(path), y, mo));
  }
}

// Masjid Umar's "Noon" is solar noon; its Zuhr begins 5 minutes later, which is Madani's "Zawal" column and the Zohar time salaahtimes lists for Masjid Umar.
// Dhuhr is therefore taken from Madani only, and left null where Madani has no file.
const days = {};
let diffs = 0;
const diffLog = [];
const fromMadaniOnly = [];
for (const iso of [...new Set([...Object.keys(umar), ...Object.keys(madani)])].sort()) {
  const u = umar[iso];
  const md = madani[iso];
  if (u && md) {
    for (const k of ["fajr", "sunrise", "asr2", "isha"]) {
      if (u[k] !== md[k]) {
        diffs++;
        diffLog.push(`${iso} ${k}: umar ${u[k]} madani ${md[k]}`);
      }
    }
    const gap = toMin(md.noon) - toMin(u.noon);
    if (gap !== 5) diffLog.push(`${iso} noon gap ${gap}`);
  }
  if (!u) fromMadaniOnly.push(iso);
  const src = u ?? md;
  days[iso] = [src.fajr, src.sunrise, md ? md.noon : null, null, src.asr2, null, src.isha];
}
console.log(`umar days ${Object.keys(umar).length}, madani days ${Object.keys(madani).length}, madani-only ${fromMadaniOnly.length}`);
console.log(`cross-check disagreements (minutes shown only when not equal): ${diffs}`);
for (const l of diffLog) console.log("  ", l);
for (const c of conflicts) console.log("  duplicate:", c);
console.log("madani-only dates:", fromMadaniOnly.join(" ") || "none");

// salaahtimes.co.uk: today's begin times for Masjid Umar as a third check.
const st = await (await fetch("https://www.salaahtimes.co.uk/BeginningTimes/Today")).text();
const block = st.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean);
const at = block.indexOf("Masjid Umar");
const stTimes = block.slice(at + 1, at + 6).map(hhmm);
const todayIso = new Date().toISOString().slice(0, 10);
if (days[todayIso]) {
  const d = days[todayIso];
  const mine = [d[0], d[1], d[2], d[4], d[6]];
  console.log(`salaahtimes ${todayIso}: ${stTimes.join(" ")} | ours ${mine.join(" ")} | ${JSON.stringify(stTimes) === JSON.stringify(mine) ? "match" : "DIFFERENT"}`);
}

writeTimetable({
  id: "leicester-masjid-umar",
  name: "Masjid Umar timetable",
  publisher: "Masjid Umar, Leicester",
  sources: ["https://masjid-umar.org/wp-json/wp/v2/media?mime_type=application/pdf", "https://madanihigh.leicester.sch.uk/data/prayer/YYYY-MM.pdf", "https://www.salaahtimes.co.uk/BeginningTimes/Today"],
  zone: "Europe/London",
  site: { lat: 52.6334, lng: -1.133 },
  days,
  corrections: [],
});
