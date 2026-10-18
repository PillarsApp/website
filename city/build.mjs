// Pre-renders a city prayer times page so the times are in the HTML before any
// JavaScript runs (crawlers and AI fetchers do not run JS). Same engine and
// settings as city.js and the app: adhan, the city's method/madhab/high-latitude
// rule, times shown in the city's time zone.
//
//   cd city && npm install
//   node build.mjs [--city london] [--date YYYY-MM-DD] [--out index.html]
//
// Rewrites the <!-- build:NAME --> ... <!-- /build:NAME --> regions of the page
// in place. Run daily shortly after local midnight (the "Updated" stamp, the
// meta description and dateModified all come from the run).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import adhan from 'adhan';
import { SITE, COUNTRIES, CITIES } from './cities.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1]]);
  return a;
}, []));
const city = CITIES[args.city || 'london'];
if (!city) throw new Error('Unknown city: ' + args.city);
const country = COUNTRIES[city.country];
const tz = city.timezone;
const outPath = resolve(here, args.out || 'index.html');

const NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Awwal', 'Jumada al-Thani',
  'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhul-Qa'dah", 'Dhul-Hijjah'];
const HIJRI_SHORT = ['Muh', 'Saf', 'Rab I', 'Rab II', 'Jum I', 'Jum II', 'Raj', 'Sha', 'Ram', 'Shaw', 'Dhul Q', 'Dhul H'];
const METHOD_LABEL = {
  MoonsightingCommittee: 'Moonsighting Committee', MuslimWorldLeague: 'Muslim World League',
  NorthAmerica: 'ISNA (North America)', UmmAlQura: 'Umm al-Qura', Egyptian: 'Egyptian General Authority',
  Karachi: 'University of Islamic Sciences, Karachi', Dubai: 'Dubai', Kuwait: 'Kuwait', Qatar: 'Qatar',
  Singapore: 'Singapore', Turkey: 'Diyanet (Turkey)',
};

