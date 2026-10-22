import template from "../../page/template.html";
import cssSource from "../../page/city.css";
import { SITE } from "../cities";
import type { LocalDate, Mosque, MosqueSection, PageInput, PageLinks, PrayerKey, Rendered } from "../types";
import { cityClock, PRAYERS, type CityClock, type DayTimes } from "./times";
import { esc, fillRegions, jsonInScript, minifyCss, plainText, titleHeadings } from "./html";
import { icon } from "./icons";
import { analyticsFor } from "./analytics";

const CSS = minifyCss(cssSource);

export const UNAVAILABLE_RETRY_MS = 10 * 60 * 1000;

export type TemplateRegion =
  | "html" | "head" | "css" | "preload" | "chip" | "date" | "list-open" | "list" | "caption" | "seo" | "banner" | "scripts" | "analytics";

export function renderCityPage(input: PageInput): Rendered {
  const clock = cityClock(input.city, input.country);
  const html = fillRegions(template, regions(input, clock));
  const midnight = clock.nextMidnight(input.now);
  const freshUntil =
    input.mosques.kind === "unavailable" && (input.mosques.reason === "timeout" || input.mosques.reason === "error")
      ? Math.min(midnight, input.now + UNAVAILABLE_RETRY_MS)
      : midnight;
  return { html, freshUntil };
}

interface View {
  readonly input: PageInput;
  readonly clock: CityClock;
  readonly today: DayTimes;
  readonly methodName: string;
  readonly faq: readonly Faq[];
}

interface Faq {
  readonly question: string;
  readonly answerHtml: string;
}

function regions(input: PageInput, clock: CityClock): Record<TemplateRegion, string> {
  const today = clock.day(input.date);
  const view: View = { input, clock, today, methodName: clock.calc.methodLabel, faq: faqList(input, clock, today) };
  const { city, links } = input;
  return {
    html: `<html lang="${input.country.lang}">`,
    head: head(view),
    css: `<style id="city-css">${CSS}</style>`,
    preload: preloadFonts(links),
    chip: `<span class="chip-name" id="chip-name">${esc(city.name)} Prayer Times</span>`,
    date: `<div class="date-greg" id="date-greg">${clock.appDate(input.date)}</div>
        <div class="date-hijri" id="date-hijri">${clock.hijri(input.date).long}</div>`,
    "list-open": `<ul class="list" id="list" aria-label="${esc(city.name)} prayer times today">`,
    list: replicaList(clock, today),
    caption: listCaption(view),
    seo: titleHeadings(seoSection(view)),
    banner: `<span class="ab-title" id="ab-title">${SITE.name} App: ${esc(city.name)} Prayer Times</span>`,
    scripts: `<script src="${links.assets}/adhan-4.4.3.umd.min.js"></script>\n<script src="${links.clientScript}"></script>`,
    analytics: analyticsFor(input.audience),
  };
}

function timesText(clock: CityClock, today: DayTimes): string {
  return PRAYERS.map((p, i) => `${p.name} ${clock.time(today.t[i])}${i === 3 ? ` (Hanafi ${clock.time(today.asrHanafi)})` : ""}`).join(", ");
}

