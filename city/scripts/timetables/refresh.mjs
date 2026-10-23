// Usage: node refresh.mjs [--today YYYY-MM-DD]
// Re-runs every timetable script, each in its own process so one unreachable source leaves the others
// to finish, then prints a Markdown report of what each timetable publishes. The scripts' own output
// goes to stderr. Exits 1 when a script failed or a timetable runs out within WARN_DAYS.
//
// A refresh only adds and corrects days. A day the last file had and this run did not return is kept,
// because a source that stops answering (Masjid Umar's site returns nothing to GitHub's runners) must
// not unpublish it. Removing a day takes a person running that timetable's own script.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir, flag, formatTimetable } from "./lib.mjs";

const WARN_DAYS = 30;
const here = dirname(fileURLToPath(import.meta.url));
const self = basename(fileURLToPath(import.meta.url));
const today = flag("today") ?? new Date().toISOString().slice(0, 10);

const ids = readdirSync(here).filter((f) => f.endsWith(".mjs") && f !== "lib.mjs" && f !== self).map((f) => f.slice(0, -4)).sort();

const rows = ids.map((id) => {
  console.error(`=== ${id}`);
  const file = join(dataDir, `${id}.json`);
  const before = readFileSync(file, "utf8");
  const ok = spawnSync(process.execPath, [join(here, `${id}.mjs`)], { stdio: ["ignore", 2, 2] }).status === 0;
  // A script can write its file and then fail, so a failure keeps the last good file.
  if (!ok) writeFileSync(file, before);
  const old = JSON.parse(before);
  const now = ok ? JSON.parse(readFileSync(file, "utf8")) : old;
  const kept = Object.keys(old.days).filter((d) => !(d in now.days));
  for (const d of kept) now.days[d] = old.days[d];
  if (kept.length) writeFileSync(file, formatTimetable(now));
  const through = Object.keys(now.days).sort().at(-1);
  const left = Math.round((Date.parse(through) - Date.parse(today)) / 86400000);
  return { id, ok, kept: kept.length, through, left, attention: !ok || left < WARN_DAYS };
});

console.log(`Timetables on ${today}. A timetable needs attention when its script failed or its published days end within ${WARN_DAYS} days. Until a day is published, its page shows an estimate.\n`);
console.log("| Timetable | Script | Published through | Days left |\n|---|---|---|---|");
for (const r of rows) {
  const mark = (s, on) => (on ? `**${s}**` : s);
  const script = !r.ok ? mark("failed, see the run log", true) : r.kept ? `ok, kept ${r.kept} day${r.kept === 1 ? "" : "s"} it no longer returned` : "ok";
  console.log(`| ${r.id} | ${script} | ${r.through} | ${mark(r.left, r.left < WARN_DAYS)} |`);
}
process.exitCode = rows.some((r) => r.attention) ? 1 : 0;
