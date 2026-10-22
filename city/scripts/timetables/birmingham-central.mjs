import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { finish, iso, localHHMM, pad, postForm, rawDir, request, sleep, to24, toMin } from "./lib.mjs";

const ENDPOINT = "https://centralmosque.org.uk/wp-admin/admin-ajax.php";
const OPENFAJR = "https://calendar.google.com/calendar/ical/qmho4v5896ki2mc5supv0ikgfs%40group.calendar.google.com/public/basic.ics";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = [2025, 2026, 2027];
const ZONE = "Europe/London";
const PLACE = { lat: 52.4798, lng: -1.9031, zone: ZONE };

const raw = rawDir(process.argv);
const clock = (s) => {
  const m = s.match(/(\d{1,2}):(\d\d)\s*([AP]M)/i);
  return m ? to24(m[1], m[2], m[3]) : null;
};

// Columns: date, day, fajr begins, fajr jamat, sunrise, zawal, zuhr begins, zuhr jamat, asr begins, asr jamat, maghrib begins, jamat, isha begins, jamat.
function parseMonth(html) {
  const out = {};
  for (const [, tr] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]*>/g, "").trim());
    const date = cells[0]?.match(/^(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})/);
    if (!date || cells.length < 13) continue;
    const key = iso(+date[3], MONTHS.indexOf(date[2]) + 1, +date[1]);
    const [fajr, sunrise, dhuhr, asr2, maghrib, isha] = [2, 4, 6, 8, 10, 12].map((i) => clock(cells[i]));
    out[key] = [fajr, sunrise, dhuhr, null, asr2, maghrib, isha];
  }
  return out;
}

const days = {};
for (const year of YEARS) {
  for (const month of MONTHS) {
    const html = await postForm(ENDPOINT, { action: "fulltabledata", year, month });
    writeFileSync(join(raw, `${year}-${month}.html`), html);
    const rows = parseMonth(html);
    const n = Object.keys(rows).length;
    console.log(`${year} ${month}: ${n} days`);
    const wrong = Object.keys(rows).filter((d) => !d.startsWith(`${year}-${pad(MONTHS.indexOf(month) + 1)}-`));
    if (wrong.length) throw new Error(`${year} ${month} returned other dates: ${wrong.slice(0, 3)}`);
    Object.assign(days, rows);
    await sleep(1000);
  }
}

const ics = await request(OPENFAJR);
writeFileSync(join(raw, "openfajr.ics"), ics);
const openFajr = {};
for (const [, ev] of ics.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)) {
  if (!/SUMMARY:Fajr/.test(ev)) continue;
  const s = ev.match(/DTSTART:(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/);
  if (!s) continue;
  const at = new Date(Date.UTC(+s[1], +s[2] - 1, +s[3], +s[4], +s[5], +s[6]));
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(at);
  openFajr[local] = localHHMM(at, ZONE);
}

const addDays = (date, n) => new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10);
const offsetMin = (date) => toMin(localHHMM(new Date(`${date}T12:00:00Z`), ZONE)) - 12 * 60;
const utcMin = (hhmm, date) => toMin(hhmm) - offsetMin(date);
const agrees = (date) => days[date] && openFajr[date] === days[date][0];
// Fajr drifts a minute or two a day in UTC, so across a clock change the right value is
// the one whose UTC time sits on the line between the nearest agreeing days either side.
function trend(date) {
  const find = (step) => {
    for (let n = step; Math.abs(n) <= 7; n += step) if (agrees(addDays(date, n))) return n;
  };
  const [before, after] = [find(-1), find(1)];
  if (before === undefined || after === undefined) return null;
  const at = (n) => utcMin(days[addDays(date, n)][0], addDays(date, n));
  return at(before) + ((at(after) - at(before)) * -before) / (after - before);
}
const corrections = [];
let compared = 0;
for (const date of Object.keys(days).sort()) {
  const theirs = days[date][0];
  const ours = openFajr[date];
  if (!ours) continue;
  compared++;
  if (theirs === ours) continue;
  const line = trend(date);
  if (line === null) throw new Error(`no agreeing days around ${date}`);
  const bcmErr = Math.abs(utcMin(theirs, date) - line);
  const openErr = Math.abs(utcMin(ours, date) - line);
  const useBcm = bcmErr <= openErr;
  console.log(`Fajr differs ${date}: BCM ${theirs} (${bcmErr.toFixed(1)} min off trend), OpenFajr ${ours} (${openErr.toFixed(1)} off) -> ${useBcm ? "keep BCM" : "use OpenFajr"}`);
  if (Math.abs(toMin(theirs) - toMin(ours)) !== 60) throw new Error(`${date}: gap is not one hour`);
  if (useBcm) {
    corrections.push({ date, field: "fajr", from: theirs, to: theirs, why: `kept BCM's Fajr; OpenFajr is exactly one hour ${toMin(ours) < toMin(theirs) ? "earlier" : "later"} and is the one off the UTC trend of the days either side (the feed did not follow the clock change)` });
  } else {
    corrections.push({ date, field: "fajr", from: theirs, to: ours, why: "BCM Fajr is an hour off the UTC trend of the days either side; OpenFajr, which BCM otherwise matches, is on it" });
    days[date][0] = ours;
  }
}
const ZUHR_TYPOS = { "2025-03-19": "12:20", "2025-03-20": "12:20" };
for (const [date, to] of Object.entries(ZUHR_TYPOS)) {
  const from = days[date][2];
  corrections.push({ date, field: "dhuhr", from, to, why: "BCM's table prints the wrong hour; Zawal that day is 12:15 and Zuhr begins five minutes after Zawal on the days either side" });
  days[date][2] = to;
}
console.log(`compared ${compared} days with OpenFajr`);

finish({
  id: "birmingham-central",
  name: "Birmingham Central Mosque timetable",
  publisher: "Birmingham Central Mosque",
  sources: ["https://centralmosque.org.uk/timetable", OPENFAJR],
  zone: ZONE,
  place: PLACE,
  corrections,
  days,
});