function head(view: View): string {
  const { input, clock, today } = view;
  const { city, country, date, links, mosques } = input;
  const url = links.canonical;
  const hubUrl = SITE.origin + links.hub;
  const countryUrl = SITE.origin + links.country;
  const title = `${city.name} Prayer Times Today – Salah Times, Fajr to Isha | ${SITE.name}`;
  const description = `${city.name} prayer times today, ${clock.longDate(date)}: ${timesText(clock, today)}. Monthly timetable and calculation method.`;
  const qibla = clock.qibla();
  const live = mosques.kind === "live" ? mosques : null;

  const graph: unknown[] = [
    { "@type": "Organization", "@id": SITE.organizationId, name: SITE.name, url: `${SITE.origin}/`, logo: links.logo },
    {
      "@type": "WebPage", "@id": `${url}#webpage`, url, name: title, description,
      inLanguage: country.lang, datePublished: city.datePublished, dateModified: clock.isoLocal(input.now),
      publisher: { "@id": SITE.organizationId },
      breadcrumb: { "@id": `${url}#breadcrumb` },
      about: {
        "@type": "City", name: city.name,
        geo: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng },
        containedInPlace: { "@type": "Country", name: country.name },
      },
    },
    {
      "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Prayer Times", item: hubUrl },
        { "@type": "ListItem", position: 2, name: country.name, item: countryUrl },
        { "@type": "ListItem", position: 3, name: city.name, item: url },
      ],
    },
  ];
  if (live && live.mosques.length) {
    graph.push({
      "@type": "ItemList", "@id": `${url}#mosques`, name: `Mosques in ${city.name}`,
      itemListElement: live.mosques.map((m, i) => ({
        "@type": "ListItem", position: i + 1,
        item: {
          "@type": "Mosque", name: m.name,
          address: { "@type": "PostalAddress", streetAddress: m.address ?? "", ...(m.postcode ? { postalCode: m.postcode } : {}), addressLocality: city.name, addressCountry: country.code },
        },
      })),
    });
  }
  graph.push({
    "@type": "FAQPage", "@id": `${url}#faq`,
    mainEntity: view.faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: plainText(f.answerHtml) } })),
  });

  const cityData = {
    name: city.name, place: `${city.name}, ${country.short}`, country: country.code, clock: country.clock,
    lat: city.lat, lng: city.lng, timezone: city.timezone,
    method: clock.calc.method, madhab: clock.calc.madhab, highLatitudeRule: clock.calc.highLatitudeRule,
    url, qibla,
    ...(live ? { mosquesDate: live.date, mosques: live.mosques.map((m) => ({ name: m.name, address: m.address, athan: m.athan, iqamah: m.iqamah, jummah: m.jummah })) } : {}),
  };
  const robots = input.audience === "public" ? "" : `<meta name="robots" content="noindex">\n`;

  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${robots}<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:locale" content="${country.lang.replace("-", "_")}">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(`${city.name} Prayer Times Today`)}">
