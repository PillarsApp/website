// Usage: node watford-central.mjs
// Expands watford-central.blocks.json (hand transcription of the mosque's perpetual
// 3-day-block timetable) into every day of 2026 and 2027.
//
// The sheet is in local clock time with BST from the 28-31 March block to the 22-24 October block. The
// printed Fajr, Sunrise, Zuhr and Maghrib then sit one hour later than the UTC-based winter values, which
// the check below confirms against calculation. Real clock changes fall on other days (29 Mar and 25 Oct
// 2026, 28 Mar and 31 Oct 2027), so days where the sheet's offset differs from the real one are shifted
// by the difference and recorded as corrections.
import { readFileSync } from "node:fs";
import { COLUMNS, calculated, fromMin, isoDate, toMin, writeTimetable } from "./lib.mjs";

const PLACE = { lat: 51.6696, lng: -0.4106 };
const ZONE = "Europe/London";
const blocks = JSON.parse(readFileSync(new URL("./watford-central.blocks.json", import.meta.url), "utf8")).months;

// Printed times have no am/pm: Fajr and Sunrise are morning, Zuhr is 11.xx or 12.xx (noon) before the
// clocks go forward and 1.xx after, Asr, Maghrib and Isha are afternoon or evening.
function minutes(col, text) {
  const [h, m] = text.split(".").map(Number);
  const hh = col < 2 || (col === 2 && h >= 11) ? h : h === 12 ? 12 : h + 12;
  return hh * 60 + m;
}

function sheetIsBst(month, firstDay) {
  const key = month * 100 + firstDay;
  return key >= 328 && key < 1025;
}

function zoneOffsetMin(iso) {
  const part = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${iso}T12:00:00Z`)).find((p) => p.type === "timeZoneName").value;
  return part === "GMT" ? 0 : Number(part.slice(3)) * 60;
}

// Each block row, in minutes on the sheet's own clock, plus the offset the sheet used for it.
const rowsByMonthDay = new Map();
for (const [mm, rows] of Object.entries(blocks)) {
  const month = Number(mm);
  for (const [range, ...t] of rows) {
    const [a, b] = range.split(/[-/]/).map(Number);
    const m = [minutes(0, t[0]), minutes(1, t[1]), minutes(2, t[2]), minutes(3, t[3]), minutes(4, t[4]), minutes(5, t[5])];
    const offset = sheetIsBst(month, a) ? 60 : 0;
    for (let d = a; d <= b; d++) rowsByMonthDay.set(month * 100 + d, { m, offset, range });
  }
}

// The sheet's offset claim must agree with calculation: sunrise within 20 min of the adhan sunrise on the
// sheet's own clock for a non-leap year's days.
for (const [key, { m, offset }] of rowsByMonthDay) {
  const iso = isoDate(2026, Math.floor(key / 100), key % 100);
  const calcSunrise = toMin(calculated(iso, { ...PLACE, zone: ZONE }).sunrise) - zoneOffsetMin(iso) + offset;
  if (Math.abs(m[1] - calcSunrise) > 20) throw new Error(`${iso}: sheet sunrise ${fromMin(m[1])} does not fit offset ${offset}`);
}

const days = {};
const corrections = [];
for (const year of [2026, 2027]) {
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d = new Date(d.getTime() + 86400000)) {
    const iso = d.toISOString().slice(0, 10);
    const key = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    const row = rowsByMonthDay.get(key);
    if (!row) { console.log("no sheet row for", iso); continue; }
    const shift = zoneOffsetMin(iso) - row.offset;
    const sheet = [row.m[0], row.m[1], row.m[2], null, row.m[3], row.m[4], row.m[5]];
    const out = sheet.map((v) => (v === null ? null : fromMin(v + shift)));
    const published = sheet.map((v) => (v === null ? null : fromMin(v)));
    if (shift !== 0) {
      COLUMNS.forEach((field, i) => {
        if (out[i] !== null) corrections.push({ date: iso, field, from: published[i], to: out[i], why: `sheet block ${row.range} is on ${row.offset ? "BST" : "GMT"} but the clocks ${shift > 0 ? "had gone forward" : "had not yet gone forward"} on this date; shifted ${shift > 0 ? "+" : ""}${shift} minutes` });
      });
    }
    days[iso] = out;
  }
}

writeTimetable({
  id: "watford-central",
  name: "Watford Permanent Prayer Timetable",
  publisher: "Watford Central Mosque",
  sources: [
    "https://static.wixstatic.com/media/37c74e_03e68708aa73459eb815b8fb75dd8f54~mv2.jpeg",
    "https://www.watfordmosque.org.uk/prayer-timetable",
  ],
  zone: ZONE,
  place: PLACE,
  corrections,
  days,
});
