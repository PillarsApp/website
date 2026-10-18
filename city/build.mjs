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
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import adhan from 'adhan';
import { SITE, COUNTRIES, CITIES, DEFAULT_CLOCK } from './cities.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1]]);
  return a;
}, []));
const city = CITIES[args.city || 'london'];
if (!city) throw new Error('Unknown city: ' + args.city);
const country = COUNTRIES[city.country];
const tz = city.timezone;
const clock = country.clock || DEFAULT_CLOCK;
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
// Display formats follow the country clock. fmt mirrors city.js formatTime (the
// app's "HH:mm" / "h:mm a", incl. its 12:00 quirk); tfmt is the compact form for
// tables (12-hour without AM/PM, as printed mosque timetables do).
function fmtHM(h, mi, compact) {
  if (clock === 24 || (!compact && h === 12 && mi === 0)) return `${pad(h)}:${pad(mi)}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(mi)}${compact ? '' : (h < 12 ? ' AM' : ' PM')}`;
}
const fmt = (ms) => { const p = partsOf(ms); return fmtHM(p.h, p.mi, false); };
const tfmt = (ms) => { const p = partsOf(ms); return fmtHM(p.h, p.mi, true); };
// "HH:mm" strings from the masjid-times API, already mosque-local.
const sfmt = (v, compact = true) => { const m = /^(\d{1,2}):(\d{2})/.exec(v || ''); return m ? fmtHM(+m[1], +m[2], compact) : '–'; };
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
const asrHanafi = (ymd) => dayFor(ymd, calcHanafi)[3];
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
const todayHanafi = asrHanafi(date);
const timesText = NAMES.map((n, i) => `${n} ${fmt(today[i])}${i === 3 ? ` (Hanafi ${fmt(todayHanafi)})` : ''}`).join(', ');

// ---------- Mosques in the city (masjid-times API at build time, else sample) ----------
const slugify = (s) => s.replace(/\s*\([^)]*\)/g, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s) => (s === s.toUpperCase() && s !== s.toLowerCase()
  ? s.toLowerCase().replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1)) : s);
async function loadMosques() {
  const cfg = city.mosques;
  if (!cfg) return null;
  const secret = process.env.MASJID_TIMES_SECRET;
  if (secret) {
    try {
      const get = async (path, q) => {
        const r = await fetch(`${SITE.masjidTimesApi}${path}?${new URLSearchParams(q)}`, { headers: { 'X-App-Secret': secret } });
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
        const body = await r.json();
        if (!body || typeof body.data !== 'object') throw new Error(`unexpected shape for ${path}`);
        return body.data;
      };
      const near = (await get('/v1/masjids/nearby', { lat: city.lat, lng: city.lng, radius_km: cfg.radiusKm, limit: 50 })).masjids || [];
      const ok = near.filter((m) => m.active !== false && m.times_reliable !== false);
      const byId = new Map(ok.map((m) => [m.id, m]));
      const picked = (cfg.featured || []).map((id) => byId.get(id)).filter(Boolean);
      for (const m of ok) if (picked.length < cfg.max && !picked.includes(m)) picked.push(m);
      const out = [];
      for (const m of picked.slice(0, cfg.max)) {
        const tt = await get(`/v1/masjids/${m.id}/timetable`, { from: date, to: date });
        const day = (tt.days || []).find((d) => d.date === date);
        if (!day || tt.inactive || tt.times_reliable === false) continue;
        out.push({ name: titleCase(m.name), address: m.address, zipcode: m.zipcode, athan: day.athan || {}, iqamah: day.iqamah || {}, jummah: day.jummah || [] });
      }
      if (out.length) return { sample: false, mosques: out };
      console.warn('masjid-times: no mosque times returned; using sample data');
    } catch (e) {
      console.warn(`masjid-times: ${e.message}; using sample data`);
    }
  } else {
    console.warn('MASJID_TIMES_SECRET not set; mosque section uses sample data');
  }
  const sample = JSON.parse(readFileSync(resolve(here, cfg.sample), 'utf8'));
  return { sample: true, mosques: sample.mosques };
}
const mosqueData = await loadMosques();
const mosques = (mosqueData ? mosqueData.mosques : []).map((m) => {
  const slug = slugify(m.name);
  const street = m.address || '';
  const address = m.zipcode && !street.includes(m.zipcode) ? `${street}, ${m.zipcode}` : street;
  return { ...m, slug, address, url: `${SITE.origin}${SITE.mosquePath(city.country, city.slug, slug)}`, path: SITE.mosquePath(city.country, city.slug, slug) };
});

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
if (mosques.length && !mosqueData.sample) {
  ld['@graph'].push({
    '@type': 'ItemList', '@id': `${url}#mosques`, name: `Mosques in ${city.name}`,
    itemListElement: mosques.map((m, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: {
        '@type': 'Mosque', name: m.name, url: m.url,
        address: { '@type': 'PostalAddress', streetAddress: m.address, ...(m.zipcode ? { postalCode: m.zipcode } : {}), addressLocality: city.name, addressCountry: country.code },
      },
    })),
  });
}
const cityData = { name: city.name, country: country.code, clock, lat: city.lat, lng: city.lng, timezone: tz, method: city.method, madhab: city.madhab, highLatitudeRule: city.highLatitudeRule };
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
const dateBlock = `<div class="date-greg" id="date-greg">${appDate(date)}</div>
        <div class="date-hijri" id="date-hijri">${hijriLong(date)}</div>`;