<meta property="og:description" content="${esc(description)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(`${city.name} Prayer Times Today`)}">
<meta name="twitter:description" content="${esc(description)}">
<script id="city-data" type="application/json">
${jsonInScript(cityData)}
</script>
<script type="application/ld+json">
${jsonInScript({ "@context": "https://schema.org", "@graph": graph })}
</script>`;
}

function preloadFonts(links: PageLinks): string {
  return ["500", "400"]
    .map((w) => `<link rel="preload" href="${links.assets}/fonts/poppins-${w}-latin.woff2" as="font" type="font/woff2" crossorigin>`)
    .join("\n");
}

const ASR_TOGGLE = '<span class="asr-toggle" role="group" aria-label="Asr time"><span class="asr-thumb" aria-hidden="true"></span><button type="button" class="asr-opt" data-asr="earlier" aria-pressed="true">Earlier</button><button type="button" class="asr-opt" data-asr="later" aria-pressed="false">Later</button></span>';

function replicaList(clock: CityClock, today: DayTimes): string {
  let list = '<li class="sep" aria-hidden="true"></li>';
  PRAYERS.forEach((p, i) => {
    const name = i === 3 ? `Asr ${ASR_TOGGLE}` : p.name;
    list += `<li class="row"><span class="name">${name}</span> <span class="t">${clock.time(today.t[i])}</span></li><li class="sep" aria-hidden="true"></li>`;
  });
  return list;
}

const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;

function listCaption({ input, clock, today, methodName }: View): string {
  const { city } = input;
  const c = clock.calc;
  const angles = c.fajrAngle === c.ishaAngle ? `Fajr &amp; Isha ${c.fajrAngle}°` : `Fajr ${c.fajrAngle}° · Isha ${c.ishaAngle}°`;
  const text = city.listCaption
    ? esc(city.listCaption)
    : `Based on ${esc(city.coordinatesLabel ?? city.name)} (${deg(city.lat, "N", "S")}, ${deg(city.lng, "E", "W")}) · ${methodName} · ${angles} · <span data-tz-name>${clock.zoneLong(today.t[2])} (${clock.zoneAbbr(today.t[2])})</span>`;
  return `<p class="list-caption" id="list-caption">${text}</p>`;
}

const HANAFI_ASR = 6;
const EARTH_AXIAL_TILT_DEG = 23.44;

const todaySpan = (clock: CityClock, today: DayTimes, i: number) =>
  `<span data-today="${i}">${clock.time(i === HANAFI_ASR ? today.asrHanafi : today.t[i])}</span>`;

function faqList(input: PageInput, clock: CityClock, today: DayTimes): readonly Faq[] {
  const { city, country, date } = input;
  const name = city.name;
  const methodName = clock.calc.methodLabel;
  const c = clock.calc;
  const lt = city.localTimetable;
  const td = (i: number) => todaySpan(clock, today, i);
  const fmt = (ms: number) => clock.time(ms);
  const raw = (question: string, answerHtml: string): Faq => ({ question, answerHtml });
  const text = (question: string, answer: string): Faq => ({ question, answerHtml: esc(answer) });

  const todayList = PRAYERS.map((p, i) => `${p.name} ${td(i)}${i === 3 ? ` (Hanafi ${td(HANAFI_ASR)})` : ""}`).join(", ");
  let fri = date;
  while (clock.weekday(fri) !== 5) fri = clock.addDays(fri, 1);
  const friDhuhr = clock.day(fri).t[2];
  const year = Number(date.slice(0, 4));
  let mid = `${year}-06-21` as LocalDate;
  if (mid < date) mid = `${year + 1}-06-21` as LocalDate;
  const midT = clock.day(mid).t;
  const clockChange = clock.nextClockChange(date);
  const qibla = clock.qibla();
  const hanafiAsr = today.asrHanafi;

  const items: Faq[] = [
    raw(`What are the namaz timings in ${name} today?`,
      `${esc(name)} namaz timings today are ${todayList}. The list at the top of this page shows them with the current prayer, and the arrows step to other days.`),
    raw(`What time is Fajr in ${name} today?`,
      `Fajr in ${esc(name)} today begins at ${td(0)} and lasts until sunrise at ${td(1)}. When fasting, suhoor ends as Fajr begins, and the fast is opened at Maghrib, ${td(4)}.`),
    raw(`What time is Maghrib (iftar) in ${name} today?`,
      `Maghrib in ${esc(name)} today is at ${td(4)}, just after sunset. That is also iftar time, when the fast is opened. Maghrib lasts until Isha begins at ${td(5)}.`),
    raw(`What time is Isha in ${name} today?`,
      `Isha in ${esc(name)} today begins at ${td(5)}. Its time lasts until Fajr the next morning, and it is recommended not to delay it past the middle of the night.`),
    text(`Why do ${name} prayer times differ between apps and mosques?`,
      `Apps and mosques use different calculation methods. This page uses the ${methodName} method with ${c.fajrAngle === c.ishaAngle ? `Fajr and Isha both at ${c.fajrAngle}°` : `Fajr at ${c.fajrAngle}° and Isha at ${c.ishaAngle}°`}${lt ? `, while many ${name} mosques follow the ${lt.name}` : ""}. The difference is usually a few minutes for Dhuhr, Asr and Maghrib and larger for Fajr and Isha.`),
    ...(lt ? [text(`Which timetable do ${name} mosques follow?`, lt.note)] : []),
    text(`What is the Asr time in ${name} for Hanafis?`,
      `${name} has two Asr times. Today the Hanafi Asr in ${name} is at ${fmt(hanafiAsr)}, ${Math.round((hanafiAsr - today.t[3]) / 60000)} minutes after the Shafi'i Asr at ${fmt(today.t[3])}. Hanafi Asr starts when an object's shadow is twice its length; the Shafi'i, Maliki and Hanbali time starts at once its length.`),
    text(`What time is Jumu'ah in ${name}?`,
      `Jumu'ah is prayed in place of Dhuhr. On ${clock.longDate(fri)} Dhuhr in ${name} begins at ${fmt(friDhuhr)}. Each mosque sets its own khutbah and jamaat times, so check with the mosque you attend.`),
    text(`Why is Isha so late in ${name} in summer?`,
      `${name} is far enough north that the sky barely gets fully dark around midsummer. On ${clock.longDate(mid)}, Fajr is at ${fmt(midT[0])}, Maghrib at ${fmt(midT[4])} and Isha at ${fmt(midT[5])}. The ${methodName} method applies seasonal limits so Isha and Fajr stay at a practical time.`),
    text(`What is the Qibla direction in ${name}?`,
      `The Qibla from ${name} is ${qibla.bearing}° from true north, roughly ${qibla.compass}. That is the shortest path across the globe to the Kaaba in Makkah, which is why it points ${qibla.compass} rather than straight towards Saudi Arabia on a flat map.`),
  ];
  if (clockChange) {
    items.push(text(`Are these times in GMT or BST?`,
      `All times are ${country.name} local time, currently ${clock.zoneAbbr(today.t[2])}. The clocks change on ${clock.longDate(clockChange)}; from that day the times are in ${clock.zoneAbbrOn(clockChange)}, and the timetable already accounts for it.`));
  }
  return items;
}

