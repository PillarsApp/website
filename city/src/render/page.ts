import template from "../../page/template.html";
import cssSource from "../../page/city.css";
import bttCss from "../../../shared/back-to-top.css";
import { SITE } from "../cities";
import { timetableId } from "../timetables";
import type { City, DayOrigin, LocalDate, Mosque, MosqueSection, PageInput, PageLinks, PrayerKey, Rendered, Standard, Timetable, TimetableDay } from "../types";
import { cityClock, PRAYERS, type CityClock, type DayTimes } from "./times";
import { esc, fillRegions, jsonInScript, minifyCss, plainText, titleHeadings } from "./html";
import { analyticsFor } from "./analytics";

const CSS = minifyCss(bttCss + cssSource);

export const UNAVAILABLE_RETRY_MS = 10 * 60 * 1000;

export type TemplateRegion =
  | "html" | "head" | "css" | "preload" | "chip" | "dialog" | "date" | "list-open" | "list" | "caption" | "seo" | "banner" | "scripts" | "analytics";

export function renderCityPage(input: PageInput): Rendered {
  const clock = cityClock(input.city, input.country, input.timetable);
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
  readonly standard: Standard;
  // The standard's times come from a timetable file, so a day that is not in it is an estimate.
  readonly published: boolean;
  readonly faq: readonly Faq[];
}

interface Faq {
  readonly question: string;
  readonly answerHtml: string;
}

type Ctx = Omit<View, "faq">;

// How the copy refers to the standard mid-sentence: "the London Unified Prayer Timetable",
// "Birmingham Central Mosque's timetable", "the ISNA method".
const standardRef = (s: Standard) => (s.kind === "mosque" ? `${s.name}'s timetable` : `the ${s.name}`);

const ESTIMATE_MARK = '<span class="est" title="Estimated">*</span>';
const JAMAAH_LINE = "Each mosque sets its own jama'ah (congregation) times, so check with the mosque you attend.";

function regions(input: PageInput, clock: CityClock): Record<TemplateRegion, string> {
  const today = clock.day(input.date);
  const { city, links } = input;
  const ctx: Ctx = { input, clock, today, methodName: clock.calc.methodLabel, standard: city.standard, published: timetableId(city.standard) !== null };
  const view: View = { ...ctx, faq: faqList(ctx) };
  return {
    html: `<html lang="${input.country.lang}">`,
    head: head(view),
    css: `<style id="city-css">${CSS}</style>`,
    preload: preloadFonts(links),
    chip: `<button type="button" class="chip-badge" id="chip-badge" aria-haspopup="dialog" aria-controls="std-dialog" aria-label="About these times: ${esc(city.standard.name)}">${badgeIcon("")}</button>
      <span class="chip-name" id="chip-name">${esc(city.name)} Prayer Times</span>`,
    dialog: standardDialog(view),
    date: `<div class="date-greg" id="date-greg">${clock.appDate(input.date)}</div>
        <div class="date-hijri" id="date-hijri">${clock.hijri(input.date).long}</div>`,
    "list-open": `<ul class="list" id="list" aria-label="${esc(city.name)} prayer times today">`,
    list: replicaList(view),
    caption: listCaption(view),
    seo: titleHeadings(seoSection(view)),
    banner: `<span class="ab-title" id="ab-title">${SITE.name} App: ${esc(city.name)} Prayer Times</span>`,
    scripts: `<script src="${links.assets}/adhan-4.4.3.umd.min.js"></script>\n<script src="${links.clientScript}"></script>`,
    analytics: analyticsFor(input.audience),
  };
}

const firstAsr = (view: Ctx, day: DayTimes) => (view.standard.asrFirst === "Hanafi" ? day.asrHanafi : day.t[3]);
const otherAsr = (view: Ctx, day: DayTimes) => (view.standard.asrFirst === "Hanafi" ? day.t[3] : day.asrHanafi);
const otherAsrLabel = (view: Ctx) => (view.standard.asrFirst === "Hanafi" ? "Shafi'i" : "Hanafi");

function timesText(view: Ctx): string {
  const { clock, today } = view;
  return PRAYERS.map((p, i) => (i === 3
    ? `Asr ${clock.time(firstAsr(view, today))} (${otherAsrLabel(view)} ${clock.time(otherAsr(view, today))})`
    : `${p.name} ${clock.time(today.t[i])}`)).join(", ");
}

// Search-snippet times: one Asr, and "Zuhr", the spelling most UK searches use.
function shortTimesText(view: Ctx): string {
  const { clock, today } = view;
  return PRAYERS.map((p, i) => (i === 1 ? "" : i === 2 ? `Zuhr ${clock.time(today.t[i])}` : i === 3
    ? `Asr ${clock.time(firstAsr(view, today))}`
    : `${p.name} ${clock.time(today.t[i])}`)).filter(Boolean).join(", ");
}