let list = '<li class="sep" aria-hidden="true"></li>';
// Seven rows like city.js: both Asr times in time order.
const replicaRows = [];
NAMES.forEach((n, i) => { replicaRows.push([n, today[i]]); if (i === 3) replicaRows.push(['Asr (Hanafi)', todayHanafi]); });
for (const [n, t] of replicaRows) {
  list += `<li class="row"><span class="name">${n}</span> <span class="t">${fmt(t)}</span></li><li class="sep" aria-hidden="true"></li>`;
}
const listCaption = `<p class="list-caption" id="list-caption">${esc(city.listCaption || `Calculated using the ${methodName} method`)}</p>`;
const chip = `<span class="chip-name" id="chip-name">&nbsp;${esc(city.name)} Prayer Times</span>`;
const banner = `<div class="ab-title" id="ab-title">${SITE.name} App: ${esc(city.name)} Prayer Times</div>`;

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
    rows += `\n        <tr data-date="${ymd}"${isToday ? ' class="today" aria-current="date"' : ''}><th scope="row">${shortDay(ymd)}<span class="hj" title="${h.d} ${HIJRI_MONTHS[h.m]} ${h.y}">${h.d} ${HIJRI_SHORT[h.m]}</span></th>${t.map((x, i) => (i === 3 ? `<td>${tfmt(x)}<span class="sub">${tfmt(asrHanafi(ymd))}</span></td>` : `<td>${tfmt(x)}</td>`)).join('')}</tr>`;
  }
  const label = monthYear(first);
  return { label, html: `<div class="table-wrap">
      <table class="timetable">
        <caption>${esc(city.name)} prayer times for ${label}, in ${country.name} local time (${clock}-hour clock). Asr shows the Shafi'i, Maliki and Hanbali time with the Hanafi time below it.${dstNote}</caption>
        <thead><tr><th scope="col">Date</th>${NAMES.map((n, i) => `<th scope="col">${n}${i === 3 ? '<span class="sub">Hanafi</span>' : ''}</th>`).join('')}</tr></thead>
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
  nextMonthHtml = `\n    <h3>${esc(city.name)} prayer timetable | ${t.label}</h3>\n    ${t.html}`;
}

// FAQ numbers
const hanafiAsr = todayHanafi;
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
// data-today="6" is the Hanafi Asr; city.js refreshes these if the visitor's day differs.
const td = (i) => `<span data-today="${i}">${fmt(i === 6 ? todayHanafi : today[i])}</span>`;
const lt = city.localTimetable;

const todayList = NAMES.map((n, i) => `${n} ${td(i)}${i === 3 ? ` (Hanafi ${td(6)})` : ''}`).join(', ');
// FAQ answers are HTML (the namaz one carries live data-today spans); text answers are escaped here.
const faq = [
  [`What are the namaz timings in ${city.name} today?`,
    `${esc(city.name)} namaz timings today are ${todayList}. The list at the top of this page shows them with the current prayer, and the arrows step to other days.`, true],
  [`What time is Fajr in ${city.name} today?`,
    `Fajr in ${esc(city.name)} today begins at ${td(0)} and lasts until sunrise at ${td(1)}. When fasting, suhoor ends as Fajr begins, and the fast is opened at Maghrib, ${td(4)}.`, true],
  [`Why do ${city.name} prayer times differ between apps and mosques?`,
    `Apps and mosques use different calculation methods. This page uses the ${methodName} method with ${p0.fajrAngle === p0.ishaAngle ? `Fajr and Isha both at ${p0.fajrAngle}°` : `Fajr at ${p0.fajrAngle}° and Isha at ${p0.ishaAngle}°`}${lt ? `, while many ${city.name} mosques follow the ${lt.name}` : ''}. The difference is usually a few minutes for Dhuhr, Asr and Maghrib and larger for Fajr and Isha.`],
  [`What is the Asr time in ${city.name} for Hanafis?`,
    `${city.name} has two Asr times. Today the Hanafi Asr in ${city.name} is at ${fmt(hanafiAsr)}, ${Math.round((hanafiAsr - today[3]) / 60000)} minutes after the Shafi'i Asr at ${fmt(today[3])}. Hanafi Asr starts when an object's shadow is twice its length; the Shafi'i, Maliki and Hanbali time starts at once its length.`],
  [`What time is Jumu'ah in ${city.name}?`,
    `Jumu'ah is prayed in place of Dhuhr. On ${longDate(fri)} Dhuhr in ${city.name} begins at ${fmt(friDhuhr)}. Each mosque sets its own khutbah and jamaat times, so check with the mosque you attend.`],
  [`Why is Isha so late in ${city.name} in summer?`,
    `${city.name} is far enough north that the sky barely gets fully dark around midsummer. On ${longDate(mid)}, Fajr is at ${fmt(midT[0])}, Maghrib at ${fmt(midT[4])} and Isha at ${fmt(midT[5])}. The ${methodName} method applies seasonal limits so Isha and Fajr stay at a practical time.`],
];
if (clockChange) {
  faq.push([`Are these times in GMT or BST?`,
    `All times are ${country.name} local time, currently ${nowAbbr}. The clocks change on ${longDate(clockChange)}; from that day the times are in ${tzAbbr(noonUTC(clockChange))}, and the timetable already accounts for it.`]);
}

