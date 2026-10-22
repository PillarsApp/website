// Usage: node london-unified.mjs [--api2026 file.json] [--xlsx2027 file.xlsx] [--xlsx2026 file.xlsx]
// Without --api2026 it calls londonprayertimes.com with LONDON_PRAYER_TIMES_KEY. Without the xlsx
// paths it downloads them from londonsalahtimes.com.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { finish, scratch } from "./lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const LAT = 51.5072, LNG = -0.1276;

const XLSX_PY = String.raw`
import sys, zipfile, re
import xml.etree.ElementTree as ET
ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
z = zipfile.ZipFile(sys.argv[1])
wb = ET.fromstring(z.read("xl/workbook.xml"))
rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
sheets = {s.get("name"): rels[s.get("{%s}id" % ns["r"])] for s in wb.find("m:sheets", ns)}
# The 2026 workbook has one sheet whose PM times are stored as 12-hour fractions.
twelve = "24-hr format" not in sheets
target = sheets["24-hr format"] if not twelve else next(iter(sheets.values()))
path = "xl/" + target.lstrip("/").removeprefix("xl/")
root = ET.fromstring(z.read(path))
cols = "DEFGHIJ"
for row in root.find("m:sheetData", ns):
    cells = {re.match(r"[A-Z]+", c.get("r")).group(): c for c in row}
    b = cells.get("B")
    if b is None or b.get("t") == "s" or b.find("m:v", ns) is None: continue
    serial = int(float(b.find("m:v", ns).text))
    out = []
    for col in cols:
        c = cells.get(col)
        v = None if c is None else c.find("m:v", ns)
        if v is None or c.get("t") == "s": out.append("")
        else:
            mins = round(float(v.text) * 1440)
            if twelve and ((col == "F" and mins < 360) or (col in "GHIJ" and mins < 720)): mins += 720
            out.append("%02d:%02d" % (mins // 60, mins % 60))
    print(serial, *out)
`;

function parseXlsx(path) {
  const r = spawnSync("python3", ["-I", "-c", XLSX_PY, path], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  const days = {};
  for (const line of r.stdout.trim().split("\n")) {
    const [serial, ...t] = line.split(" ");
    const iso = new Date(Date.UTC(1899, 11, 30) + Number(serial) * 86400000).toISOString().slice(0, 10);
    days[iso] = t.map((x) => x || null);
  }
  return days;
}

async function xlsxFor(year, given, dir) {
  if (given) return parseXlsx(given);
  const res = await fetch(`https://londonsalahtimes.com/downloads/LUPT-${year}.xlsx`);
  if (!res.ok) throw new Error(`LUPT-${year}.xlsx: ${res.status}`);
  const p = join(dir, `LUPT-${year}.xlsx`);
  writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  return parseXlsx(p);
}

async function apiTimes() {
  let j;
  if (args.api2026) j = JSON.parse(readFileSync(args.api2026, "utf8"));
  else {
    const key = process.env.LONDON_PRAYER_TIMES_KEY;
    if (!key) throw new Error("pass --api2026 <file> or set LONDON_PRAYER_TIMES_KEY");
    const res = await fetch(`https://www.londonprayertimes.com/api/times/?format=json&24hours=true&year=2026&key=${key}`);
    if (!res.ok) throw new Error(`api: ${res.status}`);
    j = await res.json();
  }
  return Object.fromEntries(
    Object.entries(j.times).map(([d, t]) => [d, [t.fajr, t.sunrise, t.dhuhr, t.asr, t.asr_2, t.magrib, t.isha]]),
  );
}

const dir = scratch("lupt");
const api = await apiTimes();
const x2027 = await xlsxFor(2027, args.xlsx2027, dir);
const x2026 = await xlsxFor(2026, args.xlsx2026, dir);

const same = Object.keys(api).filter((d) => x2026[d] && api[d].every((v, i) => v === x2026[d][i])).length;
console.log(`2026 API vs LUPT-2026.xlsx: ${same} of ${Object.keys(api).length} days match exactly`);
for (const d of Object.keys(api)) {
  const x = x2026[d];
  if (!x) console.log("  missing in xlsx", d);
  else if (api[d].some((v, i) => v !== x[i])) console.log("  differs", d, "api", api[d].join(","), "xlsx", x.join(","));
}

const days = {};
for (const [d, v] of Object.entries(api)) if (d.startsWith("2026-")) days[d] = v;
for (const [d, v] of Object.entries(x2027)) if (d.startsWith("2027-")) days[d] = v;

finish({
  lat: LAT,
  lng: LNG,
  days,
  meta: {
    id: "london-unified",
    name: "London Unified Prayer Timetable",
    publisher: "East London Mosque / London Salah Times",
    sources: [
      "https://www.londonprayertimes.com/api/times/?format=json&24hours=true&year=2026",
      "https://londonsalahtimes.com/downloads/LUPT-2027.xlsx",
    ],
    retrieved: "2026-10-22",
    zone: "Europe/London",
    corrections: [],
  },
});
