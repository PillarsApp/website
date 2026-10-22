import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REF_COMMIT = "322d125";
const OLD_BUILD_INSTANT = { hour: 0, minute: 5 };
const DATES = [
  "2026-10-23",
  "2026-10-30", // after the 2026-10-25 clock change, near month end: GMT today, next-month table
];
const cityDir = fileURLToPath(new URL("..", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "city-golden-"));

function reference(date) {
  const tar = join(work, `ref-${date}.tar`);
  execFileSync("git", ["archive", "--format=tar", "-o", tar, REF_COMMIT, "city"], { cwd: join(cityDir, "..") });
  const dir = join(work, `ref-${date}`);
  mkdirSync(dir);
  execFileSync("tar", ["-xf", tar, "-C", dir, "--strip-components=1"]);
  symlinkSync(join(cityDir, "node_modules"), join(dir, "node_modules"));
  const script = join(dir, "build.mjs");
  writeFileSync(script, readFileSync(script, "utf8").replace("execFileSync('npx'", "(() => {})('npx'"));
  const { MASJID_TIMES_SECRET, PROD, ...env } = process.env;
  execFileSync("node", [script, "--date", date], { cwd: dir, env, stdio: ["ignore", "ignore", "ignore"] });
  return readFileSync(join(dir, "index.html"), "utf8");
}