// Timetable rows the client can reach by stepping days: from the first of last month to the end of the
// month six months on, plus last year's row for any day in that span the timetable has not published.
// Each row is one string, "06:00 07:34 12:50 15:21 16:03 17:56 19:21", with "-" for a null column.
function inlineDays(timetable: Timetable, clock: CityClock, date: LocalDate): Record<LocalDate, string> {
  const [y, m] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
  const monthStart = (months: number) => { const t = new Date(Date.UTC(y, m - 1 + months, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01` as LocalDate; };
  const row = (r: TimetableDay) => r.map((v) => v ?? "-").join(" ");
  const out: Record<LocalDate, string> = {};
  for (let d = monthStart(-1), end = monthStart(7); d < end; d = clock.addDays(d, 1)) {
    const own = timetable.days[d];
    if (own) { out[d] = row(own); continue; }
    const [yy, mm, dd] = d.split("-").map(Number);
    const lastYear = `${yy - 1}-${d.slice(5, 8)}${String(mm === 2 && dd === 29 ? 28 : dd).padStart(2, "0")}` as LocalDate;
    if (timetable.days[lastYear]) out[lastYear] = row(timetable.days[lastYear]);
  }
  return out;
}

function head(view: View): string {
  const { input, clock, standard } = view;
  const { city, country, date, links, mosques } = input;
  const url = links.canonical;
  const hubUrl = SITE.origin + links.hub;
  const countryUrl = SITE.origin + links.country;
  const { seo } = city;
  const title = seo?.title ?? `${city.name} Prayer Times Today – Salah Times, Fajr to Isha | ${SITE.name}`;
  const description = seo
    ? `${city.name} prayer times today, ${clock.appDate(date)}: ${shortTimesText(view)}.${view.today.origin === "published" ? ` ${seo.descriptionTail}` : ""}`
    : `${city.name} prayer times today, ${clock.longDate(date)}: ${timesText(view)}. Monthly timetable${view.published ? ` from ${standardRef(standard)}` : " and calculation method"}.`;
  const shareTitle = seo?.shareTitle ?? `${city.name} Prayer Times Today`;
  const shareDescription = seo?.shareDescription ?? description;
  const image = seo ? { url: `${SITE.origin}${links.assets}/${seo.image.file}`, alt: seo.image.alt } : null;
  const qibla = clock.qibla();
  const live = mosques.kind === "live" ? mosques : null;

  const graph: unknown[] = [
    { "@type": "Organization", "@id": SITE.organizationId, name: SITE.name, url: `${SITE.origin}/`, logo: links.logo },
    {
      "@type": "WebPage", "@id": `${url}#webpage`, url, name: title, description,
      ...(image ? { primaryImageOfPage: { "@type": "ImageObject", url: image.url, width: 1200, height: 630 } } : {}),
      inLanguage: country.lang, datePublished: city.datePublished, dateModified: clock.isoLocal(input.now),
      publisher: { "@id": SITE.organizationId },
      ...(HUBS_LIVE ? { breadcrumb: { "@id": `${url}#breadcrumb` } } : {}),
      about: {
        "@type": "City", name: city.name,
        geo: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng },
        containedInPlace: { "@type": "Country", name: country.name },
      },
    },
  ];
  if (HUBS_LIVE) {
    graph.push(
    {
      "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Prayer Times", item: hubUrl },
        { "@type": "ListItem", position: 2, name: country.name, item: countryUrl },
        { "@type": "ListItem", position: 3, name: city.name, item: url },
      ],
    }
    );
  }
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
    name: city.name, place: `${city.name}, ${country.short}`, country: country.code, lang: country.lang, clock: country.clock,
    lat: city.lat, lng: city.lng, timezone: city.timezone,
    method: clock.calc.method, madhab: clock.calc.madhab, highLatitudeRule: clock.calc.highLatitudeRule,
    standard: standard.name, asrFirst: standard.asrFirst,
    ...(view.published ? { timetable: input.timetable ? inlineDays(input.timetable, clock, date) : {} } : {}),
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
<meta property="og:title" content="${esc(shareTitle)}">
<meta property="og:description" content="${esc(shareDescription)}">
${image ? `<meta property="og:image" content="${image.url}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(image.alt)}">
` : ""}<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(shareTitle)}">
<meta name="twitter:description" content="${esc(shareDescription)}">
${image ? `<meta name="twitter:image" content="${image.url}">
<meta name="twitter:image:alt" content="${esc(image.alt)}">
` : ""}<script id="city-data" type="application/json">
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

function asrToggle(later: boolean): string {
  const opt = (key: string, label: string, on: boolean) => `<button type="button" class="asr-opt" data-asr="${key}" aria-pressed="${on}">${label}</button>`;
  return `<span class="asr-toggle${later ? " is-later" : ""}" role="group" aria-label="Asr time"><span class="asr-thumb" aria-hidden="true"></span>${opt("earlier", "Earlier", !later)}${opt("later", "Later", later)}</span>`;
}

function replicaList(view: View): string {
  const { clock, today } = view;
  let list = '<li class="sep" aria-hidden="true"></li>';
  PRAYERS.forEach((p, i) => {
    const name = i === 3 ? `Asr ${asrToggle(view.standard.asrFirst === "Hanafi")}` : p.name;
    const t = i === 3 ? firstAsr(view, today) : today.t[i];
    list += `<li class="row"><span class="name">${name}</span> <span class="t">${clock.time(t)}</span></li><li class="sep" aria-hidden="true"></li>`;
  });
  return list;
}

