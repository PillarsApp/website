// City prayer times page. Logic mirrors the Pillars app's location page:
// current prayer header (current_prayer_text_widget.dart), countdown pill
// (prayer_page_countdown.dart), the sky (sun_animation.dart, moon_animation.dart),
// the curve and dots (prayer_curve_geometry.dart + prayer_painters.dart
// TimeOfDaySineCurvePainter) and the list (prayer_time_slot.dart).
// All times are city-local; the browser's own time zone never matters.

// Named PostHog events (page/analytics.html boots PostHog on production only; anywhere else this is a no-op).
// Every event carries the city's path, e.g. "uk/london".
function track(name, props) {
  try {
    var ph = window.posthog;
    if (!ph || !ph.capture) return;
    var p = props || {};
    p.city = location.pathname.replace(/^\/prayer-times\/|\/$/g, '');
    var leaving = p.leaving; delete p.leaving;   // a tap that navigates away sends straight away
    ph.capture(name, p, leaving ? { send_instantly: true } : undefined);
  } catch (e) { /* analytics never breaks the page */ }
}
(function () {
  'use strict';

  var city = JSON.parse(document.getElementById('city-data').textContent);
  var tz = city.timezone;
  var params = new URLSearchParams(location.search);
  // Clock comes from the country config (src/cities.ts); ?clock=12|24 overrides it.
  var clockParam = params.get('clock');
  var use24h = clockParam === '24' || clockParam === '12' ? clockParam === '24' : city.clock === 24;
  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };
  var body = document.body;
  var SVGNS = 'http://www.w3.org/2000/svg';

  // ?safe=59,34 pins the safe-area insets (iPhone status bar / home indicator)
  // so the page can be compared with an app screenshot at 393x852.
  var safe = params.get('safe');
  if (safe) {
    var sa = safe.split(',');
    root.style.setProperty('--st', (parseFloat(sa[0]) || 0) + 'px');
    root.style.setProperty('--sb', (parseFloat(sa[1]) || 0) + 'px');
  }

  var NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  var KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

  // ---------- City-local time helpers ----------
  var fmtParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  function partsOf(ms) {
    var p = {};
    fmtParts.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
  }
  function offsetAt(ms) {
    var p = partsOf(ms);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  }
  // City wall-clock time -> epoch ms.
  function zoned(y, mo, d, h, mi, s) {
    var guess = Date.UTC(y, mo - 1, d, h, mi, s || 0);
    var ms = guess - offsetAt(guess);
    var off2 = offsetAt(ms);
    return guess - off2;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymdOf(ms) { var p = partsOf(ms); return p.y + '-' + pad(p.mo) + '-' + pad(p.d); }
  function ymdParts(ymd) { var a = ymd.split('-'); return [+a[0], +a[1], +a[2]]; }
  function addDays(ymd, n) {
    var a = ymdParts(ymd);
    var d = new Date(Date.UTC(a[0], a[1] - 1, a[2] + n, 12));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  // ?now=2026-10-17T13:10 pins the city-local clock for testing (then runs on).
  var pinnedMs = null;
  var startReal = Date.now();
  var pm = (params.get('now') || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (pm) pinnedMs = zoned(+pm[1], +pm[2], +pm[3], +pm[4], +pm[5], +(pm[6] || 0));
  function nowMs() { return pinnedMs === null ? Date.now() : pinnedMs + (Date.now() - startReal); }

  // ---------- Prayer times (adhan, the app's defaults for the country) ----------
  var coords = new adhan.Coordinates(city.lat, city.lng);
  var calc = adhan.CalculationMethod[city.method]();  // MSC already carries dhuhr +5, maghrib +3
  calc.madhab = adhan.Madhab[city.madhab];
  calc.highLatitudeRule = adhan.HighLatitudeRule[city.highLatitudeRule];
  // Second Asr for the SEO content: Hanafi (shadow 2x) next to the Shafi'i/Maliki/Hanbali (1x).
  var calcHanafi = adhan.CalculationMethod[city.method]();
  calcHanafi.madhab = adhan.Madhab.Hanafi;
  calcHanafi.highLatitudeRule = calc.highLatitudeRule;

  // Asr toggle on the list (Earlier = Shafi'i/standard, Later = Hanafi), remembered per browser and
  // starting on the Asr the city's standard lists first.
  // day.t carries the chosen Asr, so the header, countdown, curve, list and top bar all follow it;
  // day.base keeps the standard times for the SEO content, which always shows both.
  var ASR_KEY = 'pillars.city.asr';
  var asrLater = city.asrFirst === 'Hanafi';
  try {
    var storedAsr = localStorage.getItem(ASR_KEY);
    if (storedAsr === 'later' || storedAsr === 'earlier') asrLater = storedAsr === 'later';
  } catch (e) { /* storage blocked */ }

  // Published standard: the timetable rows the server inlined (src/render/page.ts inlineDays), resolved
  // by the same rules as the server (src/render/times.ts): the day's own row, else last year's row for
  // the same month and day carried forward by whole days, else the calculation. A row is one string of
  // [fajr, sunrise, dhuhr, asr1, asr2, maghrib, isha]; a "-" column is calculated.
  var timetable = city.timetable || null;
  function lastYear(ymd) {
    var a = ymdParts(ymd);
    return (a[0] - 1) + '-' + pad(a[1]) + '-' + pad(a[1] === 2 && a[2] === 29 ? 28 : a[2]);
  }
  function publishedRow(ymd) {
    if (!timetable) return null;
    if (timetable[ymd]) return { wall: timetable[ymd].split(' '), on: ymd, origin: 'published' };
    var ly = lastYear(ymd);
    return timetable[ly] ? { wall: timetable[ly].split(' '), on: ly, origin: 'last-year' } : null;
  }
  function wallOn(on, ymd, hm) {
    var a = ymdParts(on), t = hm.split(':');
    return zoned(a[0], a[1], a[2], +t[0], +t[1], 0) + Math.round((dateObj(ymd) - dateObj(on)) / 864e5) * 864e5;
  }

  var dayCache = {};
  function dayFor(ymd) {
    if (dayCache[ymd]) return dayCache[ymd];
    var a = ymdParts(ymd);
    // adhan reads only the date's Y/M/D, so a browser-local date works for any city.
    var pt = new adhan.PrayerTimes(coords, new Date(a[0], a[1] - 1, a[2]), calc);
    var base = KEYS.map(function (k) { return pt[k].getTime(); });
    var hanafi = new adhan.PrayerTimes(coords, new Date(a[0], a[1] - 1, a[2]), calcHanafi).asr.getTime();
    var origin = 'calculated';
    var row = publishedRow(ymd);
    if (row) {
      var at = function (column, fallback) { return row.wall[column] === '-' ? fallback : wallOn(row.on, ymd, row.wall[column]); };
      base = [at(0, base[0]), at(1, base[1]), at(2, base[2]), at(3, base[3]), at(5, base[4]), at(6, base[5])];
      hanafi = at(4, hanafi);
      origin = row.origin;
    }
    var day = {
      date: ymd,
      base: base,
      t: base.map(function (x, i) { return i === 3 && asrLater ? hanafi : x; }),
      asrHanafi: hanafi,
      origin: origin,
      start: zoned(a[0], a[1], a[2], 0, 0, 0),
      end: zoned(a[0], a[1], a[2], 23, 59, 0)
    };
    dayCache[ymd] = day;
    return day;
  }

  // prayer_time_slot.dart formatting: "HH:mm" (24-hour countries) or "h:mm a".
  function formatTime(ms) {
    var p = partsOf(ms);
    if (use24h || (p.h === 12 && p.mi === 0)) return pad(p.h) + ':' + pad(p.mi);
    return (p.h % 12 === 0 ? 12 : p.h % 12) + ':' + pad(p.mi) + ' ' + (p.h < 12 ? 'AM' : 'PM');
  }
  function minutesBetween(a, b) { return Math.floor((b - a) / 60000); } // Duration.inMinutes

  // ---------- Dates ----------
  function dateObj(ymd) { var a = ymdParts(ymd); return new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)); }
  var gregFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  var HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Awwal', 'Jumada al-Thani',
    'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhul-Qa'dah", 'Dhul-Hijjah'];
  var hijriFmt = new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric' });
  // After Maghrib the Islamic day has turned (hijri_date_widget.dart).
  function hijriLabel(ymd, afterSunset) {
    var d = dateObj(ymd);
    if (afterSunset) d = new Date(d.getTime() + 864e5);
    var p = {};
    hijriFmt.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return parseInt(p.day, 10) + ' ' + HIJRI_MONTHS[parseInt(p.month, 10) - 1] + ' ' + parseInt(p.year, 10);
  }

  // Hijri line, as hijri_date_widget.dart (showTomorrowIndicator, showNightSlashFormat) for a non-supporter:
  // in the day (Sunrise to Maghrib, day theme) it reads "11 Jumada al-Awwal 1448 | (moon) 12", the next
  // Islamic day after the divider. From Maghrib, at night and during Fajr the moon hides: today shows
  // the Islamic date in force (it turns at Maghrib), other days show both, "11/12 Jumada al-Awwal 1448".
  function hijriParts(ymd, add) {
    var p = {};
    hijriFmt.formatToParts(new Date(dateObj(ymd).getTime() + add * 864e5)).forEach(function (x) { p[x.type] = x.value; });
    return { d: parseInt(p.day, 10), m: parseInt(p.month, 10), y: parseInt(p.year, 10) };
  }
  var MOON_SVG = '<svg class="hj-moon" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path fill="#BBC3CF" transform="translate(.602295 .0273438)" d="M11.882401 7.4878464C11.773164 7.3788714 11.610984 7.3424506 11.465641 7.3942556C9.5123539 8.0906715 7.3326426 7.5998769 5.8663425 6.1334915C4.4000425 4.6671057 3.9093754 2.4873657 4.6059051 .53411961C4.6576595 .38875064 4.6211739 .22657578 4.5121479 .11737879C4.4031215 .0081817899 4.241004 -.028557783 4.0955544 .022969089C3.2327948 .32763457 2.4498477 .82294053 1.804976 1.4720289C-.60230237 3.8811283 -.60156429 7.7853465 1.8066248 10.193536C4.2148137 12.601725 8.1190319 12.602463 10.528131 10.195185C11.177271 9.5501976 11.67258 8.7671089 11.977191 7.9042063C12.028522 7.7587523 11.991639 7.5967441 11.882401 7.4878464Z"/></svg>';
  function renderHijri(now) {
    var el = $('date-hijri');
    var nowIdx = currentIndex(dayFor(todayYmd), now);           // the app reads the current prayer, not the page's
    var islamicNight = nowIdx === 4 || nowIdx === 5;
    var hideMoon = nowIdx <= 0 || islamicNight || theme === 'night';
    var M = function (m) { return HIJRI_MONTHS[m - 1]; };
    var base = hijriParts(selected, 0), off = hijriParts(selected, 1), disp = islamicNight ? off : base;
    var boundary = disp.m !== off.m, label, html;
    if (!hideMoon) {
      var primary = boundary ? disp.d + ' ' + M(disp.m) : disp.d + ' ' + M(disp.m) + ' ' + disp.y;
      var next = boundary ? off.d + ' ' + M(off.m) : String(off.d);
      label = primary + ', next Islamic day ' + next;
      html = '<span>' + primary + '</span><span class="hj-next" aria-hidden="true"><span>|</span>' + MOON_SVG + '<span>' + next + '</span></span>';
    } else if (selected !== todayYmd) {
      label = base.m !== off.m ? base.d + ' ' + M(base.m) + ' / ' + off.d + ' ' + M(off.m) + ' ' + off.y
        : base.d + '/' + off.d + ' ' + M(disp.m) + ' ' + disp.y;
      html = '<span>' + label + '</span>';
    } else {
      label = disp.d + ' ' + M(disp.m) + ' ' + disp.y;
      html = '<span>' + label + '</span>';
    }
    if (el.getAttribute('data-l') !== label) {
      el.setAttribute('data-l', label);
      el.setAttribute('aria-label', label);
      el.innerHTML = html;
    }
    // FittedBox(scaleDown): the line shrinks to the 250px date column rather than wrapping.
    el.style.transform = '';
    var w = el.scrollWidth, max = el.parentNode.clientWidth;
    if (w > max) el.style.transform = 'scale(' + (max / w).toFixed(4) + ')';
  }

  // ---------- State ----------
  var todayYmd = ymdOf(nowMs());
  var selected = todayYmd;
  var theme = null;   // set on the first render, which also writes the status-bar colour

  function currentIndex(day, now) {
    var idx = -1;
    for (var i = 0; i < 6; i++) if (now >= day.t[i]) idx = i;
    return idx;
  }

  // ---------- Theme: AUTO = night from Maghrib until sunrise ----------
  function applyTheme(now) {
    var t = dayFor(todayYmd).t;
    var forced = params.get('theme');
    var next = forced === 'night' || forced === 'day' ? forced
      : (now >= t[4] || now < t[1]) ? 'night' : 'day';
    if (next !== theme) {
      theme = next;
      body.classList.toggle('theme-night', theme === 'night');
      var btt = document.getElementById('to-top');
      if (btt) btt.classList.toggle('btt-light', theme !== 'night');
      buildStars();
      // Status-bar colour = the top of the sky. No theme-color ships in the HTML: a static value
      // (it was night navy) is what iOS Safari painted all day. A fresh meta element per theme
      // (Safari ignores later edits to an existing one); without it Safari samples the root
      // background, which css sets to the same --grad-1.
      var top = getComputedStyle(body).getPropertyValue('--grad-1').trim();
      var old = document.querySelector('meta[name="theme-color"]');
      if (old) old.parentNode.removeChild(old);
      var tc = document.createElement('meta');
      tc.name = 'theme-color';
      tc.content = top;
      document.head.appendChild(tc);
      root.style.backgroundColor = top;
    }
  }

  // ---------- Header: current prayer + countdown ----------
  function renderHeader(now) {
    var today = dayFor(todayYmd);
    var idx = currentIndex(today, now);
    var name;
    if (idx < 0) name = NAMES[5];                                   // before Fajr: still Isha
    else if (idx === 1) name = minutesBetween(today.t[1], now) >= 15 ? 'Duha' : 'Sunrise';
    else name = NAMES[idx];
    var el = $('current-name');
    el.textContent = '';
    [['It\u2019s ', 0], [name, 1], [' in ', 0], [city.name, 1]].forEach(function (part) {
      var span = document.createElement('span');
      span.textContent = part[0];
      if (!part[1]) span.className = 'dim';
      el.appendChild(span);
    });

    var nextIdx = idx < 5 ? idx + 1 : 0;
    var nextAt = idx < 5 ? today.t[nextIdx] : dayFor(addDays(todayYmd, 1)).t[0];
    var secs = Math.max(0, Math.floor((nextAt - now) / 1000));
    var h = Math.floor(secs / 3600), totalMin = Math.floor(secs / 60), m = totalMin - 60 * h;
    var text;
    if (h > 0) {
      text = h + ' ' + (h === 1 ? 'hr' : 'hrs');
      if (m > 0) text += ' ' + m + ' ' + (m === 1 ? 'min' : 'mins');
    } else if (totalMin > 0) {
      text = totalMin + ' ' + (totalMin === 1 ? 'min' : 'mins');
    } else {
      text = secs + ' ' + (secs === 1 ? 'sec' : 'secs');
    }
    $('countdown').textContent = text + ' until ' + NAMES[nextIdx];

    // Scroll bar: current prayer and time left in it, as h:mm:ss.
    var tbName = $('tb-name'), tbTime = $('tb-time');
    if (tbName && tbTime) {
      var sec = secs % 60, two = function (n) { return (n < 10 ? '0' : '') + n; };
      tbName.textContent = name;
      if ($('tb-city')) $('tb-city').textContent = city.name;
      // One fixed-width box per character, so the centred bar never shifts as the seconds tick.
      var str = (h > 0 ? h + ':' + two(m) : m) + ':' + two(sec);
      if (tbTime.getAttribute('data-t') !== str) {
        tbTime.setAttribute('data-t', str);
        tbTime.textContent = '';
        str.split('').forEach(function (c) {
          var span = document.createElement('span');
          span.className = c === ':' ? 'tb-colon' : 'tb-digit';
          span.textContent = c;
          tbTime.appendChild(span);
        });
      }
    }
  }

  // ---------- Curve (prayer_curve_geometry.dart) ----------
  var BASE = 0.695, DIP_X = 0.1329, ARC_X = 0.1346, DIP_CY = BASE + 0.111, DIP_DX = 0.119,
    ARC_CY = BASE - 0.362, ARC_CX = 0.4605;
  var SEG_START = [[-DIP_X, BASE], [-DIP_X + DIP_DX, DIP_CY], [ARC_X - DIP_DX, DIP_CY], [ARC_X, BASE]];
  var SEG_MID = [[ARC_X, BASE], [ARC_CX, ARC_CY], [1 - ARC_CX, ARC_CY], [1 - ARC_X, BASE]];
  var SEG_END = [[1 - ARC_X, BASE], [1 - ARC_X + DIP_DX, DIP_CY], [1 + DIP_X - DIP_DX, DIP_CY], [1 + DIP_X, BASE]];
  var SUNRISE_T = 0.06, MAGHRIB_T = 0.962492, MIDNIGHT_T = 0.5;

  function scaled(seg, W, H) { return seg.map(function (p) { return [p[0] * W, p[1] * H]; }); }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function pointAt(c, t) {
    var u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    return [w0 * c[0][0] + w1 * c[1][0] + w2 * c[2][0] + w3 * c[3][0],
      w0 * c[0][1] + w1 * c[1][1] + w2 * c[2][1] + w3 * c[3][1]];
  }
  function split(c, t) { // de Casteljau: [head, tail]
    var a = lerp(c[0], c[1], t), b = lerp(c[1], c[2], t), d = lerp(c[2], c[3], t);
    var e = lerp(a, b, t), f = lerp(b, d, t), g = lerp(e, f, t);
    return [[c[0], a, e, g], [g, f, d, c[3]]];
  }
  function sub(c, t0, t1) {
    if (t1 <= t0) return null;
    var head = split(c, t1)[0];
    return t0 > 0 ? split(head, t0 / t1)[1] : head;
  }
  // Arc-length table so the progress tip can be placed by length, as the app does.
  function table(c) {
    var N = 400, L = [0], prev = c[0];
    for (var i = 1; i <= N; i++) {
      var p = pointAt(c, i / N);
      L.push(L[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
      prev = p;
    }
    return L;
  }
  function lenAt(L, t) {
    var N = L.length - 1, x = Math.max(0, Math.min(1, t)) * N, i = Math.floor(x);
    return i >= N ? L[N] : L[i] + (L[i + 1] - L[i]) * (x - i);
  }
  function tAtLen(L, len) {
    var N = L.length - 1;
    if (len <= 0) return 0;
    if (len >= L[N]) return 1;
    var lo = 0, hi = N;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (L[mid] < len) lo = mid; else hi = mid; }
    return (lo + (len - L[lo]) / (L[hi] - L[lo])) / N;
  }
  function d(c) {
    if (!c) return '';
    var f = function (p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); };
    return 'M' + f(c[0]) + 'C' + f(c[1]) + ' ' + f(c[2]) + ' ' + f(c[3]);
  }
  // progressLengthAt: constant rate between knots, minute resolution.
  function progressLength(now, knots) {
    if (now <= knots[0][0]) return knots[0][1];
    for (var i = 0; i + 1 < knots.length; i++) {
      var from = knots[i], to = knots[i + 1];
      if (now < to[0]) {
        var span = minutesBetween(from[0], to[0]);
        if (span <= 0) return to[1];
        var frac = Math.max(0, Math.min(1, minutesBetween(from[0], now) / span));
        return from[1] + (to[1] - from[1]) * frac;
      }
    }
    return knots[knots.length - 1][1];
  }

  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function renderCurve(now) {
    var svg = $('curve');
    var W = svg.clientWidth, H = svg.clientHeight;
    if (!W || !H) return;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var night = theme === 'night';
    var C = {
      grey: night ? 'rgba(229,220,220,.4)' : '#D5E0EA',
      fill: night ? '#FFBC91' : '#00193E',
      done: night ? '#FFFFFF' : '#00193E',
      todo: night ? '#FFFFFF' : '#D5E0EA',
      hole: night ? '#002449' : '#EDF7FD'
    };
    var day = dayFor(selected), t = day.t;
    var tA = asrShow != null ? asrShow : t[3];   // Asr while the Earlier/Later switch glides the dot
    var s = scaled(SEG_START, W, H), m = scaled(SEG_MID, W, H), e = scaled(SEG_END, W, H);
    var Ls = table(s), Lm = table(m), Le = table(e);

    var fajrT = MIDNIGHT_T + (minutesBetween(day.start, t[0]) / minutesBetween(day.start, t[1])) / 2;
    var dayMin = minutesBetween(t[1], t[4]);
    var dhuhrT = minutesBetween(t[1], t[2]) / dayMin;
    var asrT = (asrShow != null ? (tA - t[1]) / 60000 : minutesBetween(t[1], tA)) / dayMin;
    var ishaT = (minutesBetween(t[4], t[5]) / minutesBetween(t[4], day.end)) / 2;

    var sunriseLen = lenAt(Lm, SUNRISE_T), dhuhrLen = lenAt(Lm, dhuhrT), asrLen = lenAt(Lm, asrT),
      maghribLen = lenAt(Lm, MAGHRIB_T), tail = Lm[Lm.length - 1] - maghribLen,
      ishaLen = lenAt(Le, ishaT), endEdgeLen = lenAt(Le, MIDNIGHT_T);

    var progress = [];
    if (now < t[0]) {
      var nowT = MIDNIGHT_T + (minutesBetween(day.start, now) / minutesBetween(day.start, t[1])) / 2;
      progress.push(sub(s, MIDNIGHT_T, nowT));
    } else if (now < t[4]) {
      progress.push(s);
      var tip = progressLength(now, [[t[1], sunriseLen], [t[2], dhuhrLen], [tA, asrLen], [t[4], maghribLen]]);
      progress.push(sub(m, 0, tAtLen(Lm, tip)));
    } else {
      progress.push(s);
      var tip2 = progressLength(now, [[t[4], 0], [t[5], tail + ishaLen], [day.end, tail + endEdgeLen]]);
      if (tip2 < tail) {
        progress.push(sub(m, 0, tAtLen(Lm, maghribLen + tip2)));
      } else {
        progress.push(m);
        progress.push(sub(e, 0, tAtLen(Le, tip2 - tail)));
      }
    }

    svg.textContent = '';
    svg.appendChild(el('path', { d: d(s) + d(m) + d(e), fill: 'none', stroke: C.grey, 'stroke-width': 4.5 }));
    svg.appendChild(el('path', { d: progress.map(d).join(''), fill: 'none', stroke: C.fill, 'stroke-width': 4.5, 'stroke-linecap': 'round' }));

    function dot(p, passed) {
      svg.appendChild(el('circle', { cx: p[0].toFixed(2), cy: p[1].toFixed(2), r: 6.5, fill: passed ? C.done : C.todo }));
    }
    dot(pointAt(s, fajrT), now > t[0]);
    var sr = pointAt(m, SUNRISE_T);
    svg.appendChild(el('circle', { cx: sr[0].toFixed(2), cy: sr[1].toFixed(2), r: 4, fill: C.hole }));
    svg.appendChild(el('circle', { cx: sr[0].toFixed(2), cy: sr[1].toFixed(2), r: 5.5, fill: 'none', stroke: now > t[1] ? C.done : C.todo, 'stroke-width': 4 }));
    dot(pointAt(m, dhuhrT), now > t[2]);
    dot(pointAt(m, asrT), now > tA);
    dot(pointAt(m, MAGHRIB_T), now > t[4]);
    dot(pointAt(e, ishaT), now > t[5]);
  }

  // ---------- Sky: sun, moon, stars ----------
  var MOON_Y = 10;
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stars = [];

  function skySize() { var b = $('sky'); return { w: b.clientWidth, h: b.clientHeight }; }
  function topInset() { return parseFloat(getComputedStyle($('curve').parentNode).top) || 0; }

  // _MoonStarfieldState._starsFor, same seed and draw order.
  function buildStars() {
    var g = $('stars');
    g.textContent = '';
    stars = [];
    if (theme !== 'night') return;
    var sz = skySize(), W = sz.w, Hb = sz.h, top = topInset();
    var seed = 200;
    var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    var avail = Math.max(Hb - top, 0);
    var floorY = (W <= 0 || avail <= 0 ? 0 : top + Math.min(avail, W * 140 / 390)) - 14;
    var usable = Math.max(floorY, 0);
    if (usable <= 0 || W <= 0) return;
    var count = 50, cand = count * 5;
    var cols = Math.max(1, Math.round(Math.sqrt(cand * (W / usable))));
    var rows = Math.max(1, Math.ceil(cand / cols));
    var cw = W / cols, ch = usable / rows;
    var cells = [];
    for (var i = 0; i < cols * rows; i++) cells.push(i);
    for (var j = cells.length - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1));
      var tmp = cells[j]; cells[j] = cells[k]; cells[k] = tmp;
    }
    var moon = [W, MOON_Y];
    var clamp = function (v, lo, hi) { return Math.min(Math.max(v, lo), hi); };
    var candidates = [];
    cells.forEach(function (cell) {
      var col = cell % cols, row = Math.floor(cell / cols);
      var r = rnd() * 1.3 + 0.25;
      var maxX = Math.max(r, W - r), maxY = Math.max(r, usable - r);
      var xj = (rnd() - 0.5) * 1.16, yj = (rnd() - 0.5) * 1.16;
      var x = clamp((col + 0.5 + xj) * cw, r, maxX), y = clamp((row + 0.5 + yj) * ch, r, maxY);
      if (y + r > floorY || Math.hypot(x - moon[0], y - moon[1]) <= 100 + 4 + r) return;
      candidates.push({ x: x, y: y, r: r, delay: rnd() * 5, max: rnd() * 0.7 + 0.2, period: 2.4 + rnd() * 3.5 });
    });
    var spacing = Math.sqrt((W * usable) / count);
    function add(minDist) {
      candidates.forEach(function (c) {
        if (stars.length >= count || stars.indexOf(c) >= 0) return;
        if (minDist > 0 && stars.some(function (s) { return Math.hypot(s.x - c.x, s.y - c.y) < minDist + s.r + c.r; })) return;
        stars.push(c);
      });
    }
    add(spacing * 0.32); add(spacing * 0.18); add(0);
    stars.forEach(function (s) {
      s.node = el('circle', { cx: s.x.toFixed(2), cy: s.y.toFixed(2), r: s.r.toFixed(2), fill: '#FFFFFF', 'fill-opacity': s.max.toFixed(3) });
      g.appendChild(s.node);
    });
  }

  function placeSky() {
    var W = skySize().w;
    ['sun1', 'sun2', 'sun3'].forEach(function (id) { $(id).setAttribute('cx', W); $(id).setAttribute('cy', 0); });
    ['moon1', 'moon2', 'moon3'].forEach(function (id) { $(id).setAttribute('cx', W); $(id).setAttribute('cy', MOON_Y); });
  }

  function frame(ms) {
    // CelestialAnimation: 8 s, repeat(reverse: true), linear intervals.
    var v = 0;
    if (!reduceMotion) { var ph = (ms % 16000) / 8000; v = ph <= 1 ? ph : 2 - ph; }
    var a = Math.min(1, v / 0.8), b = Math.max(0, Math.min(1, (v - 0.2) / 0.8));
    if (theme === 'night') {
      $('moon2').setAttribute('r', 60 + 10 * a);
      $('moon3').setAttribute('r', 90 + 10 * b);
      if (!reduceMotion) {
        var el2 = (ms / 1000) % 5.5;
        for (var i = 0; i < stars.length; i++) {
          var s = stars[i];
          var phase = ((el2 + s.delay) % s.period) / s.period;
          var pulse = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
          s.node.setAttribute('fill-opacity', (0.1 + (s.max - 0.1) * pulse).toFixed(3));
        }
      }
    } else {
      $('sun2').setAttribute('r', 90 + 30 * a);
      $('sun3').setAttribute('r', 140 + 30 * b);
    }
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  // ---------- Date row + list ----------
  function renderDay(now) {
    var day = dayFor(selected);
    var isToday = selected === todayYmd;
    var chip = $('chip');
    chip.style.opacity = isToday ? 1 : (theme === 'night' ? 0.4 : 0.3);
    chip.style.cursor = isToday ? 'default' : 'pointer';
    $('date-greg').textContent = gregFmt.format(dateObj(selected)).replace(',', '');
    renderHijri(now);

    // Six rows; the Asr row's pill switches it between the earlier and later Asr.
    var rows = [];
    for (var k = 0; k < 6; k++) rows.push({ name: k === 3 ? 'Asr ' + asrToggle() : NAMES[k], t: day.t[k] });
    var cur = isToday ? currentIndex(day, now) : -1;
    var SEP = '<li class="sep" aria-hidden="true"></li>';
    var html = cur === 0 ? '' : SEP;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var finished = selected < todayYmd || (isToday && cur > -1 && i < cur);
      var cls = 'row' + (i === cur ? ' current' : '') + (finished && i !== cur ? ' finished' : '');
      html += '<li class="' + cls + '"' + (i === cur ? ' aria-current="time"' : '') + '>' +
        '<span class="name">' + r.name + '</span> <span class="t">' + formatTime(r.t) + '</span></li>';
      if (i !== cur && i !== cur - 1) html += SEP;
    }
    // Trust caption: a published standard says whether the selected day's times are its own or an estimate.
    var originEl = document.querySelector('#list-caption [data-origin]');
    if (originEl) {
      var label = day.origin === 'published' ? 'Published Start Times'
        : day.origin === 'last-year' ? 'Estimated From Its ' + (ymdParts(selected)[0] - 1) + ' Timetable'
        : 'Calculated Until Published';
      if (originEl.textContent !== label) originEl.textContent = label;
    }
    var list = $('list'), focused = list.contains(document.activeElement) && document.activeElement.getAttribute('data-asr');
    // FLIP: when the Asr toggle moves the current prayer, rows glide to their new places and the
    // highlight box slides from the old row to the new one.
    var flip = animateNext && !reduceMotion;
    animateNext = false;
    var before = flip ? snapshot(list) : null;
    list.innerHTML = html;
    if (focused) { var b = list.querySelector('[data-asr="' + focused + '"]'); if (b) b.focus(); }
    if (before) playFlip(list, before);
  }
  var animateNext = false, EASE = 'cubic-bezier(.2, .9, .3, 1)';
  function snapshot(list) {
    var rows = list.querySelectorAll('.row'), cur = list.querySelector('.row.current');
    return {
      tops: Array.prototype.map.call(rows, function (r) { return r.offsetTop; }),
      cur: cur ? { top: cur.offsetTop, left: cur.offsetLeft, w: cur.offsetWidth, h: cur.offsetHeight } : null
    };
  }
  function playFlip(list, before) {
    var rows = list.querySelectorAll('.row'), cur = list.querySelector('.row.current');
    if (!list.animate) return;
    Array.prototype.forEach.call(rows, function (r, i) {
      var dy = before.tops[i] - r.offsetTop;
      if (dy) r.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 300, easing: EASE });
    });
    if (before.cur && cur && before.cur.top !== cur.offsetTop) {
      var ghost = document.createElement('li');
      ghost.className = 'hl-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      list.appendChild(ghost);
      cur.classList.add('hl-hidden');
      var to = { top: cur.offsetTop, left: cur.offsetLeft, w: cur.offsetWidth, h: cur.offsetHeight };
      var box = function (b) { return { top: b.top + 'px', left: b.left + 'px', width: b.w + 'px', height: b.h + 'px' }; };
      var anim = ghost.animate([box(before.cur), box(to)], { duration: 300, easing: EASE, fill: 'forwards' });
      var done = function () { ghost.remove(); cur.classList.remove('hl-hidden'); };
      anim.onfinish = anim.oncancel = done;
      setTimeout(done, 450);   // background tabs may never finish the animation
    }
  }
  function asrToggle() {
    var btn = function (key, label, on) {
      return '<button type="button" class="asr-opt" data-asr="' + key + '" aria-pressed="' + on + '">' + label + '</button>';
    };
    return '<span class="asr-toggle' + (asrLater ? ' is-later' : '') + '" role="group" aria-label="Asr time">' +
      '<span class="asr-thumb" aria-hidden="true"></span>' +
      btn('earlier', 'Earlier', !asrLater) + btn('later', 'Later', asrLater) + '</span>';
  }
  // SwiftUI contentTransition(.numericText()) feel: only the digits that change roll, old glyph out (up for
  // Later, down for Earlier) with a blur, new glyph in from the other side; left to right with a small stagger.
  // Characters keep their places (tabular figures), so nothing in the row moves. Screen readers get the
  // final time once, from a hidden copy; the per-character spans are removed when the roll ends.
  function morphTime(t, next, dir) {
    var prev = t.textContent;
    if (prev === next) return;
    if (prev.length !== next.length) { t.textContent = next; return; }
    t.textContent = '';
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = next;
    var vis = document.createElement('span');
    vis.setAttribute('aria-hidden', 'true');
    t.appendChild(sr); t.appendChild(vis);
    var anims = [], k = 0, E = 'cubic-bezier(.2, .8, .2, 1)';
    for (var i = 0; i < next.length; i++) {
      var cell = document.createElement('span');
      cell.className = 'dg';
      cell.textContent = next[i];
      vis.appendChild(cell);
      if (prev[i] === next[i]) continue;
      var old = document.createElement('span');
      old.className = 'dg-old';
      old.textContent = prev[i];
      cell.appendChild(old);
      var o = { duration: 320, delay: 25 * k++, easing: E, fill: 'both' };
      anims.push(old.animate([
        { transform: 'none', filter: 'blur(0)', opacity: 1 },
        { transform: 'translateY(' + (6 * dir) + 'px)', filter: 'blur(2px)', opacity: 0 }], o));
      anims.push(cell.animate([
        { transform: 'translateY(' + (-6 * dir) + 'px)', filter: 'blur(2px)', opacity: 0 },
        { transform: 'none', filter: 'blur(0)', opacity: 1 }], o));
    }
    var cleaned = false;
    var clean = function () { if (cleaned) return; cleaned = true; if (t.contains(vis)) t.textContent = next; };
    Promise.all(anims.map(function (a) { return a.finished; })).then(clean, clean);
    setTimeout(clean, 320 + 25 * k + 200);   // background tabs may never finish the animations
  }
  var asrTimer = 0, asrShow = null, asrRaf = 0;
  // Glide the Asr dot along the curve from the old time to the new one, in step with the digit roll.
  function glideAsr(from, to) {
    cancelAnimationFrame(asrRaf);
    var start = performance.now(), dur = 420;
    (function step(ts) {
      var k = Math.min(1, (ts - start) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      asrShow = from + (to - from) * e;
      renderCurve(nowMs());
      if (k < 1) asrRaf = requestAnimationFrame(step); else asrShow = null;
    })(start);
  }
  function setAsr(later) {
    if (later === asrLater) return;
    track('city_asr_toggled', { asr: later ? 'later' : 'earlier' });
    var fromAsr = asrShow != null ? asrShow : dayFor(selected).t[3];   // mid-glide: start from where the dot is
    asrLater = later;
    try { localStorage.setItem(ASR_KEY, later ? 'later' : 'earlier'); } catch (e) { /* storage blocked */ }
    dayCache = {};
    var toggle = document.querySelector('#list .asr-toggle');
    if (reduceMotion || !toggle || !toggle.animate) { render(); return; }
    // In place first, so the CSS transitions run: the thumb slides, the labels crossfade, and the
    // time crossfades in place. Then the full render moves the highlight.
    toggle.classList.toggle('is-later', later);
    Array.prototype.forEach.call(toggle.querySelectorAll('[data-asr]'), function (b) {
      b.setAttribute('aria-pressed', String((b.getAttribute('data-asr') === 'later') === later));
    });
    var t = toggle.closest('.row').querySelector('.t');
    var next = formatTime(dayFor(selected).t[3]);
    morphTime(t, next, later ? -1 : 1);
    glideAsr(fromAsr, dayFor(selected).t[3]);
    clearTimeout(asrTimer);
    asrTimer = setTimeout(function () { cancelAnimationFrame(asrRaf); asrShow = null; animateNext = true; render(); }, 420);   // after the digit roll; lands the dot even if frames were throttled
  }

  // ---------- Server-rendered SEO content (src/render/page.ts) ----------
  // The page ships with the build day's times as HTML. If the visitor's "today"
  // differs (stale build, or the page left open past midnight), refresh the
  // today-values and the timetable highlight; the "Updated" stamp stays true.
  var longFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  function tzName(style) {
    var p = new Intl.DateTimeFormat(city.lang || 'en-GB', { timeZone: tz, timeZoneName: style }).formatToParts(new Date(nowMs()))
      .filter(function (x) { return x.type === 'timeZoneName'; })[0];
    if (!p) return '';
    // Some browsers give UTC+0 as an offset ("GMT+00:00", "GMT+0"); show it the way Node/CLDR names it.
    if (/^GMT([+-]0{1,2}(:00)?)?$/.test(p.value)) return style === 'long' ? 'Greenwich Mean Time' : 'GMT';
    return p.value;
  }
  function syncSeo() {
    each('[data-tz-name]', function (n) { var l = tzName('long'), a = tzName('short'); if (l && a && n.textContent !== l + ' (' + a + ')') n.textContent = l + ' (' + a + ')'; });
    var answer = $('answer');
    if (answer && answer.getAttribute('data-date') !== todayYmd) {
      var td = dayFor(todayYmd), t = td.base.concat([td.asrHanafi]);  // data-today="6" = Hanafi Asr
      answer.setAttribute('data-date', todayYmd);
      each('[data-today]', function (n) { n.textContent = formatTime(t[+n.getAttribute('data-today')]); });
      each('[data-today-date]', function (n) {
        n.textContent = longFmt.format(dateObj(todayYmd)).replace(',', '');
        if (n.tagName === 'TIME') n.setAttribute('datetime', todayYmd);
      });
      each('[data-today-hijri]', function (n) { n.textContent = hijriLabel(todayYmd, false); });
    }
    each('.timetable tr[data-date]', function (r) {
      var on = r.getAttribute('data-date') === todayYmd;
      r.classList.toggle('today', on);
      r.classList.toggle('past', r.getAttribute('data-date') < todayYmd);
      if (on) r.setAttribute('aria-current', 'date'); else r.removeAttribute('aria-current');
    });
  }

  function render() {
    var now = nowMs();
    var newToday = ymdOf(now);
    if (newToday !== todayYmd) { if (selected === todayYmd) selected = newToday; todayYmd = newToday; }
    applyTheme(now);
    renderHeader(now);
    renderCurve(now);
    renderDay(now);
    syncSeo();
  }

  // ---------- Wiring ----------
  function on(id, ev, fn) { var n = $(id); if (n) n.addEventListener(ev, fn); }
  on('prev', 'click', function () { selected = addDays(selected, -1); render(); });
  on('next', 'click', function () { selected = addDays(selected, 1); render(); });

  // Local-only debug switch (localhost / LAN dev server): cycles the theme Auto → Day → Night via the
  // same ?theme= override. Never rendered on a real host.
  if (/^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)$/.test(location.hostname)) {
    var dbg = document.createElement('button');
    var modes = ['auto', 'day', 'night'];
    var label = function () { dbg.textContent = 'Theme: ' + (params.get('theme') || 'auto'); };
    dbg.type = 'button';
    dbg.style.cssText = 'position:fixed;bottom:calc(96px + env(safe-area-inset-bottom));left:8px;z-index:2000;padding:6px 10px;border:0;border-radius:8px;background:#C4001A;color:#FFF;font:600 12px Poppins,sans-serif;cursor:pointer';
    dbg.addEventListener('click', function () {
      var next = modes[(modes.indexOf(params.get('theme') || 'auto') + 1) % modes.length];
      if (next === 'auto') params.delete('theme'); else params.set('theme', next);
      history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
      label(); render();
    });
    label();
    body.appendChild(dbg);
  }
  // Anywhere on the chip opens the standard dialog, except on another day, where the chip goes back to
  // today first. showModal gives Escape, a backdrop and focus return for free; a click on the backdrop closes it too.
  var dialog = $('std-dialog');
  on('chip', 'click', function (e) {
    var onBadge = e.target.closest && e.target.closest('#chip-badge');
    if (selected !== todayYmd && !onBadge) { selected = todayYmd; render(); return; }
    track('city_verified_sheet_opened', { source: onBadge ? 'badge' : 'chip' });
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  });
  document.querySelectorAll('[data-open-std]').forEach(function (b) { b.addEventListener('click', function () { track('city_verified_sheet_opened', { source: 'box' }); if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); }); });
  on('std-dialog', 'click', function (e) { if (e.target === dialog) dialog.close(); });
  on('std-close', 'click', function () { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); });
  on('list', 'click', function (e) {
    var b = e.target.closest && e.target.closest('[data-asr]');
    if (b) setAsr(b.getAttribute('data-asr') === 'later');
  });
  var resizeTimer;
  // ResizeObserver also catches viewport changes that fire no resize event.
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { placeSky(); buildStars(); renderCurve(nowMs()); }, 100);
    }).observe(document.documentElement);
  }
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { placeSky(); buildStars(); renderCurve(nowMs()); }, 100);
  });

  // ---------- Floating app banner ----------
  // GET goes to the visitor's store; the banner itself never changes or closes.
  if ($('app-banner') && /android/i.test(navigator.userAgent)) {
    $('app-banner').href = 'https://play.google.com/store/apps/details?id=com.pillars.pillars';
  }
  on('app-banner', 'click', function () { track('city_app_banner_tapped', { store: /android/i.test(navigator.userAgent) ? 'play' : 'app_store', leaving: true }); });

  placeSky();
  render();
  requestAnimationFrame(frame);

  // WebMCP: read-only tools that let an AI agent in the browser query this city (where supported).
  function timesOut(d) {
    var out = {};
    NAMES.forEach(function (n, i) { out[n.toLowerCase()] = formatTime(d.base[i]); });
    out.asr_hanafi = formatTime(d.asrHanafi);
    if (timetable) out.origin = d.origin;
    return out;
  }
  // Declarative WebMCP: the hidden date form steps the page to a day and answers with its times.
  on('date-form', 'submit', function (e) {
    e.preventDefault();
    var ymd = e.target.elements.date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    selected = ymd; render();
    if (e.respondWith) {
      var out = { city: city.place, date: ymd, timezone: city.timezone, standard: city.standard }, t = timesOut(dayFor(ymd));
      for (var k in t) out[k] = t[k];
      e.respondWith(Promise.resolve(JSON.stringify(out)));
    }
  });
  var mc = document.modelContext || navigator.modelContext;
  function tool(def) {
    try { mc.registerTool(def); } catch (e) { /* tool registration is optional */ }
  }
  if (mc && typeof mc.registerTool === 'function') {
    var noArgs = { type: 'object', properties: {}, additionalProperties: false };
    // A published timetable's times are not a calculation method's; naming one would contradict the standard.
    var methodOut = timetable ? undefined : city.method;
    tool({
      name: 'get_prayer_times',
      description: 'Prayer (salah) times for ' + city.place + ' on a given date: Fajr, Sunrise, Dhuhr, Asr (Shafi\'i and Hanafi), Maghrib, Isha, in local time.',
      inputSchema: {
        type: 'object',
        properties: { date: { type: 'string', description: 'Date as YYYY-MM-DD. Defaults to today in ' + city.name + '.', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async function (args) {
        var ymd = args && /^\d{4}-\d{2}-\d{2}$/.test(args.date || '') ? args.date : todayYmd;
        var out = { city: city.place, date: ymd, timezone: city.timezone, standard: city.standard, method: methodOut }, t = timesOut(dayFor(ymd));
        for (var k in t) out[k] = t[k];
        return JSON.stringify(out);
      }
    });
    tool({
      name: 'get_next_prayer',
      description: 'The next prayer in ' + city.place + ' from now: its name, local time and minutes until it begins. Asr follows the Earlier (Shafi\'i) / Later (Hanafi) choice selected on the page.',
      inputSchema: noArgs,
      annotations: { readOnlyHint: true },
      execute: async function () {
        var now = nowMs(), ymd = todayYmd, d = dayFor(ymd), i = 0;
        while (i < 6 && d.t[i] <= now) i++;
        if (i === 6) { ymd = addDays(todayYmd, 1); d = dayFor(ymd); i = 0; }
        return JSON.stringify({
          city: city.place, prayer: NAMES[i], date: ymd, time: formatTime(d.t[i]),
          minutes_until: Math.max(0, Math.ceil((d.t[i] - now) / 60000)),
          asr: asrLater ? 'hanafi' : 'shafii', timezone: city.timezone
        });
      }
    });
    tool({
      name: 'get_monthly_timetable',
      description: 'Daily prayer timetable for ' + city.place + ' for a whole month: Fajr, Sunrise, Dhuhr, Asr (Shafi\'i and Hanafi), Maghrib, Isha and the Hijri (Umm al-Qura) date for each day.',
      inputSchema: {
        type: 'object',
        properties: { month: { type: 'string', description: 'Month as YYYY-MM. Defaults to the current month in ' + city.name + '.', pattern: '^\\d{4}-\\d{2}$' } },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async function (args) {
        var m = args && /^\d{4}-(0[1-9]|1[0-2])$/.test(args.month || '') ? args.month : todayYmd.slice(0, 7);
        var a = m.split('-'), n = new Date(Date.UTC(+a[0], +a[1], 0)).getUTCDate(), days = [];
        for (var i = 1; i <= n; i++) {
          var ymd = m + '-' + pad(i), row = { date: ymd, hijri: hijriLabel(ymd, false) }, t = timesOut(dayFor(ymd));
          for (var k in t) row[k] = t[k];
          days.push(row);
        }
        return JSON.stringify({ city: city.place, month: m, timezone: city.timezone, standard: city.standard, method: methodOut, days: days });
      }
    });
    if (city.qibla) tool({
      name: 'get_qibla_direction',
      description: 'Qibla direction from ' + city.place + ': the great-circle bearing to the Kaaba in degrees from true north, with a compass word.',
      inputSchema: noArgs,
      annotations: { readOnlyHint: true },
      execute: async function () {
        return JSON.stringify({ city: city.place, bearing_degrees: city.qibla.bearing, compass: city.qibla.compass, reference: 'true north' });
      }
    });
    if (city.mosques) tool({
      name: 'get_jumuah_and_mosques',
      description: 'Mosques in ' + city.place + ' listed on this page with their jama\'ah (iqamah) times and Jumu\'ah times, plus the next Friday\'s Dhuhr start time.',
      inputSchema: noArgs,
      annotations: { readOnlyHint: true },
      execute: async function () {
        var fri = todayYmd;
        while (dateObj(fri).getUTCDay() !== 5) fri = addDays(fri, 1);
        return JSON.stringify({
          city: city.place, mosque_times_date: city.mosquesDate,
          next_friday: { date: fri, dhuhr_starts: formatTime(dayFor(fri).base[2]) },
          mosques: city.mosques
        });
      }
    });
  }

  // Countdown every second; everything else when the minute rolls over.
  var lastMinute = Math.floor(nowMs() / 60000);
  setInterval(function () {
    var now = nowMs();
    var minute = Math.floor(now / 60000);
    if (minute !== lastMinute) { lastMinute = minute; render(); return; }
    renderHeader(now);
  }, 1000);
})();

// FAQ: one question open at a time (native details[name] does this in new browsers; this covers older ones).
document.querySelectorAll('details.faq-item').forEach(function (d, _, all) {
  d.addEventListener('toggle', function () {
    if (d.open) all.forEach(function (o) { if (o !== d) o.open = false; });
  });
});

// Timetable: clipped to the coming days until "Show the full timetable". The server sends the whole month
// unclipped with the button hidden, so without script nothing is cut off.
(function () {
  var clip = document.getElementById('tt-clip'), btn = document.getElementById('tt-more');
  if (!clip || !btn) return;
  clip.classList.add('clip');
  btn.hidden = false;
  var label = btn.textContent;   // "Show the Full <Month> Timetable", from the server
  btn.addEventListener('click', function () {
    var open = !clip.classList.toggle('clip');
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Show Less' : label;
    track('city_timetable_toggled', { expanded: open });
    window.dispatchEvent(new Event('resize'));   // the floating column headings re-measure
  });
})();

// Timetable: the column headings float at the top of the screen while the month scrolls past, then the
// table's last row pushes them off. A fixed clone of the thead, because the wrapper scrolls sideways
// (which stops CSS sticky). The clone scrolls in step with the wrapper, so the date corner stays sticky.
(function () {
  var items = [];
  document.querySelectorAll('.table-wrap').forEach(function (wrap) {
    var table = wrap.querySelector('table.timetable');
    if (!table || !table.tHead) return;
    var box = document.createElement('div');
    box.className = 'tt-float';
    box.setAttribute('aria-hidden', 'true');
    var clone = document.createElement('table');
    clone.className = 'timetable';
    clone.appendChild(table.tHead.cloneNode(true));
    box.appendChild(clone);
    (wrap.closest('.card') || wrap.parentNode).appendChild(box);
    items.push({ wrap: wrap, table: table, box: box, clone: clone, on: false });
  });
  if (!items.length) return;

  function measure(it) {
    var real = it.table.tHead.rows[0].cells, copy = it.clone.tHead.rows[0].cells;
    it.clone.style.width = it.table.getBoundingClientRect().width + 'px';
    for (var i = 0; i < real.length; i++) copy[i].style.width = real[i].getBoundingClientRect().width + 'px';
    it.clone.tHead.rows[0].style.height = it.table.tHead.getBoundingClientRect().height + 'px';
  }
  function update() {
    queued = false;
    items.forEach(function (it) {
      var head = it.table.tHead.getBoundingClientRect();
      var tb = it.table.getBoundingClientRect();
      var top = barH();
      var show = head.top < top && tb.bottom > top;
      if (show !== it.on) { it.on = show; it.box.classList.toggle('on', show); }
      if (!show) return;
      var w = it.wrap.getBoundingClientRect();
      it.box.style.left = w.left + 'px';
      it.box.style.width = it.wrap.clientWidth + 'px';
      it.box.style.top = top + 'px';
      it.box.style.transform = 'translateY(' + Math.min(0, tb.bottom - top - head.height) + 'px)';
      it.box.scrollLeft = it.wrap.scrollLeft;
    });
  }
  function barH() { var b = document.getElementById('topbar'); return b ? b.offsetHeight : 0; }
  var queued = false;
  function queue() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  function remeasure() { items.forEach(measure); queue(); }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', remeasure, { passive: true });
  items.forEach(function (it) { it.wrap.addEventListener('scroll', queue, { passive: true }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  remeasure();
})();

// Column width for the full-bleed parts (city.css --vw): follows body as it animates between the phone
// and desktop layouts, and leaves out any classic scrollbar gutter.
(function () {
  if (!window.ResizeObserver) return;
  var root = document.documentElement;
  function set() { root.style.setProperty('--vw', document.body.clientWidth + 'px'); }
  set();
  new ResizeObserver(set).observe(document.body);
})();

// Scroll bar: a blurred strip with the current prayer and its countdown appears once the header's pill
// scrolls up under it, so the time left stays in view anywhere on the page.
(function () {
  var bar = document.getElementById('topbar'), pill = document.getElementById('countdown');
  var top = document.getElementById('to-top');
  if (!bar || !pill) return;
  var on = false, queued = false;
  function update() {
    queued = false;
    var show = pill.getBoundingClientRect().bottom < bar.offsetHeight;
    if (show !== on) { on = show; bar.classList.toggle('on', show); if (top) { top.classList.toggle('is-on', show); if (show) place(); } }
  }
  // Back-to-top arrow: shows with the bar, 10px above the app banner, scrolls home to the app section.
  var banner = document.getElementById('app-banner');
  function place() {
    var r = banner && banner.offsetHeight ? banner.getBoundingClientRect() : null;
    top.style.bottom = r && r.top < innerHeight ? (innerHeight - r.top + 10) + 'px' : '';
  }
  if (top) top.addEventListener('click', function () {
    track('city_back_to_top_tapped');
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
  });
  function queue() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', function () { if (on && top) place(); queue(); }, { passive: true });
  update();
})();

// Embed widget card: copy the iframe snippet, with a spoken status for screen readers.
(function () {
  var btn = document.getElementById('copy-embed'), code = document.getElementById('embed-code'), status = document.getElementById('copy-status');
  if (!btn || !code) return;
  var timer;
  function say(msg) {
    if (!status) return;
    status.textContent = msg;
    clearTimeout(timer);
    timer = setTimeout(function () { status.textContent = ''; }, 4000);
  }
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* unsupported */ }
    ta.remove();
    return ok;
  }
  btn.addEventListener('click', function () {
    var text = code.textContent;
    var done = function () { say('Copied to clipboard'); };
    var fail = function () { say(fallback(text) ? 'Copied to clipboard' : 'Copy failed, select the code and copy it'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
    else fail();
  });
})();