interface MonthTable { readonly label: string; readonly note: string; readonly html: string }

function monthTable(view: View, year: number, month: number): MonthTable {
  const { input, clock } = view;
  const { city, country, date } = input;
  const pad = (n: number) => String(n).padStart(2, "0");
  const at = (d: number) => `${year}-${pad(month)}-${pad(d)}` as LocalDate;
  const first = at(1);
  let rows = "";
  let dstNote = "";
  for (let d = 1; d <= clock.daysInMonth(year, month); d++) {
    const ymd = at(d);
    const t = clock.day(ymd);
    const h = clock.hijri(ymd);
    if (d > 1 && clock.zoneAbbrOn(ymd) !== clock.zoneAbbrOn(clock.addDays(ymd, -1))) {
      dstNote = ` Clocks change on ${clock.longDate(ymd)}; times from that day are in ${clock.zoneAbbrOn(ymd)}.`;
    }
    const cls = ymd === date ? ' class="today" aria-current="date"' : ymd < date ? ' class="past"' : "";
    const cells = t.t.map((x, i) => `<td>${clock.tableTime(x)}</td>${i === 3 ? `<td>${clock.tableTime(t.asrHanafi)}</td>` : ""}`).join("");
    rows += `\n        <tr data-date="${ymd}"${cls}><th scope="row">${clock.shortDay(ymd)}<span class="hj" title="${h.long}">${h.short}</span></th>${cells}</tr>`;
  }
  const label = clock.monthYear(first);
  const noteId = `tt-note-${year}-${pad(month)}`;
  const head = PRAYERS.map((p, i) => (i === 3
    ? '<th scope="col" aria-label="Asr I">Asr<span class="tag">I</span></th><th scope="col" aria-label="Asr II">Asr<span class="tag">II</span></th>'
    : `<th scope="col">${p.name}</th>`)).join("");
  return {
    label,
    note: `<p class="table-note" id="${noteId}">${country.name} local time. Asr I: Shafi'i, Maliki, Hanbali. Asr II: Hanafi.${dstNote}</p>`,
    html: `<div class="table-wrap">
      <table class="timetable" aria-describedby="${noteId}">
        <caption class="sr-only">${esc(city.name)} prayer timetable, ${label}</caption>
        <thead><tr><th scope="col"><span class="sr-only">Date</span></th>${head}</tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>`,
  };
}

