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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
const timesSource = city.timesSource || `${methodName} method`;
const todayHanafi = asrHanafi(date);
const timesText = NAMES.map((n, i) => `${n} ${fmt(today[i])}${i === 3 ? ` (Hanafi ${fmt(todayHanafi)})` : ''}`).join(', ');

// ---------- Mosques in the city (masjid-times API at build time, else placeholder) ----------
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
      if (out.length) return { placeholder: false, mosques: out };
      console.warn('masjid-times: no mosque times returned; using placeholder mosques');
    } catch (e) {
      console.warn(`masjid-times: ${e.message}; using placeholder mosques`);
    }
  } else {
    console.warn('MASJID_TIMES_SECRET not set; mosque section uses placeholder mosques');
  }
  if (!cfg.placeholder) return null;
  return { placeholder: true, mosques: cfg.placeholder.mosques.map((m) => ({ athan: {}, jummah: [], ...m })) };
}
const mosqueData = await loadMosques();
// Placeholder mosques (generic dummy names and times) must never reach the real site.
if (process.env.PROD === '1' && mosqueData && mosqueData.placeholder) {
  console.error(`PROD=1: refusing to build ${city.name} with placeholder mosques. Set MASJID_TIMES_SECRET so real mosque times load, or remove the placeholder fallback.`);
  process.exit(1);
}
const mosques = (mosqueData ? mosqueData.mosques : []).map((m) => {
  const slug = slugify(m.name);
  const street = m.address || '';
  const address = m.zipcode && !street.includes(m.zipcode) ? `${street}, ${m.zipcode}` : street;
  return { ...m, slug, address, url: `${SITE.origin}${SITE.mosquePath(city.country, city.slug, slug)}`, path: SITE.mosquePath(city.country, city.slug, slug) };
});

