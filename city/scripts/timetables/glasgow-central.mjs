import { sleep, hhmm, writeTimetable } from "./lib.mjs";

const url = "https://centralmosque.co.uk/?rest_route=/dpt/v1/prayertime&filter=year";
// The feed ignores year, date and range parameters and serves only 2026.
const rows = (await (await fetch(url)).json()).flat();
await sleep(500);

const days = {};
const corrections = [];
for (const r of rows) {
  const row = [r.fajr_begins, r.sunrise, r.zuhr_begins, r.asr_mithl_1, r.asr_mithl_2, r.maghrib_begins, r.isha_begins].map(hhmm);
  if (row.includes(null)) throw new Error(`bad row ${r.d_date}`);
  days[r.d_date] = row;
}

// 16:02 BST on 24 Oct is 15:02 GMT and the 26th is 14:57, so the 25th lands at 14:59.
const fix = "2026-10-25";
corrections.push({ date: fix, field: "asr2", from: days[fix][4], to: "14:59", why: "feed still in BST after the clock change; the trend from 15:02 (24 Oct, GMT-equivalent) to 14:57 (26 Oct) gives 14:59" });
days[fix][4] = "14:59";

writeTimetable({
  id: "glasgow-central",
  name: "Glasgow Central Mosque timetable",
  publisher: "Glasgow Central Mosque",
  sources: [url],
  zone: "Europe/London",
  site: { lat: 55.861, lng: -4.2488 },
  days,
  corrections,
});
