import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getText, isoDate, pad, postForm, rawDir, writeTimetable } from "./lib.mjs";

const PAGE = "https://manchestercentralmosque.org/prayer-times/";
const ENDPOINT = "https://manchestercentralmosque.org/wp-admin/admin-ajax.php";
const ZONE = "Europe/London";
const PLACE = { lat: 53.4792, lng: -2.2444, zone: ZONE };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const YEARS = [2025, 2026, 2027];

// Labels the page's dropdown does not offer (as of 2026-10-22) but a later run may find populated.
const PROBES = ["Dec 2025", "December 2025", "Feb 2025", "February 2025", "Dec 2026", "Nov 2026", ...MONTHS.map((m) => `${m[0]}${m.slice(1).toLowerCase()} 2027`)];

const raw = rawDir();
const text = (html) => html.replace(/<[^>]*>/g, "").replace(/\ufeff/g, "").trim();

const page = await getText(PAGE);
writeFileSync(join(raw, "prayer-times.html"), page);
const offered = [...page.matchAll(/data-id="([^"]*)"/g)].map((m) => m[1]);
const wanted = (label) => YEARS.some((y) => label.includes(y)) || /(?:^|\s)(25|26|27)$/.test(label);
const labels = [...new Set([...offered.filter(wanted), ...PROBES])];
console.log(`offered: ${offered.filter(wanted).join(", ")}`);

// The table prints no year, so the label's year is confirmed by weekday names matching the calendar.
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const yearFor = (month, rows) =>
  YEARS.filter((y) => rows.every(([d, dow]) => DOW[new Date(Date.UTC(y, month, d)).getUTCDay()] === dow));

// Start times print as "5.13" with no AM/PM. Fajr and sunrise are morning; zawal/Zuhr straddle noon.
// The sheet is a spreadsheet export that drops a trailing zero ("2.2" is 2:20).
let truncated = 0;
function clock(raw, kind) {
  const m = raw.match(/^(\d{1,2})[.:](\d{1,2})$/);
  if (!m) return null;
  if (m[2].length === 1) truncated++;
  let h = Number(m[1]);
  if (kind === "am") h %= 12;
  else if (kind === "noon") h = h >= 6 && h <= 11 ? h : (h % 12) + 12;
  else h = (h % 12) + 12;
  return `${pad(h)}:${m[2].padEnd(2, "0")}`;
}

function parse(html) {
  const rows = [];
  let cols = null;
  const at = (cells, ...names) => names.map((n) => cells.indexOf(n)).find((i) => i >= 0);
  for (const [, tr] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]));
    if (cells.includes("FAJR") && at(cells, "SUNRISE", "SUN RISE") !== undefined) {
      cols = {
        fajr: at(cells, "FAJR"),
        sunrise: at(cells, "SUNRISE", "SUN RISE"),
        dhuhr: at(cells, "ZUHR"),
        asr2: at(cells, "ASR"),
        maghrib: at(cells, "SUNSET", "SUN SET"),
        isha: at(cells, "ISHA"),
        heading: cells[0],
      };
      continue;
    }
    if (!cols || !/^\d{1,2}$/.test(cells[0]) || !DOW.includes(cells[1])) continue;
    const t = (k, kind) => clock(cells[cols[k]], kind);
    rows.push([Number(cells[0]), cells[1], [t("fajr", "am"), t("sunrise", "am"), t("dhuhr", "noon"), null, t("asr2", "pm"), t("maghrib", "pm"), t("isha", "pm")]]);
  }
  return { heading: cols?.heading, rows };
}

const days = {};
for (const label of labels) {
  const html = await postForm(ENDPOINT, { action: "mcm_get_month_file", current_file: label });
  writeFileSync(join(raw, `${label.replace(/\W+/g, "_")}.html`), html);
  const { heading, rows } = parse(html);
  if (!rows.length) {
    console.log(`${label}: no table`);
    continue;
  }
  const monthIndex = MONTHS.indexOf(label.slice(0, 3).toUpperCase());
  const headingMonth = MONTHS.indexOf(heading?.slice(0, 3));
  const years = monthIndex < 0 ? [] : yearFor(monthIndex, rows.map((r) => r.slice(0, 2)));
  if (years.length !== 1 || (headingMonth >= 0 && headingMonth !== monthIndex)) {
    console.log(`${label}: skipped, heading ${heading}, weekday-consistent years ${years}`);
    continue;
  }
  const inMonth = new Date(Date.UTC(years[0], monthIndex + 1, 0)).getUTCDate();
  if (rows.length !== inMonth) console.log(`${label}: ${rows.length} rows for a ${inMonth}-day month`);
  for (const [d, , row] of rows) {
    if (row.filter((v) => v === null).length > 1) console.log(`${label}: day ${d} has an unreadable time, left out`);
    else days[isoDate(years[0], monthIndex + 1, d)] = row;
  }
  console.log(`${label} -> ${MONTHS[monthIndex]} ${years[0]} (${rows.length} rows)`);
}
console.log(`cells with a one-digit minute read as tens: ${truncated}`);

// Left out because the sheet's own neighbouring days show the printed value is a typo and the intended minute is not recoverable.
const LEFT_OUT = { "2026-01-17": "Isha prints 6.00 where the days either side print 6.28 and 6.31" };
for (const [date, why] of Object.entries(LEFT_OUT)) {
  delete days[date];
  console.log(`left out ${date}: ${why}`);
}

writeTimetable({
  id: "manchester-central",
  name: "Manchester Central Mosque timetable",
  publisher: "Manchester Central Mosque (Victoria Park)",
  sources: [PAGE, ENDPOINT],
  zone: ZONE,
  place: PLACE,
  corrections: [],
  days,
});