// ---------- head ----------
const title = `${city.name} Prayer Times Today – Salah Times, Fajr to Isha | ${SITE.name}`;
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
if (mosques.length && !mosqueData.placeholder) {
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
const cityData = { name: city.name, place: `${city.name}, ${country.short || country.name}`, country: country.code, clock, lat: city.lat, lng: city.lng, timezone: tz, method: city.method, madhab: city.madhab, highLatitudeRule: city.highLatitudeRule };
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
__CITYDATA__
</script>
<script type="application/ld+json">
__LD__
</script>`;

// ---------- app replica: same markup city.js renders at the build moment ----------
const dateBlock = `<div class="date-greg" id="date-greg">${appDate(date)}</div>
        <div class="date-hijri" id="date-hijri">${hijriLong(date)}</div>`;
let list = '<li class="sep" aria-hidden="true"></li>';
// Six rows like city.js; the Asr row shows the earlier (standard) time, its pill toggles to the later.
const asrToggle = '<span class="asr-toggle" role="group" aria-label="Asr time"><span class="asr-thumb" aria-hidden="true"></span><button type="button" class="asr-opt" data-asr="earlier" aria-pressed="true">Earlier</button><button type="button" class="asr-opt" data-asr="later" aria-pressed="false">Later</button></span>';
const replicaRows = NAMES.map((n, i) => [i === 3 ? `Asr ${asrToggle}` : n, today[i]]);
for (const [n, t] of replicaRows) {
  list += `<li class="row"><span class="name">${n}</span> <span class="t">${fmt(t)}</span></li><li class="sep" aria-hidden="true"></li>`;
}
const chip = `<span class="chip-name" id="chip-name">${esc(city.name)} Prayer Times</span>`;
const banner = `<span class="ab-title" id="ab-title">${SITE.name} App: ${esc(city.name)} Prayer Times</span>`;

// ---------- below the replica ----------
// Decorative section-heading icons: Material outlined versions of the app's Icons.* (filled paths, no strokes); white on the cards.
const ICONS = {
  schedule: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm3.3 14.71L11 12.41V7h2v4.59l3.71 3.71-1.42 1.41z',
  calendar_month: 'M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2zm0 9v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2zm-8 4v2h2v-2zm4 0v2h2v-2z',
  mosque: 'M24 7c0-1.1-2-3-2-3s-2 1.9-2 3c0 .74.4 1.38 1 1.72V13h-2v-2c0-.95-.66-1.74-1.55-1.94.34-.58.55-1.25.55-1.97 0-1.31-.65-2.53-1.74-3.25L12 1 7.74 3.84C6.65 4.56 6 5.78 6 7.09c0 .72.21 1.39.55 1.97C5.66 9.26 5 10.05 5 11v2H3V8.72c.6-.34 1-.98 1-1.72 0-1.1-2-3-2-3S0 5.9 0 7c0 .74.4 1.38 1 1.72V21h10v-4c0-.55.45-1 1-1s1 .45 1 1v4h10V8.72c.6-.34 1-.98 1-1.72zM8.85 5.5 12 3.4l3.15 2.1c.53.36.85.95.85 1.59C16 8.14 15.14 9 14.09 9H9.91C8.86 9 8 8.14 8 7.09c0-.64.32-1.23.85-1.59zM21 19h-6v-2c0-1.65-1.35-3-3-3s-3 1.35-3 3v2H3v-4h4v-4h10v4h4v4z',
  tune: 'M3 18c0 .55.45 1 1 1h5v-2H4c-.55 0-1 .45-1 1zM3 6c0 .55.45 1 1 1h9V5H4c-.55 0-1 .45-1 1zm10 14v-1h7c.55 0 1-.45 1-1s-.45-1-1-1h-7v-1c0-.55-.45-1-1-1s-1 .45-1 1v4c0 .55.45 1 1 1s1-.45 1-1zM7 10v1H4c-.55 0-1 .45-1 1s.45 1 1 1h3v1c0 .55.45 1 1 1s1-.45 1-1v-4c0-.55-.45-1-1-1s-1 .45-1 1zm14 2c0-.55-.45-1-1-1h-9v2h9c.55 0 1-.45 1-1zm-5-3c.55 0 1-.45 1-1V7h3c.55 0 1-.45 1-1s-.45-1-1-1h-3V4c0-.55-.45-1-1-1s-1 .45-1 1v4c0 .55.45 1 1 1z',
  help: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z',
  wb_twilight: 'M16.955 8.662l2.12-2.122 1.414 1.414-2.121 2.122zM2 18h20v2H2zm9-14h2v3h-2zM3.543 7.925l1.414-1.414 2.121 2.122-1.414 1.414zM5 16h14c0-3.87-3.13-7-7-7s-7 3.13-7 7z',
  sunset: 'M11 2h2v4h2.5L12 9.5 8.5 6H11zM2 18h20v2H2zm3-2a7 7 0 0 1 14 0z',
  bedtime: 'M12.34 2.02C6.59 1.82 2 6.42 2 12c0 5.52 4.48 10 10 10 3.71 0 6.93-2.02 8.66-5.02-7.51-.25-12.09-8.43-8.32-14.96z',
  code: 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  location_on: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
};
const ico = (n) => `<svg class="h-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${ICONS[n]}"/></svg>`;
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
    rows += `\n        <tr data-date="${ymd}"${isToday ? ' class="today" aria-current="date"' : ymd < date ? ' class="past"' : ''}><th scope="row">${shortDay(ymd)}<span class="hj" title="${h.d} ${HIJRI_MONTHS[h.m]} ${h.y}">${h.d} ${HIJRI_SHORT[h.m]}</span></th>${t.map((x, i) => `<td>${tfmt(x)}</td>${i === 3 ? `<td>${tfmt(asrHanafi(ymd))}</td>` : ''}`).join('')}</tr>`;
  }
  const label = monthYear(first);
  const noteId = `tt-note-${year}-${pad(month)}`;
  return { label, note: `<p class="table-note" id="${noteId}">${country.name} local time. Asr I: Shafi'i, Maliki, Hanbali. Asr II: Hanafi.${dstNote}</p>`, html: `<div class="table-wrap">
      <table class="timetable" aria-describedby="${noteId}">
        <caption class="sr-only">${esc(city.name)} prayer timetable, ${label}</caption>
        <thead><tr><th scope="col"><span class="sr-only">Date</span></th>${NAMES.map((n, i) => `${i === 3 ? '<th scope="col" aria-label="Asr I">Asr<span class="tag">I</span></th><th scope="col" aria-label="Asr II">Asr<span class="tag">II</span></th>' : `<th scope="col">${n}</th>`}`).join('')}</tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>` };
}
const thisMonth = monthTable(y, mo);
const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
let nextMonthHtml = '', nextMonthNote = '';
if (daysInMonth - ymdParts(date)[2] < 10) {   // late in the month: also serve next month
  const nm = mo === 12 ? [y + 1, 1] : [y, mo + 1];
  const t = monthTable(...nm);
  nextMonthNote = `\n    ${t.note}`;
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
// Grey trust line under the app-replica list: area, method, angles, time zone (kept live by city.js).
const deg = (v, pos, neg) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
const angles = p0.fajrAngle === p0.ishaAngle ? `Fajr &amp; Isha ${p0.fajrAngle}°` : `Fajr ${p0.fajrAngle}° · Isha ${p0.ishaAngle}°`;
const tzLong = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'long' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName').value;
const listCaption = `<p class="list-caption" id="list-caption">${city.listCaption ? esc(city.listCaption)
  : `Based on ${esc(city.area || city.name)} (${deg(city.lat, 'N', 'S')}, ${deg(city.lng, 'E', 'W')}) · ${methodName} · ${angles} · <span data-tz-name>${tzLong(today[2])} (${nowAbbr})</span>`}</p>`;
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
  [`What time is Maghrib (iftar) in ${city.name} today?`,
    `Maghrib in ${esc(city.name)} today is at ${td(4)}, just after sunset. That is also iftar time, when the fast is opened. Maghrib lasts until Isha begins at ${td(5)}.`, true],
  [`What time is Isha in ${city.name} today?`,
    `Isha in ${esc(city.name)} today begins at ${td(5)}. Its time lasts until Fajr the next morning, and it is recommended not to delay it past the middle of the night.`, true],
  [`Why do ${city.name} prayer times differ between apps and mosques?`,
    `Apps and mosques use different calculation methods. This page uses the ${methodName} method with ${p0.fajrAngle === p0.ishaAngle ? `Fajr and Isha both at ${p0.fajrAngle}°` : `Fajr at ${p0.fajrAngle}° and Isha at ${p0.ishaAngle}°`}${lt ? `, while many ${city.name} mosques follow the ${lt.name}` : ''}. The difference is usually a few minutes for Dhuhr, Asr and Maghrib and larger for Fajr and Isha.`],
  ...(lt ? [[`Which timetable do ${city.name} mosques follow?`, lt.note]] : []),
  [`What is the Asr time in ${city.name} for Hanafis?`,
    `${city.name} has two Asr times. Today the Hanafi Asr in ${city.name} is at ${fmt(hanafiAsr)}, ${Math.round((hanafiAsr - today[3]) / 60000)} minutes after the Shafi'i Asr at ${fmt(today[3])}. Hanafi Asr starts when an object's shadow is twice its length; the Shafi'i, Maliki and Hanbali time starts at once its length.`],
  [`What time is Jumu'ah in ${city.name}?`,
    `Jumu'ah is prayed in place of Dhuhr. On ${longDate(fri)} Dhuhr in ${city.name} begins at ${fmt(friDhuhr)}. Each mosque sets its own khutbah and jamaat times, so check with the mosque you attend.`],
  [`Why is Isha so late in ${city.name} in summer?`,
    `${city.name} is far enough north that the sky barely gets fully dark around midsummer. On ${longDate(mid)}, Fajr is at ${fmt(midT[0])}, Maghrib at ${fmt(midT[4])} and Isha at ${fmt(midT[5])}. The ${methodName} method applies seasonal limits so Isha and Fajr stay at a practical time.`],
];
// Qibla: initial great-circle bearing from the city to the Kaaba.
const KAABA = [21.4225, 39.8262];
const qibla = (() => {
  const r = Math.PI / 180, [p1, p2] = [city.lat * r, KAABA[0] * r], dl = (KAABA[1] - city.lng) * r;
  const b = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
  return Math.round((b / r + 360) % 360);
})();
const compass = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast',
  'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest'][Math.round(qibla / 22.5) % 16];