// ---------- Time helpers (city-local) ----------
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function partsOf(ms) {
  const p = {};
  partsFmt.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
const offsetMin = (ms) => { const p = partsOf(ms); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000); };
function zoned(y, mo, d, h, mi) { const g = Date.UTC(y, mo - 1, d, h, mi); return g - offsetMin(g - offsetMin(g) * 60000) * 60000; }
const ymdOf = (ms) => { const p = partsOf(ms); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
const ymdParts = (ymd) => ymd.split('-').map(Number);
function addDays(ymd, n) { const [y, m, d] = ymdParts(ymd); const t = new Date(Date.UTC(y, m - 1, d + n, 12)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
const hm = (ms) => { const p = partsOf(ms); return `${pad(p.h)}:${pad(p.mi)}`; };
const tzAbbr = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName').value;
function isoLocal(ms) {
  const p = partsOf(ms), o = offsetMin(ms), s = o < 0 ? '-' : '+', a = Math.abs(o);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:00${s}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
const noonUTC = (ymd) => { const [y, m, d] = ymdParts(ymd); return new Date(Date.UTC(y, m - 1, d, 12)); };
const fmtUTC = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts });
const longDate = (ymd) => fmtUTC({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(noonUTC(ymd)).replace(',', '');
const appDate = (ymd) => fmtUTC({ weekday: 'long', day: 'numeric', month: 'long' }).format(noonUTC(ymd)).replace(',', '');
const shortDay = (ymd) => fmtUTC({ weekday: 'short', day: 'numeric' }).format(noonUTC(ymd)).replace(',', '');
const monthYear = (ymd) => fmtUTC({ month: 'long', year: 'numeric' }).format(noonUTC(ymd));
const hijriFmt = new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric' });
function hijri(ymd) {
  const p = {};
  hijriFmt.formatToParts(noonUTC(ymd)).forEach((x) => { p[x.type] = x.value; });
  return { d: parseInt(p.day, 10), m: parseInt(p.month, 10) - 1, y: parseInt(p.year, 10) };
}
const hijriLong = (ymd) => { const h = hijri(ymd); return `${h.d} ${HIJRI_MONTHS[h.m]} ${h.y}`; };

// ---------- Prayer times: identical to city.js ----------
const coords = new adhan.Coordinates(city.lat, city.lng);
function params(madhab) {
  const p = adhan.CalculationMethod[city.method]();
  p.madhab = adhan.Madhab[madhab];
  p.highLatitudeRule = adhan.HighLatitudeRule[city.highLatitudeRule];
  return p;
}
const calc = params(city.madhab);
const calcHanafi = params('Hanafi');
function dayFor(ymd, p = calc) {
  const [y, m, d] = ymdParts(ymd);
  const pt = new adhan.PrayerTimes(coords, new Date(y, m - 1, d), p);
  return KEYS.map((k) => pt[k].getTime());
}

// ---------- Inputs for this run ----------
const now = Date.now();
const date = args.date || ymdOf(now);
const updatedMs = date === ymdOf(now) ? now : zoned(...ymdParts(date), 0, 5);
const today = dayFor(date);
const url = `${SITE.origin}/prayer-times/${city.country}/${city.slug}/`;
const hubUrl = `${SITE.origin}${SITE.hubPath}`;
const countryUrl = `${SITE.origin}/prayer-times/${city.country}/`;
const methodName = METHOD_LABEL[city.method] || city.method;
const asrSchool = city.madhab === 'Hanafi' ? 'Hanafi Asr' : "Shafi'i Asr";
const timesText = NAMES.map((n, i) => `${n} ${hm(today[i])}`).join(', ');

// ---------- head ----------
const title = `${city.name} Prayer Times Today – Fajr, Dhuhr, Asr, Maghrib, Isha | ${SITE.name}`;
const description = `${city.name} prayer times today, ${longDate(date)}: ${timesText}. Monthly timetable and calculation method.`;
const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${SITE.origin}/#organization`, name: SITE.name, url: `${SITE.origin}/`, logo: SITE.logo },
    {
      '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description,
      inLanguage: country.lang, datePublished: city.datePublished, dateModified: isoLocal(updatedMs),
      publisher: { '@id': `${SITE.origin}/#organization` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
      about: {
        '@type': 'City', name: city.name,
        geo: { '@type': 'GeoCoordinates', latitude: city.lat, longitude: city.lng },
        containedInPlace: { '@type': 'Country', name: country.name },
      },
    },
    {
      '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Prayer Times', item: hubUrl },
        { '@type': 'ListItem', position: 2, name: country.name, item: countryUrl },
        { '@type': 'ListItem', position: 3, name: city.name, item: url },
      ],
    },
  ],
};
const cityData = { name: city.name, country: country.code, lat: city.lat, lng: city.lng, timezone: tz, method: city.method, madhab: city.madhab, highLatitudeRule: city.highLatitudeRule };
const head = `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<!-- PROVISIONAL URL: /prayer-times/{country}/{city}/ is the SEO report's recommended scheme, not yet a live route. -->
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:locale" content="${country.lang.replace('-', '_')}">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(`${city.name} Prayer Times Today`)}">
<meta property="og:description" content="${esc(description)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(`${city.name} Prayer Times Today`)}">
<meta name="twitter:description" content="${esc(description)}">
<script id="city-data" type="application/json">
${JSON.stringify(cityData, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>`;

// ---------- app replica: same markup city.js renders at the build moment ----------
const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>';
const dateBlock = `<div class="date-greg" id="date-greg">${appDate(date)}</div>
        <div class="date-hijri" id="date-hijri">${hijriLong(date)}</div>`;
let list = '<div class="sep"></div>';
for (let i = 0; i < 6; i++) {
  list += `<div class="row" aria-label="${NAMES[i]}, ${hm(today[i])}"><span class="name">${NAMES[i]}</span><span class="t">${hm(today[i])}</span><span class="bell">${BELL}</span></div><div class="sep"></div>`;
}
const chip = `<span class="chip-name" id="chip-name">&nbsp;${esc(city.name)} Prayer Times</span>`;
const banner = `<div class="ab-title" id="ab-title">Get ${esc(city.name)} prayer times on your phone</div>`;

// ---------- below the replica ----------
const [y, mo] = ymdParts(date);
function monthTable(year, month) {
  const first = `${year}-${pad(month)}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let rows = '', dstNote = '';
  for (let d = 1; d <= days; d++) {
    const ymd = `${year}-${pad(month)}-${pad(d)}`;
    const t = dayFor(ymd), h = hijri(ymd);
    const isToday = ymd === date;
    if (d > 1 && tzAbbr(noonUTC(ymd)) !== tzAbbr(noonUTC(addDays(ymd, -1)))) {
      dstNote = ` Clocks change on ${longDate(ymd)}; times from that day are in ${tzAbbr(noonUTC(ymd))}.`;
    }
    rows += `\n        <tr data-date="${ymd}"${isToday ? ' class="today" aria-current="date"' : ''}><th scope="row">${shortDay(ymd)}<span class="hj" title="${h.d} ${HIJRI_MONTHS[h.m]} ${h.y}">${h.d} ${HIJRI_SHORT[h.m]}</span></th>${t.map((x) => `<td>${hm(x)}</td>`).join('')}</tr>`;
  }
  const label = monthYear(first);
  return { label, html: `<div class="table-wrap">
      <table class="timetable">
        <caption>${esc(city.name)} prayer times for ${label}, in ${country.name} local time.${dstNote}</caption>
        <thead><tr><th scope="col">Date</th>${NAMES.map((n) => `<th scope="col">${n}</th>`).join('')}</tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>` };
}
const thisMonth = monthTable(y, mo);
const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
let nextMonthHtml = '';
if (daysInMonth - ymdParts(date)[2] < 10) {   // late in the month: also serve next month
  const nm = mo === 12 ? [y + 1, 1] : [y, mo + 1];
  const t = monthTable(...nm);
  nextMonthHtml = `\n    <h3>${esc(city.name)} prayer timetable — ${t.label}</h3>\n    ${t.html}`;
}

// FAQ numbers
const hanafiAsr = dayFor(date, calcHanafi)[3];
let fri = date; while (noonUTC(fri).getUTCDay() !== 5) fri = addDays(fri, 1);
const friDhuhr = dayFor(fri)[2];
let mid = `${y}-06-21`; if (mid < date) mid = `${y + 1}-06-21`;
const midT = dayFor(mid);
let clockChange = null;
for (let i = 1; i <= 366; i++) {
  const d = addDays(date, i);
  if (tzAbbr(noonUTC(d)) !== tzAbbr(noonUTC(addDays(d, -1)))) { clockChange = d; break; }
}
const p0 = calc;
const adj = Object.entries(p0.methodAdjustments || {}).filter(([, v]) => v).map(([k, v]) => `${k[0].toUpperCase() + k.slice(1)} ${v > 0 ? '+' : ''}${v} min`).join(', ');
const nowAbbr = tzAbbr(today[2]);
const td = (i) => `<span data-today="${i}">${hm(today[i])}</span>`;
const lt = city.localTimetable;

const faq = [
  [`Why do ${city.name} prayer times differ between apps and mosques?`,
    `Apps and mosques use different calculation methods. This page uses the ${methodName} method with ${p0.fajrAngle === p0.ishaAngle ? `Fajr and Isha both at ${p0.fajrAngle}°` : `Fajr at ${p0.fajrAngle}° and Isha at ${p0.ishaAngle}°`}${lt ? `, while many ${city.name} mosques follow the ${lt.name}` : ''}. The difference is usually a few minutes for Dhuhr, Asr and Maghrib and larger for Fajr and Isha.`],
  [`What is the Asr time in ${city.name} for Hanafis?`,
    `Today the Hanafi Asr in ${city.name} is at ${hm(hanafiAsr)}, ${Math.round((hanafiAsr - today[3]) / 60000)} minutes after the Shafi'i Asr at ${hm(today[3])}. Hanafi Asr starts when an object's shadow is twice its length; the Shafi'i, Maliki and Hanbali time starts at once its length.`],
  [`What time is Jumu'ah in ${city.name}?`,
    `Jumu'ah is prayed in place of Dhuhr. On ${longDate(fri)} Dhuhr in ${city.name} begins at ${hm(friDhuhr)}. Each mosque sets its own khutbah and jamaat times, so check with the mosque you attend.`],
  [`Why is Isha so late in ${city.name} in summer?`,
    `${city.name} is far enough north that the sky barely gets fully dark around midsummer. On ${longDate(mid)}, Fajr is at ${hm(midT[0])}, Maghrib at ${hm(midT[4])} and Isha at ${hm(midT[5])}. The ${methodName} method applies seasonal limits so Isha and Fajr stay at a practical time.`],
];
if (clockChange) {
  faq.push([`Are these times in GMT or BST?`,
    `All times are ${country.name} local time, currently ${nowAbbr}. The clocks change on ${longDate(clockChange)}; from that day the times are in ${tzAbbr(noonUTC(clockChange))}, and the timetable already accounts for it.`]);
}

const seo = `<section class="seo" id="seo">
    <nav class="crumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="${SITE.hubPath}">Prayer Times</a></li>
        <li><a href="/prayer-times/${city.country}/">${esc(country.name)}</a></li>
        <li aria-current="page">${esc(city.name)}</li>
      </ol>
    </nav>

    <h1>Prayer Times in ${esc(city.name)}, ${esc(country.name)}</h1>
    <p class="answer" id="answer" data-date="${date}"><span data-today-date>${longDate(date)}</span> · <span data-today-hijri>${hijriLong(date)}</span> · ${NAMES.map((n, i) => `${n} ${td(i)}`).join(' · ')} · ${methodName}, ${asrSchool} · Updated <time datetime="${isoLocal(updatedMs)}">${hm(updatedMs)} ${tzAbbr(updatedMs)}</time></p>
    <p>Prayer times for ${esc(city.name)}, ${esc(country.name)} (${tz}, ${nowAbbr}), recalculated every day with the same engine and settings as the ${SITE.name} app.</p>

    <h2>Salah and namaz times in ${esc(city.name)} today</h2>
    <dl class="today-grid">
      ${NAMES.map((n, i) => `<div><dt>${n}</dt><dd>${td(i)}</dd></div>`).join('\n      ')}
    </dl>

    <h2>What time is Fajr in ${esc(city.name)} today?</h2>
    <p>Fajr in ${esc(city.name)} today begins at ${td(0)} and ends at sunrise, ${td(1)}. Maghrib, the time to open a fast, is at ${td(4)}.</p>

    <h2 id="timetable">${esc(city.name)} prayer timetable — ${thisMonth.label}</h2>
    ${thisMonth.html}${nextMonthHtml}

    <h2>How are ${esc(city.name)} prayer times calculated?</h2>
    <dl class="method">
      <div><dt>Method</dt><dd>${methodName}</dd></div>
      <div><dt>Fajr angle</dt><dd>${p0.fajrAngle}° below the horizon</dd></div>
      <div><dt>Isha angle</dt><dd>${p0.ishaAngle}° below the horizon</dd></div>
      <div><dt>Asr</dt><dd>${city.madhab === 'Hanafi' ? 'Hanafi (shadow twice an object’s length)' : "Shafi'i, Maliki, Hanbali (shadow equal to an object’s length)"}</dd></div>
      <div><dt>High latitudes</dt><dd>${city.method === 'MoonsightingCommittee' ? 'Moonsighting Committee seasonal limits on Fajr and Isha' : 'Twilight angle rule'}</dd></div>${adj ? `\n      <div><dt>Adjustments</dt><dd>${adj}</dd></div>` : ''}
      <div><dt>Time zone</dt><dd>${tz} (${country.name} local time)</dd></div>
      <div><dt>Engine</dt><dd>adhan, the same calculation the ${SITE.name} app uses</dd></div>
    </dl>
${lt ? `
    <h2>Which timetable do ${esc(city.name)} mosques follow?</h2>
    <p>${esc(lt.note)}</p>
` : ''}
    <h2>Frequently asked questions</h2>
    <div class="faq">
      ${faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n      <p>${esc(a)}</p>`).join('\n      ')}
    </div>

    <h2>Prayer times near ${esc(city.name)}</h2>
    <!-- PROVISIONAL hrefs: same /prayer-times/{country}/{city}/ scheme; these pages do not exist yet. -->
    <ul class="nearby">
      ${city.nearby.map(([n, s]) => `<li><a href="/prayer-times/${city.country}/${s}/">${esc(n)}</a></li>`).join('\n      ')}
    </ul>
    <p class="hub-link"><a href="/prayer-times/${city.country}/">All prayer times in ${esc(country.name)}</a></p>
  </section>`;

// ---------- write ----------
let html = readFileSync(outPath, 'utf8');
function region(name, content) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
  if (!re.test(html)) throw new Error('Missing region ' + name);
  html = html.replace(re, (_, a, b) => `${a}\n${content}\n${b}`);
}
html = html.replace(/<html lang="[^"]*">/, `<html lang="${country.lang}">`);
region('head', head);
region('chip', chip);
region('date', dateBlock);
region('list', list);
region('seo', seo);
region('banner', banner);
writeFileSync(outPath, html);
console.log(`Built ${city.name} for ${date}: ${timesText} (updated ${isoLocal(updatedMs)})`);
