// Usage: node chelmsford-cms.mjs [--central central.pdf] [--hamptons hamptons.pdf] [--raw dir]
// Without the paths it downloads both Masjidbox yearly PDFs. Needs pdftotext (poppler).
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { download, flag, isoDate, pad, rawDir, writeTimetable } from "./lib.mjs";

const CENTRAL = "https://cdn.mbxsrc.com/calendar/695177a43e03f8001b2346e8/6YP9r4E_PoRKmqXJGrJWX.pdf";
const HAMPTONS = "https://cdn.mbxsrc.com/calendar/6950120d3e03f8001b2344c8/Lun-kvIa0r9xXrFUbamnX.pdf";
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

async function pdfText(path, url, name) {
  if (!path) {
    path = join(raw, `${name}.pdf`);
    await download(url, path);
  }
  const r = spawnSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout;
}

// The sheet prints 12-hour times without am/pm. Fajr and Shuruq are morning, Dhuhr is
// 11:xx before the clocks go forward and 12:xx or 1:xx after, the rest are afternoon or evening.
function to24(col, t) {
  const [h, m] = t.split(":").map(Number);
  const am = col === 0 || col === 1 || (col === 2 && h === 11);
  const hh = am ? h : h === 12 ? 12 : h + 12;
  return `${pad(hh)}:${pad(m)}`;
}

// Columns after the weekday, day and hijri date: fajr athan/iqamah, shuruq, dhuhr athan/iqamah,
// asr athan/iqamah, maghrib athan/iqamah, isha athan/iqamah. Only the athan (start) times are kept.
const START = [0, 2, 3, 5, 7, 9];

function parse(text) {
  const days = {};
  let month = -1;
  for (const line of text.split("\n")) {
    const mh = line.match(/^\s*([A-Z]+) 2026\s*$/);
    if (mh && MONTHS.includes(mh[1])) { month = MONTHS.indexOf(mh[1]); continue; }
    const m = line.match(/^\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d+)\s+\d+\s+(.*)$/);
    if (!m) continue;
    const t = m[2].trim().split(/\s+/);
    if (t.length !== 11) throw new Error(`unexpected row: ${line}`);
    const date = isoDate(2026, month + 1, m[1]);
    const [fajr, sunrise, dhuhr, asr, maghrib, isha] = START.map((i) => t[i]);
    const c = [fajr, sunrise, dhuhr, asr, maghrib, isha].map((v, i) => to24(i, v));
    days[date] = [c[0], c[1], c[2], null, c[3], c[4], c[5]];
  }
  return days;
}

const raw = rawDir();
const central = parse(await pdfText(flag("central"), CENTRAL, "central"));
const hamptons = parse(await pdfText(flag("hamptons"), HAMPTONS, "hamptons"));
const diff = Object.keys(central).filter((d) => JSON.stringify(central[d]) !== JSON.stringify(hamptons[d]));
console.log(`Central ${Object.keys(central).length} days, Hamptons ${Object.keys(hamptons).length} days, ${diff.length} differ`);
for (const d of diff) console.log("  differs", d, central[d].join(","), "|", (hamptons[d] ?? []).join(","));

writeTimetable({
  id: "chelmsford-cms",
  name: "Chelmsford Muslim Society timetable",
  publisher: "Chelmsford Muslim Society",
  sources: [CENTRAL, "https://masjidbox.com/prayer-times/cms-central"],
  zone: "Europe/London",
  place: { lat: 51.7345, lng: 0.4731 },
  corrections: [],
  days: central,
});