faq.push([`What is the Qibla direction in ${city.name}?`,
  `The Qibla from ${city.name} is ${qibla}° from true north, roughly ${compass}. That is the shortest path across the globe to the Kaaba in Makkah, which is why it points ${compass} rather than straight towards Saudi Arabia on a flat map.`]);
if (clockChange) {
  faq.push([`Are these times in GMT or BST?`,
    `All times are ${country.name} local time, currently ${nowAbbr}. The clocks change on ${longDate(clockChange)}; from that day the times are in ${tzAbbr(noonUTC(clockChange))}, and the timetable already accounts for it.`]);
}

// FAQPage schema mirrors the visible FAQ word for word (answers as plain text).
const plain = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
ld['@graph'].push({
  '@type': 'FAQPage', '@id': `${url}#faq`,
  mainEntity: faq.map(([q, a, raw]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plain(raw ? a : esc(a)) } })),
});

// ---------- Fajr today (answer-first section for "fajr time {city}") ----------
const tomorrow = addDays(date, 1);
const fajrWeek = Array.from({ length: 7 }, (_, i) => addDays(date, i));
const highLat = city.method === 'MoonsightingCommittee' ? ` and seasonal limits for ${esc(city.name)}'s high latitude` : '';
const otherMethods = p0.fajrAngle === 18
  ? `ISNA puts Fajr at 15°, which gives a later time, while the Muslim World League and Karachi methods use 18° like this page but handle high latitudes differently.`
  : `the Muslim World League and Karachi methods put Fajr at 18° and ISNA at 15°, against ${p0.fajrAngle}° here.`;
