import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getText, isoDate, rawDir, writeTimetable } from "./lib.mjs";

const ENDPOINT = "https://www.coms.org.uk/wp-admin/admin-ajax.php";
const PAGE = "https://www.coms.org.uk/salah-times/";
const ZONE = "Europe/London";
const PLACE = { lat: 51.752, lng: -1.2578, zone: ZONE };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const raw = rawDir();
const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// The endpoint ignores a year parameter (year, yr, y, Year all return the current year), so only this year is available.
// Columns: date, day, fajr begins, jamaat, sunrise, zuhr begins, jamaat, asr begins, jamaat, maghrib begins, jamaat, isha begins, jamaat.
function parse(html, expectMonth) {
  const out = {};
  for (const [, tr] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]));
    const date = cells[0]?.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (!date || cells.length < 13) continue;
    const month = MONTHS.indexOf(date[2]) + 1;
    if (month !== expectMonth) throw new Error(`month ${expectMonth} returned ${cells[0]}`);
    const [fajr, sunrise, dhuhr, asr2, maghrib, isha] = [2, 4, 5, 7, 9, 11].map((i) => cells[i]);
    out[isoDate(+date[3], month, +date[1])] = [fajr, sunrise, dhuhr, null, asr2, maghrib, isha];
  }
  return out;
}

const header = await getText(PAGE);
writeFileSync(join(raw, "salah-times.html"), header);

const days = {};
for (let month = 1; month <= 12; month++) {
  const html = await getText(`${ENDPOINT}?action=get_monthly_timetable&month=${month}`);
  writeFileSync(join(raw, `month-${month}.html`), html);
  const rows = parse(html, month);
  console.log(`month ${month}: ${Object.keys(rows).length} days`);
  Object.assign(days, rows);
}

// Left out because the printed value is a typo and the intended minute is not recoverable from the neighbouring days.
const LEFT_OUT = { "2026-10-28": "Fajr prints 00:00 where the days either side print 04:57 and 05:00" };
for (const [date, why] of Object.entries(LEFT_OUT)) {
  if (days[date]?.[0] !== "00:00") throw new Error(`${date} no longer has the typo; review LEFT_OUT`);
  delete days[date];
  console.log(`left out ${date}: ${why}`);
}

writeTimetable({
  id: "oxford-coms",
  name: "Central Oxford Mosque timetable",
  publisher: "Central Oxford Mosque Society",
  sources: [PAGE, `${ENDPOINT}?action=get_monthly_timetable&month=N`],
  zone: ZONE,
  place: PLACE,
  corrections: [],
  days,
});