const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;

// What a day's times are, for the trust caption; page/city.js writes the same words as the visitor steps days.
function originLabel(origin: DayOrigin, year: number): string {
  if (origin === "published") return "Published Start Times";
  if (origin === "last-year") return `Estimated From Its ${year - 1} Timetable`;
  return "Calculated Until Published";
}

function listCaption(view: View): string {
  const { input, clock, today, methodName, standard } = view;
  const { city } = input;
  const c = clock.calc;
  const angles = c.fajrAngle === c.ishaAngle ? `Fajr &amp; Isha ${c.fajrAngle}°` : `Fajr ${c.fajrAngle}° · Isha ${c.ishaAngle}°`;
  const zone = `<span data-tz-name>${clock.zoneLong(today.t[2])} (${clock.zoneAbbr(today.t[2])})</span>`;
  const text = view.published
    ? `${badgeIcon("cap-badge")}Prayer Times based on verified ${esc(standard.name)} · <span data-origin>${originLabel(today.origin, Number(input.date.slice(0, 4)))}</span> · ${zone}`
    : standard.kind === "gps"
    ? `Based on ${esc(city.coordinatesLabel ?? city.name)} (${deg(city.lat, "N", "S")}, ${deg(city.lng, "E", "W")}) · ${methodName} · ${angles} · ${zone}`
    : `${esc(standard.name)} · ${methodName} · ${angles} · ${zone}`;
  return `<p class="list-caption" id="list-caption">${text}</p>`;
}

const HANAFI_ASR = 6;
const EARTH_AXIAL_TILT_DEG = 23.44;

// The deepest the sun sinks below the horizon at midsummer. Beyond this, a method with a larger twilight angle never sees full darkness.
const midsummerMaxDepression = (city: City) => 90 - Math.abs(city.lat) - EARTH_AXIAL_TILT_DEG;

const todaySpan = (clock: CityClock, today: DayTimes, i: number) =>
  `<span data-today="${i}">${clock.time(i === HANAFI_ASR ? today.asrHanafi : today.t[i])}</span>`;

function todayList(view: Ctx): string {
  const { clock, today } = view;
  const hanafiFirst = view.standard.asrFirst === "Hanafi";
  return PRAYERS.map((p, i) => (i === 3
    ? `Asr ${todaySpan(clock, today, hanafiFirst ? HANAFI_ASR : 3)} (${otherAsrLabel(view)} ${todaySpan(clock, today, hanafiFirst ? 3 : HANAFI_ASR)})`
    : `${p.name} ${todaySpan(clock, today, i)}`)).join(", ");
}

// The hero's times as grid cells; the text reads exactly as todayList with " · " between prayers.
function heroTimes(view: Ctx): string {
  const { clock, today } = view;
  const hanafiFirst = view.standard.asrFirst === "Hanafi";
  return PRAYERS.map((p, i) => `<span class="a-t"><span class="a-n">${p.name}</span> <span class="a-v">${i === 3
    ? `${todaySpan(clock, today, hanafiFirst ? HANAFI_ASR : 3)} <small>(${otherAsrLabel(view)} ${todaySpan(clock, today, hanafiFirst ? 3 : HANAFI_ASR)})</small>`
    : todaySpan(clock, today, i)}</span></span>`).join('<span class="sr-only"> · </span>');
}

// The FAQ answers "which timetable" with the same paragraphs as the badge dialog.
function dialogParagraphs(view: Ctx): readonly string[] {
  const { standard, today, input } = view;
  const [first, second, last] = standard.dialog ?? [standard.badge, kindParagraph(view), JAMAAH_LINE];
  const year = Number(input.date.slice(0, 4));
  const estimate = !view.published || today.origin === "published" ? []
    : [today.origin === "last-year"
      ? `Today's times are estimated from ${standard.name}'s ${year - 1} timetable until it publishes ${year}.`
      : `Today's times are calculated until ${standard.name} publishes them.`];
  return [first, second, ...estimate, last];
}

function kindParagraph(view: Ctx): string {
  const { standard, input, methodName } = view;
  const { city } = input;
  if (standard.kind === "gps") {
    return `${city.name} has no timetable that most of its mosques share, so these times are calculated for ${city.coordinatesLabel ?? `central ${city.name}`} with the ${methodName} method, and checked against the mosques named above on dates through the year.`;
  }
  if (standard.timetable === null) {
    return standard.kind === "mosque"
      ? `${standard.name}'s published start times match this calculation within a minute on every day we checked, so this page calculates them.`
      : `The ${standard.name} is itself an ${methodName} calculation, so this page calculates the same times rather than copying the sheet.`;
  }
  return standard.kind === "mosque"
    ? `${city.name} has no city-wide timetable. These are ${standard.name}'s published start times, loaded from its timetable rather than calculated, because no standard calculation reproduces its seasonal rules.`
    : `These are the start times the ${standard.name} publishes, loaded from the timetable rather than calculated.`;
}