const fajrHtml = `
    <div class="card">
    <h2 id="fajr">${ico('wb_twilight')}Fajr time in ${esc(city.name)} today</h2>
    <p class="answer">Fajr in ${esc(city.name)} today, <span data-today-date>${longDate(date)}</span>, is at ${td(0)}; sunrise is at ${td(1)}, so Fajr ends then. Tomorrow, ${longDate(tomorrow)}, Fajr is at ${fmt(dayFor(tomorrow)[0])}.</p>
    <p>These times use the ${methodName} method, with Fajr when the sun is ${p0.fajrAngle}° below the horizon${highLat}.${lt ? ` Many ${esc(city.name)} mosques publish the ${esc(lt.name)} instead, so their Fajr (often spelled Fajar) can differ by several minutes.` : ' Fajr is also often spelled Fajar.'}</p>
    <p>Other websites may show a different Fajr time for ${esc(city.name)} because they use other calculation methods: ${otherMethods}${Math.abs(city.lat) > 48 ? ` The gap is widest in summer, when the sky over ${esc(city.name)} never gets fully dark.` : ''}</p>
    <table class="timetable fajr-week">
      <caption class="sr-only">Fajr and sunrise in ${esc(city.name)}, next 7 days</caption>
      <thead><tr><th scope="col"><span class="sr-only">Date</span></th><th scope="col">Fajr</th><th scope="col">Sunrise</th></tr></thead>
      <tbody>${fajrWeek.map((d) => { const t = dayFor(d); return `
        <tr data-date="${d}"${d === date ? ' class="today" aria-current="date"' : ''}><th scope="row">${shortDay(d)}</th><td>${fmt(t[0])}</td><td>${fmt(t[1])}</td></tr>`; }).join('')}
      </tbody>
    </table>
    </div>`;

