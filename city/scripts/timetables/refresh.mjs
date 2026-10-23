// Usage: node refresh.mjs [--today YYYY-MM-DD]
// Re-runs every timetable script, each in its own process so one unreachable source leaves the others
// to finish, then prints a Markdown report of what each timetable publishes. The scripts' own output
// goes to stderr. Exits 1 when a script failed or a timetable runs out within WARN_DAYS.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir, flag } from "./lib.mjs";

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
  const through = Object.keys(JSON.parse(ok ? readFileSync(file, "utf8") : before).days).at(-1);
  const left = Math.round((Date.parse(through) - Date.parse(today)) / 86400000);
  return { id, ok, through, left, attention: !ok || left < WARN_DAYS };
});

console.log(`Timetables on ${today}. A timetable needs attention when its script failed or its published days end within ${WARN_DAYS} days. Until a day is published, its page shows an estimate.\n`);
console.log("| Timetable | Script | Published through | Days left |\n|---|---|---|---|");
for (const r of rows) {
  const mark = (s, on) => (on ? `**${s}**` : s);
  console.log(`| ${r.id} | ${mark(r.ok ? "ok" : "failed, see the run log", !r.ok)} | ${r.through} | ${mark(r.left, r.left < WARN_DAYS)} |`);
}
process.exitCode = rows.some((r) => r.attention) ? 1 : 0;
