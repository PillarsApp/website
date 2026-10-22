import { COLUMNS, fromMin, getJson, getText, hhmm, isoDate, toMin, writeTimetable } from "./lib.mjs";

const hanfiaUrl = "https://www.jamiamasjidhanfia.co.uk/";
const jamiyatUrl = "https://www.jamiyat.org/?rest_route=/dpt/v1/prayertime&filter=month";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const html = await getText(hanfiaUrl);
const jamiyat = (await getJson(jamiyatUrl)).flat();

// Hanfia's `ds` is its own dhuhr, 3 minutes after the anchor's feed, and it has no sunrise column; both stay null unless the anchor's feed supplies them.
const days = {};
for (const m of html.matchAll(/\{"d":"[^{}]*\}/g)) {
  const o = JSON.parse(m[0]);
  const [dd, mon, yyyy] = o.d.split(" ");
  days[isoDate(yyyy, MONTHS.indexOf(mon) + 1, dd)] = [o.fs, null, null, null, o.as, o.ms, o.is].map((v) => (v === null ? null : hhmm(v)));
}
const hanfiaDays = Object.keys(days).length;
if (hanfiaDays < 365) throw new Error(`Hanfia homepage gave ${hanfiaDays} days`);

// The anchor's own feed wins wherever it has a day.
for (const r of jamiyat) {
  days[r.d_date] = [r.fajr_begins, r.sunrise, r.zuhr_begins, null, r.asr_mithl_2, r.maghrib_begins, r.isha_begins].map((v) => (v === null ? null : hhmm(v)));
}

// The anchor's feed stays on BST for 25 to 31 Oct 2026, and Hanfia is one day late (it first shows GMT on 26 Oct).
const CLOCK_CHANGE = "2026-10-25";
const corrections = [];
const jamiyatDates = new Set(jamiyat.map((r) => r.d_date));
for (const date of Object.keys(days)) {
  if (date < CLOCK_CHANGE || date > "2026-10-31") continue;
  const lateFeed = jamiyatDates.has(date);
  const lateHanfia = date === CLOCK_CHANGE;
  if (!lateFeed && !lateHanfia) continue;
  const row = days[date];
  row.forEach((v, i) => {
    if (v === null) return;
    const to = fromMin(toMin(v) - 60);
    corrections.push({ date, field: COLUMNS[i], from: v, to, why: lateFeed ? "jamiyat.org feed still in BST after the clock change" : "Hanfia switches to GMT one day late" });
    row[i] = to;
  });
}

// filter=year serves a single 2027-01-01 row whose sunrise is 09:25 (BST-shifted) and Hanafi Asr 30 minutes late, so it is not ingested.
writeTimetable({
  id: "bradford-central",
  name: "Bradford Central Mosque timetable",
  publisher: "Bradford Central Mosque (Jamiyat Tabligh-ul-Islam)",
  sources: [hanfiaUrl, jamiyatUrl],
  zone: "Europe/London",
  place: { lat: 53.7924, lng: -1.7534 },
  days,
  corrections,
});