const P5 = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const K5 = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const mosquesHtml = !mosques.length ? '' : `
    <h2 id="mosques">Mosques in ${esc(city.name)}: prayer and jamaat times today</h2>
    <p>Start (athan) and jamaat (congregation) times for ${longDate(date)}, as published by each mosque. Mosques set their own times, so check with the mosque before you go.</p>${mosqueData.sample ? `
    <p class="note">Sample times for layout only. These are not the mosques' real timetables.</p>` : ''}
    <!-- PROVISIONAL hrefs: /mosques/{country}/{city}/{slug}/ is not a live route yet. -->
    <ul class="mosques">
      ${mosques.map((m) => `<li>
        <h3><a href="${m.path}">${esc(m.name)}</a></h3>
        ${m.address ? `<p class="addr">${esc(m.address)}</p>` : ''}
        <table class="mtimes">
          <thead><tr><td></td>${P5.map((n) => `<th scope="col">${n}</th>`).join('')}</tr></thead>
          <tbody>
            <tr><th scope="row">Athan</th>${K5.map((k) => `<td>${sfmt(m.athan[k])}</td>`).join('')}</tr>
            <tr><th scope="row">Jamaat</th>${K5.map((k) => `<td>${sfmt(m.iqamah[k])}</td>`).join('')}</tr>
          </tbody>
        </table>${m.jummah && m.jummah.length ? `
        <p class="jummah">Jumu'ah ${m.jummah.map((j) => sfmt(j, false)).join(', ')}</p>` : ''}
      </li>`).join('\n      ')}
    </ul>
`;
const seo = `<section class="seo" id="seo">
    <nav class="crumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="${SITE.hubPath}">Prayer Times</a></li>
        <li><a href="/prayer-times/${city.country}/">${esc(country.name)}</a></li>
        <li aria-current="page">${esc(city.name)}</li>
      </ol>
    </nav>

    <h1>Prayer Times in ${esc(city.name)}, ${esc(country.name)}</h1>
    <p class="answer" id="answer" data-date="${date}">Salah (namaz) times in ${esc(city.name)} today, <span data-today-date>${longDate(date)}</span> (<span data-today-hijri>${hijriLong(date)}</span>): ${todayList}. ${methodName} method · Updated <time datetime="${isoLocal(updatedMs)}">${fmt(updatedMs)} ${tzAbbr(updatedMs)}</time></p>
    <p>Prayer times for ${esc(city.name)}, ${esc(country.name)} (${tz}, ${nowAbbr}), recalculated every day with the same engine and settings as the ${SITE.name} app. Asr is given twice: the Shafi'i, Maliki and Hanbali time (shadow equal to an object's length) and the later Hanafi time (shadow twice its length).</p>

    <div class="card">
    <h2 id="timetable">${esc(city.name)} prayer timetable | ${thisMonth.label}</h2>
    ${thisMonth.html}${nextMonthHtml}
    </div>
${mosquesHtml}
    <div class="card">
    <h2>How are ${esc(city.name)} prayer times calculated?</h2>
    <dl class="method">
      <div><dt>Method</dt><dd>${methodName}</dd></div>
      <div><dt>Fajr angle</dt><dd>${p0.fajrAngle}° below the horizon</dd></div>
      <div><dt>Isha angle</dt><dd>${p0.ishaAngle}° below the horizon</dd></div>
      <div><dt>Asr</dt><dd>Both times shown: Shafi'i, Maliki and Hanbali (shadow equal to an object’s length) and Hanafi (shadow twice its length). The app view at the top shows the ${city.madhab === 'Hanafi' ? 'Hanafi' : "Shafi'i"} Asr, the app’s default.</dd></div>
      <div><dt>High latitudes</dt><dd>${city.method === 'MoonsightingCommittee' ? 'Moonsighting Committee seasonal limits on Fajr and Isha' : 'Twilight angle rule'}</dd></div>${adj ? `\n      <div><dt>Adjustments</dt><dd>${adj}</dd></div>` : ''}
      <div><dt>Time zone</dt><dd>${tz} (${country.name} local time)</dd></div>
      <div><dt>Engine</dt><dd>adhan, the same calculation the ${SITE.name} app uses</dd></div>
    </dl>
    </div>
${lt ? `
    <h2>Which timetable do ${esc(city.name)} mosques follow?</h2>
    <p>${esc(lt.note)}</p>
` : ''}
    <h2>Frequently asked questions</h2>
    <div class="faq">
      ${faq.map(([q, a, raw], i) => `<details class="faq-item"${i === 0 ? ' open' : ''}>
        <summary><h3 class="faq-h">${esc(q)}</h3></summary>
        <div class="faq-a"><p>${raw ? a : esc(a)}</p></div>
      </details>`).join('\n      ')}
    </div>

    <h2>Prayer times near ${esc(city.name)}</h2>
    <!-- PROVISIONAL hrefs: same /prayer-times/{country}/{city}/ scheme; these pages do not exist yet. -->
    <ul class="nearby">
      ${city.nearby.map(([n, s]) => `<li><a href="/prayer-times/${city.country}/${s}/">${esc(n)}</a></li>`).join('\n      ')}
    </ul>
    <p class="hub-link"><a href="/prayer-times/${city.country}/">All prayer times in ${esc(country.name)}</a></p>
  </section>`;

// Headings in Title Case (first letter of every word; existing capitals such as
// BST, GMT and prayer names are left as they are). Text only, never tags/attributes.
const titleWords = (t) => t.replace(/(^|[\s(])([a-z])/g, (_, p, c) => p + c.toUpperCase());
const titleHeadings = (h) => h.replace(/<(h[1-3])([^>]*)>([\s\S]*?)<\/\1>/g, (_, tag, attrs, inner) =>
  `<${tag}${attrs}>${inner.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : titleWords(part.replace(/\s*—\s*/g, ' | ')))).join('')}</${tag}>`);

// ---------- write ----------
let html = readFileSync(outPath, 'utf8');
function region(name, content) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
  if (!re.test(html)) throw new Error('Missing region ' + name);
  html = html.replace(re, (_, a, b) => `${a}\n${content}\n${b}`);
}
// Cache-bust the page's own CSS/JS so a rebuilt page never runs against a stale script.
const ver = (f) => createHash('sha1').update(readFileSync(resolve(here, f))).digest('hex').slice(0, 8);
html = html.replace(/href="city\.css(\?v=[^"]*)?"/, `href="city.css?v=${ver('city.css')}"`)
  .replace(/src="city\.js(\?v=[^"]*)?"/, `src="city.js?v=${ver('city.js')}"`);
html = html.replace(/<ul class="list" id="list"[^>]*>/, `<ul class="list" id="list" aria-label="${esc(city.name)} prayer times today">`);
html = html.replace(/<html lang="[^"]*">/, `<html lang="${country.lang}">`);
region('head', head);
region('chip', chip);
region('date', dateBlock);
region('list', list);
region('caption', listCaption);
region('seo', titleHeadings(seo));
region('banner', banner);
writeFileSync(outPath, html);
console.log(`Built ${city.name} for ${date}: ${timesText} (updated ${isoLocal(updatedMs)})`);