const BADGE_PATH = "m23 12-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z";
// The verified badge: chip button, caption and the standard sheet all draw the same shape.
const badgeIcon = (cls: string) => `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" aria-hidden="true"><path d="${BADGE_PATH}"/></svg>`;

// Bold the names a reader scans for: the timetable itself, the mosques that publish it, and Hanafi.
function boldTerms(view: View, p: string): string {
  const terms = [view.standard.name, "Hanafi"].map(esc);
  let html = esc(p).replace(/([A-Z][\w&#;']*(?: [A-Z][\w&#;']*)* Mosque(?: \([^)]*\))?)/g, "<strong>$1</strong>");
  for (const t of terms) html = html.split(t).join(`<strong>${t}</strong>`);
  return html.replace(/<strong>([^<]*)<strong>([^<]*)<\/strong>([^<]*)<\/strong>/g, "<strong>$1$2$3</strong>");
}

function standardDialog(view: View): string {
  return `<dialog class="std-dialog" id="std-dialog" aria-labelledby="std-title">
      <button type="button" class="std-close" id="std-close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
      <p class="std-eyebrow">Verified By Pillars</p>
      <h2 class="std-title" id="std-title">${badgeIcon("std-badge")}<span>${esc(view.standard.name)}</span></h2>
      ${dialogParagraphs(view).map((p) => `<p>${boldTerms(view, p)}</p>`).join("\n      ")}
    </dialog>`;
}

function faqList(view: Ctx): readonly Faq[] {
  const { input, clock, today, standard } = view;
  const { city, date } = input;
  const name = city.name;
  const methodName = clock.calc.methodLabel;
  const c = clock.calc;
  const td = (i: number) => todaySpan(clock, today, i);
  const fmt = (ms: number) => clock.time(ms);
  const raw = (question: string, answerHtml: string): Faq => ({ question, answerHtml });
  const text = (question: string, answer: string): Faq => ({ question, answerHtml: esc(answer) });

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
  const ref = standardRef(standard);
  const angles = c.fajrAngle === c.ishaAngle ? `Fajr and Isha both at ${c.fajrAngle}°` : `Fajr at ${c.fajrAngle}° and Isha at ${c.ishaAngle}°`;
  const [p1, p2] = dialogParagraphs(view);

  const items: Faq[] = [
    raw(`What are the namaz timings in ${name} today?`,
      `${esc(name)} namaz timings today are ${todayList(view)}. The list at the top of this page shows them with the current prayer, and the arrows step to other days.`),
    raw(`What time is Fajr in ${name} today?`,
      `Fajr in ${esc(name)} today begins at ${td(0)} and lasts until sunrise at ${td(1)}. When fasting, suhoor ends as Fajr begins, and the fast is opened at Maghrib, ${td(4)}.`),
    raw(`What time is Maghrib (iftar) in ${name} today?`,
      `Maghrib in ${esc(name)} today is at ${td(4)}, just after sunset. That is also iftar time, when the fast is opened. Maghrib lasts until Isha begins at ${td(5)}.`),
    raw(`What time is Isha in ${name} today?`,
      `Isha in ${esc(name)} today begins at ${td(5)}. Its time lasts until Fajr the next morning, and it is recommended not to delay it past the middle of the night.`),
    text(`Why do ${name} prayer times differ between apps and mosques?`,
      view.published
        ? `Apps calculate prayer times from sun angles, while this page shows the start times ${ref} publishes. A mosque that follows another timetable usually differs by a few minutes for Dhuhr, Asr and Maghrib and by more for Fajr and Isha.`
        : `Apps and mosques use different calculation methods. This page uses the ${methodName} method with ${angles}${standard.kind === "gps" ? "" : `, the same times ${ref} publishes`}. The difference is usually a few minutes for Dhuhr, Asr and Maghrib and larger for Fajr and Isha.`),
    text(standard.kind === "gps" ? `Do these times match ${name} mosques?` : `Which timetable do ${name} mosques follow?`, `${p1} ${p2}`),
    text(`What is the Asr time in ${name} for Hanafis?`,
      `${name} has two Asr times. Today the Hanafi Asr in ${name} is at ${fmt(hanafiAsr)}, ${Math.round((hanafiAsr - today.t[3]) / 60000)} minutes after the Shafi'i Asr at ${fmt(today.t[3])}. Hanafi Asr starts when an object's shadow is twice its length; the Shafi'i, Maliki and Hanbali time starts at once its length.${standard.asrFirst === "Hanafi" ? ` The list on this page shows the Hanafi time first, as most ${name} mosques do.` : ""}`),
    text(`What time is Jumu'ah in ${name}?`,
      `Jumu'ah is prayed in place of Dhuhr. On ${clock.longDate(fri)} Dhuhr in ${name} begins at ${fmt(friDhuhr)}. Each mosque sets its own khutbah and jamaat times, so check with the mosque you attend.`),
    text(`Why is Isha so late in ${name} in summer?`,
      view.published
        ? `In summer sunset comes late and twilight lasts long, so Isha follows it. On ${clock.longDate(mid)}, Fajr is at ${fmt(midT[0])}, Maghrib at ${fmt(midT[4])} and Isha at ${fmt(midT[5])}. ${standard.isha}`
        : `${midsummerMaxDepression(city) < c.ishaAngle
          ? `${name} is far enough north that the sky barely gets fully dark around midsummer.`
          : `Isha begins when evening twilight ends, with the sun ${c.ishaAngle}° below the horizon, and in summer sunset comes late, so Isha follows it.`} On ${clock.longDate(mid)}, Fajr is at ${fmt(midT[0])}, Maghrib at ${fmt(midT[4])} and Isha at ${fmt(midT[5])}.${c.seasonalLimits ? ` The ${methodName} method applies seasonal limits so Isha and Fajr stay at a practical time.` : ""}`),
    text(`What is the Qibla direction in ${name}?`,
      `The Qibla from ${name} is ${qibla.bearing}° from true north, roughly ${qibla.compass}. That is the shortest path across the globe to the Kaaba in Makkah, which is why it points ${qibla.compass} rather than straight towards Saudi Arabia on a flat map.`),
  ];
  const zoneNames = clock.standardAndDaylightAbbr(Number(date.slice(0, 4)));
  if (clockChange && zoneNames) {
    items.push(text(`Are these times in ${zoneNames.standard} or ${zoneNames.daylight}?`,
      `All times are ${name} local time, currently ${clock.zoneAbbr(today.t[2])}. The clocks change on ${clock.longDate(clockChange)}; from that day the times are in ${clock.zoneAbbrOn(clockChange)}, and the timetable already accounts for it.`));
  }
  return items;
}

const estimated = (view: View, d: LocalDate) => view.published && view.clock.day(d).origin !== "published";
const dayLabel = (view: View, d: LocalDate) => view.clock.shortDay(d) + (estimated(view, d) ? ESTIMATE_MARK : "");

function estimateNote(view: View, dates: readonly LocalDate[]): string {
  const origins = new Set(dates.filter((d) => estimated(view, d)).map((d) => view.clock.day(d).origin));
  if (!origins.size) return "";
  const { name } = view.standard;
  const year = Number(dates[0].slice(0, 4));
  if (!origins.has("calculated")) return ` ${ESTIMATE_MARK} estimated from ${esc(name)}'s ${year - 1} timetable until it publishes ${year}.`;
  if (!origins.has("last-year")) return ` ${ESTIMATE_MARK} calculated until ${esc(name)} publishes these dates.`;
  return ` ${ESTIMATE_MARK} estimated from ${esc(name)}'s earlier timetable, or calculated, until it publishes these dates.`;
}

interface MonthTable { readonly label: string; readonly note: string; readonly html: string }

function monthTable(view: View, year: number, month: number): MonthTable {
  const { input, clock } = view;
  const { city, date } = input;
  const pad = (n: number) => String(n).padStart(2, "0");
  const at = (d: number) => `${year}-${pad(month)}-${pad(d)}` as LocalDate;
  const first = at(1);
  const dates = Array.from({ length: clock.daysInMonth(year, month) }, (_, i) => at(i + 1));
  let rows = "";
  let dstNote = "";
  for (const ymd of dates) {
    const t = clock.day(ymd);
    const h = clock.hijri(ymd);
    if (ymd !== first && clock.zoneAbbrOn(ymd) !== clock.zoneAbbrOn(clock.addDays(ymd, -1))) {
      dstNote = ` Clocks change on ${clock.longDate(ymd)}; times from that day are in ${clock.zoneAbbrOn(ymd)}.`;
    }
    const cls = [ymd === date ? "today" : ymd < date ? "past" : "", estimated(view, ymd) ? "estimate" : ""].filter(Boolean).join(" ");
    const attrs = `${cls ? ` class="${cls}"` : ""}${ymd === date ? ' aria-current="date"' : ""}`;
    const cells = t.t.map((x, i) => `<td>${clock.tableTime(x)}</td>${i === 3 ? `<td>${clock.tableTime(t.asrHanafi)}</td>` : ""}`).join("");
    rows += `\n        <tr data-date="${ymd}"${attrs}><th scope="row">${dayLabel(view, ymd)}<span class="hj" title="${h.long}">${h.short}</span></th>${cells}</tr>`;
  }
  const label = clock.monthYear(first);
  const noteId = `tt-note-${year}-${pad(month)}`;
  const head = PRAYERS.map((p, i) => (i === 3
    ? '<th scope="col" aria-label="Asr I">Asr<span class="tag">I</span></th><th scope="col" aria-label="Asr II">Asr<span class="tag">II</span></th>'
    : `<th scope="col">${p.name}</th>`)).join("");
  return {
    label,
    note: `<p class="table-note" id="${noteId}">${esc(city.name)} local time. Asr I: Shafi'i, Maliki, Hanbali. Asr II: Hanafi.${dstNote}${estimateNote(view, dates)}</p>`,
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
  const note = estimateNote(view, week);
  return `
    <table class="timetable fajr-week">
      <caption class="sr-only">${caption}</caption>
      <thead><tr><th scope="col"><span class="sr-only">Date</span></th>${cols.map(([h]) => `<th scope="col">${h}</th>`).join("")}</tr></thead>
      <tbody>${week.map((d) => `
        <tr data-date="${d}"${d === input.date ? ' class="today" aria-current="date"' : ""}><th scope="row">${dayLabel(view, d)}</th>${cols.map(([, f]) => `<td>${clock.time(f(d))}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>${note ? `\n    <p class="est-note">${note.trim()}</p>` : ""}`;
}

// One prayer as a ruled row: heading and today's time, the answer sentence always visible, and the
// week table and longer explanation folded in a native <details> (still in the HTML for crawlers).
function foldSection(today: DayTimes, clock: CityClock, i: number, id: string, heading: string, answer: string, prayer: string, more: string): string {
  return `
    <div class="v-fold">
    <div class="v-head"><h2 id="${id}">${heading}</h2><span class="v-t" aria-hidden="true">${todaySpan(clock, today, i)}</span></div>
    ${answer}
    <details class="v-more">
    <summary>More about ${prayer}</summary>${more}
    </details>
    </div>`;
}

function fajrCard(view: View): string {
  const { input, clock, today, standard } = view;
  const { city, date } = input;
  const name = esc(city.name);
  const c = clock.calc;
  const td = (i: number) => todaySpan(clock, today, i);
  const tomorrow = clock.addDays(date, 1);
  const highLat = c.seasonalLimits ? ` and seasonal limits for ${name}'s high latitude` : "";
  const otherMethods = c.method === "NorthAmerica"
    ? `the Muslim World League and Karachi methods put Fajr at 18°, which gives an earlier time than the ${c.fajrAngle}° used here.`
    : c.fajrAngle === 18
    ? "ISNA puts Fajr at 15°, which gives a later time, while the Muslim World League and Karachi methods use 18° like this page but handle high latitudes differently."
    : `the Muslim World League and Karachi methods put Fajr at 18° and ISNA at 15°, against ${c.fajrAngle}° here.`;
  const week = weekTable(view, `Fajr and sunrise in ${name}, next 7 days`, [["Fajr", (d) => clock.day(d).t[0]], ["Sunrise", (d) => clock.day(d).t[1]]]);
  const how = view.published
    ? `<p>Fajr here is the start time ${esc(standardRef(standard))} publishes. Fajr is also often spelled Fajar.</p>
    <p>Other websites may show a different Fajr time for ${name} because they calculate it from a fixed sun angle instead of taking it from the timetable. The difference is usually a few minutes, and widest in summer.</p>`
    : `<p>These times use the ${view.methodName} method, with Fajr when the sun is ${c.fajrAngle}° below the horizon${highLat}. Fajr is also often spelled Fajar.</p>
    <p>Other websites may show a different Fajr time for ${name} because they use other calculation methods: ${otherMethods}${midsummerMaxDepression(city) < c.fajrAngle ? ` The gap is widest in summer, when the sky over ${name} never gets fully dark.` : ""}</p>`;
  return foldSection(today, clock, 0, "fajr", `Fajr time in ${name} today`,
    `<p class="answer">Fajr in ${name} today, <span data-today-date>${clock.longDate(date)}</span>, is at ${td(0)}; sunrise is at ${td(1)}, so Fajr ends then. Tomorrow, ${clock.longDate(tomorrow)}, Fajr is at ${clock.time(clock.day(tomorrow).t[0])}.</p>`,
    "Fajr", `${week}
    ${how}`);
}

function maghribCard(view: View): string {
  const { input, clock, today } = view;
  const { city, date } = input;
  const name = esc(city.name);
  const td = (i: number) => todaySpan(clock, today, i);
  const tomorrow = clock.addDays(date, 1);
  const mAdj = clock.calc.adjustments.find((a) => a.prayer === "Maghrib")?.minutes ?? 0;
  const week = weekTable(view, `Maghrib and Isha in ${name}, next 7 days`, [["Maghrib", (d) => clock.day(d).t[4]], ["Isha", (d) => clock.day(d).t[5]]]);
  const begins = view.published
    ? "Maghrib begins once the sun has fully set, at the time the timetable lists"
    : `Maghrib begins once the sun has fully set${mAdj ? `; the ${view.methodName} method adds ${mAdj} minutes to sunset as a precaution` : ""}`;
  return foldSection(today, clock, 4, "maghrib", `Maghrib time in ${name} today`,
    `<p class="answer">Maghrib in ${name} today, <span data-today-date>${clock.longDate(date)}</span>, is at ${td(4)}. This is also iftar time: when fasting, the fast is opened at Maghrib. Tomorrow, ${clock.longDate(tomorrow)}, Maghrib is at ${clock.time(clock.day(tomorrow).t[4])}.</p>`,
    "Maghrib", `${week}
    <p>${begins}. It lasts until Isha begins, at ${td(5)} today. It is recommended to pray it soon after it begins.</p>
    <p>Because every calculation method works from sunset, Maghrib times for ${name} usually differ by only a few minutes between apps, websites and mosques, mostly from the precaution each one adds.</p>`);
}

function ishaCard(view: View): string {
  const { input, clock, today, standard } = view;
  const { city, date } = input;
  const name = esc(city.name);
  const c = clock.calc;
  const td = (i: number) => todaySpan(clock, today, i);
  const tomorrow = clock.addDays(date, 1);
  const highLat = c.seasonalLimits ? ` and seasonal limits for ${name}'s high latitude` : "";
  const maxDepression = midsummerMaxDepression(city);
  const week = weekTable(view, `Isha and the next Fajr in ${name}, next 7 days`, [["Isha", (d) => clock.day(d).t[5]], ["Next Fajr", (d) => clock.day(clock.addDays(d, 1)).t[0]]]);
  const how = view.published
    ? `<p>Isha here is the start time ${esc(standardRef(standard))} publishes. The time for Isha lasts until Fajr, and it is recommended not to delay it past the middle of the night.</p>
    <p>Isha times for ${name} differ between sites most in summer, when the sky stays light late: apps calculate Isha from a sun angle, while the timetable sets it by its own rule.</p>`
    : `<p>These times use the ${view.methodName} method, with Isha when the sun is ${c.ishaAngle}° below the horizon${highLat}. The time for Isha lasts until Fajr, and it is recommended not to delay it past the middle of the night.</p>
    <p>Isha times for ${name} differ between sites most in summer.${maxDepression < c.ishaAngle ? ` Around midsummer the sun never sinks ${c.ishaAngle}° below the horizon in ${name}, so each method falls back on a high-latitude rule, such as the middle of the night or one-seventh of the night.` : ""} Methods also use different Isha angles: ${c.method === "NorthAmerica" ? `the Muslim World League uses 17° and Karachi 18°, against ${c.ishaAngle}° here` : "the Muslim World League uses 17°, ISNA 15° and Karachi 18°"}, while Umm al-Qura sets Isha 90 minutes after Maghrib.</p>`;
  return foldSection(today, clock, 5, "isha", `Isha time in ${name} today`,
    `<p class="answer">Isha in ${name} today, <span data-today-date>${clock.longDate(date)}</span>, is at ${td(5)}. Tomorrow, ${clock.longDate(tomorrow)}, Isha is at ${clock.time(clock.day(tomorrow).t[5])}.</p>`,
    "Isha", `${week}
    ${how}
    <p class="standard-isha">${esc(standard.isha)}</p>`);
}

function methodCard(view: View): string {
  const { input, clock, standard } = view;
  const name = esc(input.city.name);
  const c = clock.calc;
  const asr = `Both times shown: Shafi'i, Maliki and Hanbali (shadow equal to an object’s length) and Hanafi (shadow twice its length). The ${standard.asrFirst === "Hanafi" ? "Hanafi" : "Shafi'i"} time is listed first.`;
  if (view.published) {
    const retrieved = input.timetable ? `, read from its published timetable on ${clock.longDate(input.timetable.retrieved)}` : "";
    const gaps = input.timetable && Object.values(input.timetable.days).some((row) => row.includes(null));
    return `
    <div class="card">
    <h2>Where do ${name} prayer times come from?</h2>
    <dl class="method">
      <div><dt>Source</dt><dd>${esc(standardRef(standard).replace(/^the /, "The "))}${retrieved}</dd></div>
      <div><dt>Times</dt><dd>Published start times, not calculated.${gaps ? ` A column the timetable leaves out is calculated with the ${view.methodName} method.` : ""}</dd></div>
      <div><dt>Asr</dt><dd>${asr}</dd></div>
      <div><dt>Not yet published</dt><dd>Days the timetable does not cover yet are estimated from its previous year, moved by whole days so clock changes land right, or calculated when there is no earlier year. They are marked ${ESTIMATE_MARK}.</dd></div>
    </dl>
    </div>`;
  }
  const adj = c.adjustments.map((a) => `${a.prayer} ${a.minutes > 0 ? "+" : ""}${a.minutes} min`).join(", ");
  return `
    <div class="card">
    <h2>How are ${name} prayer times calculated?</h2>
    <dl class="method">${standard.kind === "gps" ? "" : `
      <div><dt>Standard</dt><dd>${esc(standard.name)}</dd></div>`}
      <div><dt>Method</dt><dd>${view.methodName}</dd></div>
      <div><dt>Fajr angle</dt><dd>${c.fajrAngle}° below the horizon</dd></div>
      <div><dt>Isha angle</dt><dd>${c.ishaAngle}° below the horizon</dd></div>
      <div><dt>Asr</dt><dd>${asr}</dd></div>
      <div><dt>High latitudes</dt><dd>${c.seasonalLimits ? "Moonsighting Committee seasonal limits on Fajr and Isha" : c.highLatitudeRule === "MiddleOfTheNight" ? "Middle of the night rule" : c.highLatitudeRule === "SeventhOfTheNight" ? "Seventh of the night rule" : "Twilight angle rule"}</dd></div>${adj ? `\n      <div><dt>Adjustments</dt><dd>${adj}</dd></div>` : ""}
    </dl>
    </div>`;
}

const MOSQUE_COLUMNS: readonly { readonly key: PrayerKey; readonly name: string }[] = PRAYERS
  .filter((p): p is (typeof PRAYERS)[number] & { key: PrayerKey } => p.key !== "sunrise");

function mosquesCard(section: MosqueSection, clock: CityClock, cityName: string, date: LocalDate): string {
  if (section.kind !== "live" || !section.mosques.length) return "";
  const hasAthan = section.mosques.some((m) => MOSQUE_COLUMNS.some((p) => m.athan[p.key]));
  return `
    <div class="card">
    <h2 id="mosques">Mosques in ${esc(cityName)} — Jama'ah times</h2>
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

// London launches alone (23 Oct 2026): the hub and country pages are not public yet, so the page
// links to neither, in markup or schema. Flip when they ship.
const HUBS_LIVE = false;

// Parked (23 Oct 2026): the embed card is hidden until we revisit it; the /widget/ route still serves.
const SHOW_WIDGET_CARD = false;
// Parked (23 Oct 2026): the nearby-cities card is hidden too.
const SHOW_NEARBY_CARD = false;

function widgetCard(input: PageInput): string {
  const { city, links } = input;
  const embedCode = `<iframe src="${links.widgetEmbed}" title="${city.name} prayer times" width="320" height="330" style="border:0;max-width:100%" loading="lazy"></iframe>`;
  return `
    <div class="card">
    <h2 id="widget">Add ${esc(city.name)} prayer times to your website</h2>
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
    <h2>Prayer times near ${esc(city.name)}</h2>
    <ul class="nearby">
      ${links.nearby.map((n) => `<li><a href="${n.href}">${esc(n.name)}</a></li>`).join("\n      ")}
    </ul>
    <p class="hub-link"><a href="${links.country}">All prayer times in ${esc(country.name)}</a></p>
    </div>
`;
}

function sourceLine(view: View): string {
  const { input, clock, standard, today } = view;
  const ref = esc(standardRef(standard));
  const what = standard.kind === "gps"
    ? `Times calculated with ${ref}`
    : view.published
    ? `Times follow ${ref}${today.origin === "published" ? "" : " · Today's times are an estimate"}`
    : `Times follow ${ref}, calculated with the ${view.methodName} method`;
  return `<p class="source-line">Updated <time datetime="${input.date}">${clock.longDate(input.date)}</time> · ${what}</p>`;
}

function seoSection(view: View): string {
  const { input, clock } = view;
  const { city, country, date, links } = input;
  const name = esc(city.name);
  const [y, mo] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
  const thisMonth = monthTable(view, y, mo);
  let nextMonthHtml = "";
  let nextMonthNote = "";
  if (clock.daysInMonth(y, mo) - Number(date.slice(8, 10)) < 10) {
    const t = mo === 12 ? monthTable(view, y + 1, 1) : monthTable(view, y, mo + 1);
    nextMonthNote = `\n    ${t.note}`;
    nextMonthHtml = `\n    <h3>${name} prayer timetable | ${t.label}</h3>\n    ${t.html}`;
  }

  return `<section class="seo" id="seo">
    <div class="card">
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>${HUBS_LIVE ? `<a href="${links.hub}">Prayer Times</a>` : "Prayer Times"}</li>
          <li>${HUBS_LIVE ? `<a href="${links.country}">${esc(country.name)}</a>` : esc(country.name)}</li>
          <li aria-current="page">${name}</li>
        </ol>
      </nav>
    <h1>Prayer Times in ${name}, ${esc(country.name)}</h1>
    <p class="answer" id="answer" data-date="${date}"><span class="a-lead">Salah (namaz) times in ${name} today</span><span class="sr-only">, </span><span class="a-date"><span data-today-date>${clock.longDate(date)}</span> · <span data-today-hijri>${clock.hijri(date).long}</span></span><span class="sr-only">: </span><span class="a-times">${heroTimes(view)}</span><span class="sr-only">. </span></p>
    ${sourceLine(view)}
    </div>

    <div class="card">
    <h2 id="timetable">${name} prayer timetable | ${thisMonth.label}</h2>
    <div class="v-clip" id="tt-clip">
    ${thisMonth.html}${nextMonthHtml}
    </div>
    <button type="button" class="v-more-btn" id="tt-more" aria-controls="tt-clip" aria-expanded="false" hidden>Show the Full ${esc(thisMonth.label.split(" ")[0])} Timetable</button>
    ${thisMonth.note}${nextMonthNote}
    </div>

    <div class="card">${fajrCard(view)}${maghribCard(view)}${ishaCard(view)}
    </div>
${mosquesCard(input.mosques, clock, city.name, date)}
${SHOW_WIDGET_CARD ? widgetCard(input) : ""}

    <div class="card">
    <h2>Frequently asked questions</h2>
    <div class="faq">
      ${view.faq.map((f) => `<details class="faq-item" name="faq">
        <summary><h3 class="faq-h">${esc(f.question)}</h3></summary>
        <div class="faq-a"><p>${f.answerHtml}</p></div>
      </details>`).join("\n      ")}
    </div>
    </div>
${methodCard(view)}
${SHOW_NEARBY_CARD ? nearbyCard(input) : ""}  </section>`;
}