async function loadCandidate() {
  const bundled = await build({
    stdin: {
      contents: `
        import { renderCityPage } from "./src/render/page.ts";
        import { cityClock } from "./src/render/times.ts";
        import { linksFor } from "./src/routes.ts";
        import { CITIES, COUNTRIES } from "./src/cities.ts";
        import { FOUR_MOSQUES } from "./test/mosque-fixtures.ts";
        export function run(date) {
          const city = CITIES[0], country = COUNTRIES[city.country];
          const now = cityClock(city, country).localInstant(date, ${OLD_BUILD_INSTANT.hour}, ${OLD_BUILD_INSTANT.minute});
          return renderCityPage({ city, country, date, now, mosques: { ...FOUR_MOSQUES, date }, links: linksFor(city, []), audience: "public" }).html;
        }`,
      resolveDir: cityDir,
      loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "warning",
    loader: { ".html": "text", ".css": "text" },
  });
  const file = join(work, "candidate.mjs");
  writeFileSync(file, bundled.outputFiles[0].text);
  const { run } = await import(pathToFileURL(file).href);
  return run;
}

const INTENDED = [
  ["old asset paths were relative; the Worker serves them under /prayer-times/_/",
    [/(?:\.\.\/)?assets\/fonts\//g, "/prayer-times/_/fonts/"],
    [/src="assets\/tree_two\.png"/g, 'src="/prayer-times/_/tree_two.png"'],
    [/src="vendor\/adhan-4\.4\.3\.umd\.min\.js"/g, 'src="/prayer-times/_/adhan-4.4.3.umd.min.js"'],
    [/<link rel="icon"[^>]*>/g, '<link rel="icon" href="ICON">'],
  ],
  ["client bundle is content-hashed in its filename instead of ?v=",
    [/src="city\.min\.js\?v=[0-9a-f]+"/g, 'src="CLIENT"'],
    [/src="\/prayer-times\/_\/city\.[0-9a-f]+\.js"/g, 'src="CLIENT"'],
  ],
  ["Organization @id is the homepage's #org, logo is the Webflow CDN copy",
    [/https:\/\/thepillarsapp\.com\/#organization/g, "ORG"],
    [/https:\/\/thepillarsapp\.com\/#org\b/g, "ORG"],
    [/"logo": "[^"]*"/g, '"logo": "LOGO"'],
  ],
  ["provisional-URL and provisional-href comments are gone",
    [/^<!-- PROVISIONAL[^\n]*\n/gm, ""],
    [/^\s*<!-- PROVISIONAL[^\n]*\n/gm, ""],
  ],
  ["mosque names are plain text: no /mosques/ link and no url in the ItemList or #city-data",
    [/<h3><a href="[^"]*">([^<]*)<\/a><\/h3>/g, "<h3>$1</h3>"],
    [/^\s*"url": "https:\/\/thepillarsapp\.com\/mosques\/[^\n]*\n/gm, ""],
  ],
  ["the placeholder note and mosquesPlaceholder flag no longer exist",
    [/\n\s*<p class="note">Placeholder mosques[^\n]*<\/p>/g, ""],
    [/^\s*"mosquesPlaceholder": (?:true|false),\n/gm, ""],
  ],
  ["the widget iframe and embed code point at the per-city widget",
    [/src="widget\/\?city=london"/g, 'src="WIDGET"'],
    [/src="\/prayer-times\/uk\/london\/widget\/"/g, 'src="WIDGET"'],
    [/https:\/\/thepillarsapp\.com\/prayer-times\/widget\/\?city=london/g, "WIDGET-ABS"],
    [/&quot;https:\/\/thepillarsapp\.com\/prayer-times\/uk\/london\/widget\/&quot;/g, "&quot;WIDGET-ABS&quot;"],
  ],
  ["no nearby card while London is the only UK city",
    [/\n\s*<div class="card">\s*<h2><svg[^>]*><path[^>]*\/><\/svg>Prayer Times Near London<\/h2>[\s\S]*?<\/div>(?=\s*<\/section>)/, ""],
  ],
  ["the Updated line states the render date and no longer carries data-today-date",
    [/<time datetime="([^"]*)" data-today-date>/g, '<time datetime="$1">'],
  ],
  ["the <html> tag, preloads, CSS, list opening and scripts are regions now (their markers stay in the output), and the template's region comment names the new owner",
    [/^[ \t]*<!-- \/?build:(?:html|preload|css|list-open|scripts) -->\n/gm, ""],
    [/^[ \t]+(<ul class="list")/gm, "$1"],
    [/^<!-- (?:Generated regions|Regions) \(build:NAME\)[^\n]*\n/gm, ""],
  ],
  ["the production Worker page carries the homepage's analytics snippet (page/analytics.html), which the old build never did",
    [/<!-- build:analytics -->[\s\S]*?<!-- \/build:analytics -->\n/, ""],
  ],
  ["the old build emitted the mosque ItemList only for real mosques, and its reference run had placeholders; the Worker's ItemList for fixture mosques is asserted in test/page.test.ts",
    [/(<script type="application\/ld\+json">\n)([\s\S]*?)(\n<\/script>)/, (_, open, json, close) => {
      const ld = JSON.parse(json);
      ld["@graph"] = ld["@graph"].filter((n) => n["@type"] !== "ItemList");
      return open + JSON.stringify(ld, null, 2) + close;
    }],
  ],
  ["time-zone copy says \"London local time\", not \"United Kingdom local time\", because a country can span several time zones",
    [/United Kingdom local time/g, "London local time"],
  ],
  ["#city-data carries the country's lang so the client names the zone in the same locale as the server",
    [/^\s*"lang": "[^"]*",\n/gm, ""],
  ],
  ["whitespace between regions",
    [/[ \t]+$/gm, ""],
    [/\n{2,}/g, "\n"],
  ],
];

function normalize(html) {
  let out = html;
  for (const [, ...rules] of INTENDED) for (const [re, to] of rules) out = out.replace(re, to);
  return out;
}

const raw = process.argv.includes("--raw");
const render = await loadCandidate();
let failed = 0;
for (const date of DATES) {
  const a = join(work, `reference-${date}.html`);
  const b = join(work, `candidate-${date}.html`);
  const ref = reference(date), cand = render(date);
  writeFileSync(a, raw ? ref : normalize(ref));
  writeFileSync(b, raw ? cand : normalize(cand));
  let diff = "";
  try {
    execFileSync("diff", ["-u", a, b], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.status !== 1) throw e;
    diff = e.stdout;
  }
  console.log(`${date}: reference ${a}, candidate ${b}`);
  if (diff) {
    console.log(diff);
    console.log(`${date}: ${(diff.match(/^@@/gm) ?? []).length} hunk(s) remain`);
    failed++;
  } else {
    console.log(`${date}: identical after the intended deltas`);
  }
}
if (failed) process.exit(1);
console.log("intended deltas:");
for (const [why] of INTENDED) console.log(`  - ${why}`);