function weekTable(view: View, caption: string, cols: readonly (readonly [string, (d: LocalDate) => number])[]): string {
  const { clock, input } = view;
  const week = Array.from({ length: 7 }, (_, i) => clock.addDays(input.date, i));
  return `
    <table class="timetable fajr-week">
      <caption class="sr-only">${caption}</caption>
      <thead><tr><th scope="col"><span class="sr-only">Date</span></th>${cols.map(([h]) => `<th scope="col">${h}</th>`).join("")}</tr></thead>
      <tbody>${week.map((d) => `
        <tr data-date="${d}"${d === input.date ? ' class="today" aria-current="date"' : ""}><th scope="row">${clock.shortDay(d)}</th>${cols.map(([, f]) => `<td>${clock.time(f(d))}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>`;
}

function fajrCard(view: View): string {
  const { input, clock, today } = view;
  const { city, date } = input;
  const name = esc(city.name);
  const c = clock.calc;
  const td = (i: number) => todaySpan(clock, today, i);
  const tomorrow = clock.addDays(date, 1);
  const lt = city.localTimetable;
  const highLat = c.seasonalLimits ? ` and seasonal limits for ${name}'s high latitude` : "";
  const otherMethods = c.fajrAngle === 18
    ? "ISNA puts Fajr at 15°, which gives a later time, while the Muslim World League and Karachi methods use 18° like this page but handle high latitudes differently."
    : `the Muslim World League and Karachi methods put Fajr at 18° and ISNA at 15°, against ${c.fajrAngle}° here.`;
  const week = weekTable(view, `Fajr and sunrise in ${name}, next 7 days`, [["Fajr", (d) => clock.day(d).t[0]], ["Sunrise", (d) => clock.day(d).t[1]]]);
  return `
    <div class="card">
    <h2 id="fajr">${icon("wb_twilight")}Fajr time in ${name} today</h2>
    <p class="answer">Fajr in ${name} today, <span data-today-date>${clock.longDate(date)}</span>, is at ${td(0)}; sunrise is at ${td(1)}, so Fajr ends then. Tomorrow, ${clock.longDate(tomorrow)}, Fajr is at ${clock.time(clock.day(tomorrow).t[0])}.</p>
    <p>These times use the ${view.methodName} method, with Fajr when the sun is ${c.fajrAngle}° below the horizon${highLat}.${lt ? ` Many ${name} mosques publish the ${esc(lt.name)} instead, so their Fajr (often spelled Fajar) can differ by several minutes.` : " Fajr is also often spelled Fajar."}</p>
    <p>Other websites may show a different Fajr time for ${name} because they use other calculation methods: ${otherMethods}${Math.abs(city.lat) > 48 ? ` The gap is widest in summer, when the sky over ${name} never gets fully dark.` : ""}</p>${week}
    </div>`;
}

function maghribCard(view: View): string {
  const { input, clock, today } = view;
  const { city, date } = input;
  const name = esc(city.name);
  const td = (i: number) => todaySpan(clock, today, i);
  const tomorrow = clock.addDays(date, 1);
  const mAdj = clock.calc.adjustments.find((a) => a.prayer === "Maghrib")?.minutes ?? 0;
  const week = weekTable(view, `Maghrib and Isha in ${name}, next 7 days`, [["Maghrib", (d) => clock.day(d).t[4]], ["Isha", (d) => clock.day(d).t[5]]]);
  return `
    <div class="card">
    <h2 id="maghrib">${icon("sunset")}Maghrib time in ${name} today</h2>
    <p class="answer">Maghrib in ${name} today, <span data-today-date>${clock.longDate(date)}</span>, is at ${td(4)}. This is also iftar time: when fasting, the fast is opened at Maghrib. Tomorrow, ${clock.longDate(tomorrow)}, Maghrib is at ${clock.time(clock.day(tomorrow).t[4])}.</p>
    <p>Maghrib begins once the sun has fully set${mAdj ? `; the ${view.methodName} method adds ${mAdj} minutes to sunset as a precaution` : ""}. It lasts until Isha begins, at ${td(5)} today. It is recommended to pray it soon after it begins.</p>
    <p>Because every calculation method works from sunset, Maghrib times for ${name} usually differ by only a few minutes between apps, websites and mosques, mostly from the precaution each one adds.</p>${week}
    </div>`;
}

function ishaCard(view: View): string {
  const { input, clock, today } = view;
  const { city, date } = input;
  const name = esc(city.name);
  const c = clock.calc;
  const td = (i: number) => todaySpan(clock, today, i);
  const tomorrow = clock.addDays(date, 1);
  const lt = city.localTimetable;
  const highLat = c.seasonalLimits ? ` and seasonal limits for ${name}'s high latitude` : "";
  const maxDepression = 90 - Math.abs(city.lat) - EARTH_AXIAL_TILT_DEG;
  const week = weekTable(view, `Isha and the next Fajr in ${name}, next 7 days`, [["Isha", (d) => clock.day(d).t[5]], ["Next Fajr", (d) => clock.day(clock.addDays(d, 1)).t[0]]]);
  return `
    <div class="card">
    <h2 id="isha">${icon("bedtime")}Isha time in ${name} today</h2>
    <p class="answer">Isha in ${name} today, <span data-today-date>${clock.longDate(date)}</span>, is at ${td(5)}. Tomorrow, ${clock.longDate(tomorrow)}, Isha is at ${clock.time(clock.day(tomorrow).t[5])}.</p>
    <p>These times use the ${view.methodName} method, with Isha when the sun is ${c.ishaAngle}° below the horizon${highLat}. The time for Isha lasts until Fajr, and it is recommended not to delay it past the middle of the night.</p>
    <p>Isha times for ${name} differ between sites most in summer.${maxDepression < c.ishaAngle ? ` Around midsummer the sun never sinks ${c.ishaAngle}° below the horizon in ${name}, so each method falls back on a high-latitude rule, such as the middle of the night or one-seventh of the night.` : ""} Methods also use different Isha angles: the Muslim World League uses 17°, ISNA 15° and Karachi 18°, while Umm al-Qura sets Isha 90 minutes after Maghrib.${lt ? ` Many ${name} mosques follow the ${esc(lt.name)} instead.` : ""}</p>${week}
    </div>`;
}

const MOSQUE_COLUMNS: readonly { readonly key: PrayerKey; readonly name: string }[] = PRAYERS
  .filter((p): p is (typeof PRAYERS)[number] & { key: PrayerKey } => p.key !== "sunrise");

function mosquesCard(section: MosqueSection, clock: CityClock, cityName: string, date: LocalDate): string {
  if (section.kind !== "live" || !section.mosques.length) return "";
  const hasAthan = section.mosques.some((m) => MOSQUE_COLUMNS.some((p) => m.athan[p.key]));
  return `
    <div class="card">
    <h2 id="mosques">${icon("mosque")}Mosques in ${esc(cityName)} — Jama'ah times</h2>
    <p>${hasAthan ? "Start (athan) and jama'ah" : "Jama'ah"} (congregation) times for ${clock.longDate(date)}, as published by each mosque. Mosques set their own times, so check with the mosque before you go.</p>
    <ul class="mosques">
      ${section.mosques.map((m) => mosqueRow(m, clock, hasAthan)).join("\n      ")}
    </ul>
    </div>
`;
}

function mosqueRow(m: Mosque, clock: CityClock, hasAthan: boolean): string {
  return `<li>
        <h3>${esc(m.name)}</h3>
        ${m.address ? `<p class="addr">${esc(m.address)}</p>` : ""}
        <table class="mtimes">
          <thead><tr><td></td>${MOSQUE_COLUMNS.map((p) => `<th scope="col">${p.name}</th>`).join("")}</tr></thead>
          <tbody>${hasAthan ? `
            <tr><th scope="row">Athan</th>${MOSQUE_COLUMNS.map((p) => `<td>${clock.wallClock(m.athan[p.key])}</td>`).join("")}</tr>` : ""}
            <tr><th scope="row">Jama'ah</th>${MOSQUE_COLUMNS.map((p) => `<td>${clock.wallClock(m.iqamah[p.key])}</td>`).join("")}</tr>
          </tbody>
        </table>${m.jummah.length ? `
        <p class="jummah">Jumu'ah ${m.jummah.map((j) => clock.wallClock(j, false)).join(", ")}</p>` : ""}
      </li>`;
}

function widgetCard(input: PageInput): string {
  const { city, links } = input;
  const embedCode = `<iframe src="${links.widgetEmbed}" title="${city.name} prayer times" width="320" height="330" style="border:0;max-width:100%" loading="lazy"></iframe>`;
  return `
    <div class="card">
    <h2 id="widget">${icon("code")}Add ${esc(city.name)} prayer times to your website</h2>
    <p>Mosques, schools and community websites can show today's ${esc(city.name)} prayer times with this free widget. Paste the code into any page: it updates every day, works in light and dark mode and loads nothing from third parties.</p>
    <iframe class="widget-preview" src="${links.widgetPreview}" title="${esc(city.name)} prayer times widget preview" width="320" height="330" loading="lazy"></iframe>
    <pre class="embed-code"><code id="embed-code">${esc(embedCode)}</code></pre>
    <p class="copy-row"><button type="button" class="copy-btn" id="copy-embed">Copy code</button> <span class="copy-status" id="copy-status" role="status" aria-live="polite"></span></p>
    </div>`;
}

function nearbyCard(input: PageInput): string {
  const { city, country, links } = input;
  if (!links.nearby.length) return "";
  return `
    <div class="card">
    <h2>${icon("location_on")}Prayer times near ${esc(city.name)}</h2>
    <ul class="nearby">
      ${links.nearby.map((n) => `<li><a href="${n.href}">${esc(n.name)}</a></li>`).join("\n      ")}
    </ul>
    <p class="hub-link"><a href="${links.country}">All prayer times in ${esc(country.name)}</a></p>
    </div>
`;
}

function seoSection(view: View): string {
  const { input, clock, today, methodName } = view;
  const { city, country, date, links } = input;
  const name = esc(city.name);
  const c = clock.calc;
  const [y, mo] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
  const thisMonth = monthTable(view, y, mo);
  let nextMonthHtml = "";
  let nextMonthNote = "";
  if (clock.daysInMonth(y, mo) - Number(date.slice(8, 10)) < 10) {
    const t = mo === 12 ? monthTable(view, y + 1, 1) : monthTable(view, y, mo + 1);
    nextMonthNote = `\n    ${t.note}`;
    nextMonthHtml = `\n    <h3>${name} prayer timetable | ${t.label}</h3>\n    ${t.html}`;
  }
  const todayList = PRAYERS.map((p, i) => `${p.name} ${todaySpan(clock, today, i)}${i === 3 ? ` (Hanafi ${todaySpan(clock, today, HANAFI_ASR)})` : ""}`).join(", ");
  const adj = c.adjustments.map((a) => `${a.prayer} ${a.minutes > 0 ? "+" : ""}${a.minutes} min`).join(", ");
  const timesSource = city.timesSource ?? `${methodName} method`;

  return `<section class="seo" id="seo">
    <div class="card">
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol>
          <li><a href="${links.hub}">Prayer Times</a></li>
          <li><a href="${links.country}">${esc(country.name)}</a></li>
          <li aria-current="page">${name}</li>
        </ol>
      </nav>
    <h1>${icon("schedule")}Prayer Times in ${name}, ${esc(country.name)}</h1>
    <p class="answer" id="answer" data-date="${date}"><span class="a-lead">Salah (namaz) times in ${name} today</span><span class="sr-only">, </span><span class="a-date"><span data-today-date>${clock.longDate(date)}</span> · <span data-today-hijri>${clock.hijri(date).long}</span></span><span class="sr-only">: </span><span class="a-times">${todayList.split(", ").join(" · ")}</span><span class="sr-only">. </span></p>
    <p class="source-line">Updated <time datetime="${date}">${clock.longDate(date)}</time> · Times calculated with the ${esc(timesSource)}</p>
    </div>

    <div class="card">
    <h2 id="timetable">${icon("calendar_month")}${name} prayer timetable | ${thisMonth.label}</h2>
    ${thisMonth.html}${nextMonthHtml}
    </div>
    ${thisMonth.note}${nextMonthNote}
${fajrCard(view)}
${maghribCard(view)}
${ishaCard(view)}

    <div class="card">
    <h2>${icon("tune")}How are ${name} prayer times calculated?</h2>
    <dl class="method">
      <div><dt>Method</dt><dd>${methodName}</dd></div>
      <div><dt>Fajr angle</dt><dd>${c.fajrAngle}° below the horizon</dd></div>
      <div><dt>Isha angle</dt><dd>${c.ishaAngle}° below the horizon</dd></div>
      <div><dt>Asr</dt><dd>Both times shown: Shafi'i, Maliki and Hanbali (shadow equal to an object’s length) and Hanafi (shadow twice its length).</dd></div>
      <div><dt>High latitudes</dt><dd>${c.seasonalLimits ? "Moonsighting Committee seasonal limits on Fajr and Isha" : "Twilight angle rule"}</dd></div>${adj ? `\n      <div><dt>Adjustments</dt><dd>${adj}</dd></div>` : ""}
    </dl>
    </div>
${mosquesCard(input.mosques, clock, city.name, date)}
${widgetCard(input)}

    <div class="card">
    <h2>${icon("help")}Frequently asked questions</h2>
    <div class="faq">
      ${view.faq.map((f) => `<details class="faq-item" name="faq">
        <summary><h3 class="faq-h">${esc(f.question)}</h3></summary>
        <div class="faq-a"><p>${f.answerHtml}</p></div>
      </details>`).join("\n      ")}
    </div>
    </div>
${nearbyCard(input)}  </section>`;
}