// ---------- Maghrib and Isha today (same answer-first pattern as Fajr) ----------
const mAdj = (p0.methodAdjustments || {}).maghrib || 0;
const weekTable = (caption, cols) => `
    <table class="timetable fajr-week">
      <caption class="sr-only">${caption}</caption>
      <thead><tr><th scope="col"><span class="sr-only">Date</span></th>${cols.map(([h]) => `<th scope="col">${h}</th>`).join('')}</tr></thead>
      <tbody>${fajrWeek.map((d) => `
        <tr data-date="${d}"${d === date ? ' class="today" aria-current="date"' : ''}><th scope="row">${shortDay(d)}</th>${cols.map(([, f]) => `<td>${fmt(f(d))}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>`;
const maghribHtml = `
    <div class="card">
    <h2 id="maghrib">${ico('sunset')}Maghrib time in ${esc(city.name)} today</h2>
    <p class="answer">Maghrib in ${esc(city.name)} today, <span data-today-date>${longDate(date)}</span>, is at ${td(4)}. This is also iftar time: when fasting, the fast is opened at Maghrib. Tomorrow, ${longDate(tomorrow)}, Maghrib is at ${fmt(dayFor(tomorrow)[4])}.</p>
    <p>Maghrib begins once the sun has fully set${mAdj ? `; the ${methodName} method adds ${mAdj} minutes to sunset as a precaution` : ''}. It lasts until Isha begins, at ${td(5)} today. It is recommended to pray it soon after it begins.</p>
    <p>Because every calculation method works from sunset, Maghrib times for ${esc(city.name)} usually differ by only a few minutes between apps, websites and mosques, mostly from the precaution each one adds.</p>${weekTable(`Maghrib and Isha in ${esc(city.name)}, next 7 days`, [['Maghrib', (d) => dayFor(d)[4]], ['Isha', (d) => dayFor(d)[5]]])}
    </div>`;
// At midsummer the sun's lowest point is 90° - latitude - 23.44° below the horizon.
const maxDepression = 90 - Math.abs(city.lat) - 23.44;
const ishaHtml = `
    <div class="card">
    <h2 id="isha">${ico('bedtime')}Isha time in ${esc(city.name)} today</h2>
    <p class="answer">Isha in ${esc(city.name)} today, <span data-today-date>${longDate(date)}</span>, is at ${td(5)}. Tomorrow, ${longDate(tomorrow)}, Isha is at ${fmt(dayFor(tomorrow)[5])}.</p>
    <p>These times use the ${methodName} method, with Isha when the sun is ${p0.ishaAngle}° below the horizon${highLat}. The time for Isha lasts until Fajr, and it is recommended not to delay it past the middle of the night.</p>
    <p>Isha times for ${esc(city.name)} differ between sites most in summer.${maxDepression < p0.ishaAngle ? ` Around midsummer the sun never sinks ${p0.ishaAngle}° below the horizon in ${esc(city.name)}, so each method falls back on a high-latitude rule, such as the middle of the night or one-seventh of the night.` : ''} Methods also use different Isha angles: the Muslim World League uses 17°, ISNA 15° and Karachi 18°, while Umm al-Qura sets Isha 90 minutes after Maghrib.${lt ? ` Many ${esc(city.name)} mosques follow the ${esc(lt.name)} instead.` : ''}</p>${weekTable(`Isha and the next Fajr in ${esc(city.name)}, next 7 days`, [['Isha', (d) => dayFor(d)[5]], ['Next Fajr', (d) => dayFor(addDays(d, 1))[0]]])}
    </div>`;

const P5 = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const K5 = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const hasAthan = mosques.some((m) => K5.some((k) => m.athan && m.athan[k]));
const mosquesHtml = !mosques.length ? '' : `
    <div class="card">
    <h2 id="mosques">${ico('mosque')}Mosques in ${esc(city.name)} — Jama'ah times</h2>
    <p>${hasAthan ? 'Start (athan) and jama\'ah' : 'Jama\'ah'} (congregation) times for ${longDate(date)}, as published by each mosque. Mosques set their own times, so check with the mosque before you go.</p>${mosqueData.placeholder ? `
    <p class="note">Placeholder mosques and times for layout only. These are not real mosques or timetables.</p>` : ''}
    <!-- PROVISIONAL hrefs: /mosques/{country}/{city}/{slug}/ is not a live route yet. -->
    <ul class="mosques">
      ${mosques.map((m) => `<li>
        <h3><a href="${m.path}">${esc(m.name)}</a></h3>
        ${m.address ? `<p class="addr">${esc(m.address)}</p>` : ''}
        <table class="mtimes">
          <thead><tr><td></td>${P5.map((n) => `<th scope="col">${n}</th>`).join('')}</tr></thead>
          <tbody>${hasAthan ? `
            <tr><th scope="row">Athan</th>${K5.map((k) => `<td>${sfmt(m.athan[k])}</td>`).join('')}</tr>` : ''}
            <tr><th scope="row">Jama'ah</th>${K5.map((k) => `<td>${sfmt(m.iqamah[k])}</td>`).join('')}</tr>
          </tbody>
        </table>${m.jummah && m.jummah.length ? `
        <p class="jummah">Jumu'ah ${m.jummah.map((j) => sfmt(j, false)).join(', ')}</p>` : ''}
      </li>`).join('\n      ')}
    </ul>
    </div>
`;

// ---------- Embed widget (city/widget/, fed by widget/data/{slug}.json written below) ----------
const widgetUrl = `${SITE.origin}${SITE.widgetPath}?city=${city.slug}`;
const embedCode = `<iframe src="${widgetUrl}" title="${city.name} prayer times" width="320" height="330" style="border:0;max-width:100%" loading="lazy"></iframe>`;
const widgetHtml = `
    <div class="card">
    <h2 id="widget">${ico('code')}Add ${esc(city.name)} prayer times to your website</h2>
    <p>Mosques, schools and community websites can show today's ${esc(city.name)} prayer times with this free widget. Paste the code into any page: it updates every day, works in light and dark mode and loads nothing from third parties.</p>
    <!-- PROVISIONAL: the preview loads the widget relative to this page; the snippet uses the planned ${SITE.widgetPath} URL. -->
    <iframe class="widget-preview" src="widget/?city=${city.slug}" title="${esc(city.name)} prayer times widget preview" width="320" height="330" loading="lazy"></iframe>
    <pre class="embed-code"><code id="embed-code">${esc(embedCode)}</code></pre>
    <p class="copy-row"><button type="button" class="copy-btn" id="copy-embed">Copy code</button> <span class="copy-status" id="copy-status" role="status" aria-live="polite"></span></p>
    </div>`;
const seo = `<section class="seo" id="seo">
    <div class="card">
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol>
          <li><a href="${SITE.hubPath}">Prayer Times</a></li>
          <li><a href="/prayer-times/${city.country}/">${esc(country.name)}</a></li>
          <li aria-current="page">${esc(city.name)}</li>
        </ol>
      </nav>
    <h1>${ico('schedule')}Prayer Times in ${esc(city.name)}, ${esc(country.name)}</h1>
    <p class="answer" id="answer" data-date="${date}"><span class="a-lead">Salah (namaz) times in ${esc(city.name)} today</span><span class="sr-only">, </span><span class="a-date"><span data-today-date>${longDate(date)}</span> · <span data-today-hijri>${hijriLong(date)}</span></span><span class="sr-only">: </span><span class="a-times">${todayList.split(', ').join(' · ')}</span><span class="sr-only">. </span></p>
    <p class="source-line">Updated <time datetime="${date}" data-today-date>${longDate(date)}</time> · Times calculated with the ${esc(timesSource)}</p>
    </div>

    <div class="card">
    <h2 id="timetable">${ico('calendar_month')}${esc(city.name)} prayer timetable | ${thisMonth.label}</h2>
    ${thisMonth.html}${nextMonthHtml}
    </div>
    ${thisMonth.note}${nextMonthNote}
${fajrHtml}
${maghribHtml}
${ishaHtml}

    <div class="card">
    <h2>${ico('tune')}How are ${esc(city.name)} prayer times calculated?</h2>
    <dl class="method">
      <div><dt>Method</dt><dd>${methodName}</dd></div>
      <div><dt>Fajr angle</dt><dd>${p0.fajrAngle}° below the horizon</dd></div>
      <div><dt>Isha angle</dt><dd>${p0.ishaAngle}° below the horizon</dd></div>
      <div><dt>Asr</dt><dd>Both times shown: Shafi'i, Maliki and Hanbali (shadow equal to an object’s length) and Hanafi (shadow twice its length).</dd></div>
      <div><dt>High latitudes</dt><dd>${city.method === 'MoonsightingCommittee' ? 'Moonsighting Committee seasonal limits on Fajr and Isha' : 'Twilight angle rule'}</dd></div>${adj ? `\n      <div><dt>Adjustments</dt><dd>${adj}</dd></div>` : ''}
    </dl>
    </div>
${mosquesHtml}
${widgetHtml}

    <div class="card">
    <h2>${ico('help')}Frequently asked questions</h2>
    <div class="faq">
      ${faq.map(([q, a, raw], i) => `<details class="faq-item" name="faq">
        <summary><h3 class="faq-h">${esc(q)}</h3></summary>
        <div class="faq-a"><p>${raw ? a : esc(a)}</p></div>
      </details>`).join('\n      ')}
    </div>
    </div>

    <div class="card">
    <h2>${ico('location_on')}Prayer times near ${esc(city.name)}</h2>
    <!-- PROVISIONAL hrefs: same /prayer-times/{country}/{city}/ scheme; these pages do not exist yet. -->
    <ul class="nearby">
      ${city.nearby.map(([n, s]) => `<li><a href="/prayer-times/${city.country}/${s}/">${esc(n)}</a></li>`).join('\n      ')}
    </ul>
    <p class="hub-link"><a href="/prayer-times/${city.country}/">All prayer times in ${esc(country.name)}</a></p>
    </div>
  </section>`;

// Headings in Title Case (first letter of every word; existing capitals such as
// BST, GMT and prayer names are left as they are). Text only, never tags/attributes.
const titleWords = (t) => t.replace(/(^|[\s(])([a-z])/g, (_, p, c) => p + c.toUpperCase());
const titleHeadings = (h) => h.replace(/<(h[1-3])([^>]*)>([\s\S]*?)<\/\1>/g, (_, tag, attrs, inner) =>
  `<${tag}${attrs}>${inner.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : titleWords(part.replace(/\s*—\s*/g, ' | ')))).join('')}</${tag}>`);


// ---------- data for city.js (WebMCP tools) and the embed widget ----------
const hm = (ms) => { const p = partsOf(ms); return `${pad(p.h)}:${pad(p.mi)}`; };
Object.assign(cityData, {
  url,
  qibla: { bearing: qibla, compass },
  mosquesPlaceholder: !!(mosqueData && mosqueData.placeholder),
  mosquesDate: date,
  mosques: mosques.map((m) => ({ name: m.name, address: m.address || null, url: m.url, athan: m.athan || {}, iqamah: m.iqamah || {}, jummah: m.jummah || [] })),
});
const widgetDays = {};
for (let i = -1; i <= 62; i++) { const d = addDays(date, i); widgetDays[d] = dayFor(d).map(hm); }
const widgetDir = resolve(here, 'widget', 'data');
mkdirSync(widgetDir, { recursive: true });
writeFileSync(resolve(widgetDir, `${city.slug}.json`), JSON.stringify({
  name: city.name, place: cityData.place, url, clock, timezone: tz, method: methodName,
  names: NAMES, days: widgetDays,
}));

// ---------- write ----------
let html = readFileSync(outPath, 'utf8');
function region(name, content) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
  if (!re.test(html)) throw new Error('Missing region ' + name);
  html = html.replace(re, (_, a, b) => `${a}\n${content}\n${b}`);
}
// Speed: the CSS is inlined (no render-blocking request) and lightly minified; city.js is minified
// to city.min.js with esbuild and cache-busted by content hash so a rebuilt page never runs a stale script.
const ver = (f) => createHash('sha1').update(readFileSync(resolve(here, f))).digest('hex').slice(0, 8);
const minCss = readFileSync(resolve(here, 'city.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
execFileSync('npx', ['--yes', 'esbuild@0.24.0', resolve(here, 'city.js'), '--minify', '--target=es2017', `--outfile=${resolve(here, 'city.min.js')}`, '--log-level=warning'], { stdio: 'inherit' });
html = html.replace(/<link rel="stylesheet" href="city\.css[^"]*">|<style id="city-css">[\s\S]*?<\/style>/, () => `<style id="city-css">${minCss}</style>`)
  .replace(/src="city(\.min)?\.js(\?v=[^"]*)?"/, `src="city.min.js?v=${ver('city.min.js')}"`);
html = html.replace(/<ul class="list" id="list"[^>]*>/, `<ul class="list" id="list" aria-label="${esc(city.name)} prayer times today">`);
html = html.replace(/<html lang="[^"]*">/, `<html lang="${country.lang}">`);
region('head', head.replace('__LD__', () => JSON.stringify(ld, null, 2)).replace('__CITYDATA__', () => JSON.stringify(cityData, null, 2)));
region('chip', chip);
region('date', dateBlock);
region('list', list);
region('caption', listCaption);
region('seo', titleHeadings(seo));
region('banner', banner);
writeFileSync(outPath, html);
console.log(`Built ${city.name} for ${date}: ${timesText} (updated ${isoLocal(updatedMs)})`);
