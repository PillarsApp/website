// City prayer times page. Logic mirrors the Pillars app's location page:
// current prayer header (current_prayer_text_widget.dart), countdown pill
// (prayer_page_countdown.dart), the sky (sun_animation.dart, moon_animation.dart),
// the curve and dots (prayer_curve_geometry.dart + prayer_painters.dart
// TimeOfDaySineCurvePainter) and the list (prayer_time_slot.dart).
// All times are city-local; the browser's own time zone never matters.
(function () {
  'use strict';

  var city = JSON.parse(document.getElementById('city-data').textContent);
  var tz = city.timezone;
  var params = new URLSearchParams(location.search);
  // Clock comes from the country config (build.mjs); ?clock=12|24 overrides it.
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

  var dayCache = {};
  function dayFor(ymd) {
    if (dayCache[ymd]) return dayCache[ymd];
    var a = ymdParts(ymd);
    // adhan reads only the date's Y/M/D, so a browser-local date works for any city.
    var pt = new adhan.PrayerTimes(coords, new Date(a[0], a[1] - 1, a[2]), calc);
    var day = {
      date: ymd,
      t: KEYS.map(function (k) { return pt[k].getTime(); }),
      asrHanafi: new adhan.PrayerTimes(coords, new Date(a[0], a[1] - 1, a[2]), calcHanafi).asr.getTime(),
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

  // ---------- State ----------
  var todayYmd = ymdOf(nowMs());
  var selected = todayYmd;
  var theme = 'day';

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
      buildStars();
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
      if (!part) { el.appendChild(document.createElement('br')); return; }
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
    var s = scaled(SEG_START, W, H), m = scaled(SEG_MID, W, H), e = scaled(SEG_END, W, H);
    var Ls = table(s), Lm = table(m), Le = table(e);

    var fajrT = MIDNIGHT_T + (minutesBetween(day.start, t[0]) / minutesBetween(day.start, t[1])) / 2;
    var dayMin = minutesBetween(t[1], t[4]);
    var dhuhrT = minutesBetween(t[1], t[2]) / dayMin;
    var asrT = minutesBetween(t[1], t[3]) / dayMin;
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
      var tip = progressLength(now, [[t[1], sunriseLen], [t[2], dhuhrLen], [t[3], asrLen], [t[4], maghribLen]]);
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
    dot(pointAt(m, asrT), now > t[3]);
    dot(pointAt(m, MAGHRIB_T), now > t[4]);
    dot(pointAt(e, ishaT), now > t[5]);
  }

  // ---------- Sky: sun, moon, stars ----------
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
    var moon = [W, 10];
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
    ['moon1', 'moon2', 'moon3'].forEach(function (id) { $(id).setAttribute('cx', W); $(id).setAttribute('cy', 10); });
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
    $('date-hijri').textContent = hijriLabel(selected, isToday && now >= day.t[4]);

    // Seven rows: both Asr times in time order. Asr is current from the early
    // (Shafi'i) Asr until Maghrib, so the early row carries the highlight; the
    // Hanafi row greys out once its time has passed.
    var rows = [];
    for (var k = 0; k < 6; k++) {
      rows.push({ name: k === 3 ? 'Asr <span class="tag">Earlier</span>' : NAMES[k], t: day.t[k], p: k });
      if (k === 3) rows.push({ name: 'Asr <span class="tag">Later \u00B7 Hanafi</span>', t: day.asrHanafi, p: 3, hanafi: true });
    }
    var curP = isToday ? currentIndex(day, now) : -1;
    var cur = curP < 0 ? -1 : (curP <= 3 ? curP : curP + 1);
    var SEP = '<li class="sep" aria-hidden="true"></li>';
    var html = cur === 0 ? '' : SEP;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var finished = selected < todayYmd || (isToday && (r.hanafi ? now >= r.t && curP >= 3 : cur > -1 && i < cur));
      var cls = 'row' + (i === cur ? ' current' : '') + (finished && i !== cur ? ' finished' : '');
      html += '<li class="' + cls + '"' + (i === cur ? ' aria-current="time"' : '') + '>' +
        '<span class="name">' + r.name + '</span> <span class="t">' + formatTime(r.t) + '</span></li>';
      if (i !== cur && i !== cur - 1) html += SEP;
    }
    $('list').innerHTML = html;
  }

  // ---------- Pre-rendered SEO content (build.mjs) ----------
  // The page ships with the build day's times as HTML. If the visitor's "today"
  // differs (stale build, or the page left open past midnight), refresh the
  // today-values and the timetable highlight; the "Updated" stamp stays true.
  var longFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  function tzName(style) {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: style }).formatToParts(new Date(nowMs()))
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
      var td = dayFor(todayYmd), t = td.t.concat([td.asrHanafi]);  // data-today="6" = Hanafi Asr
      answer.setAttribute('data-date', todayYmd);
      each('[data-today]', function (n) { n.textContent = formatTime(t[+n.getAttribute('data-today')]); });
      each('[data-today-date]', function (n) { n.textContent = longFmt.format(dateObj(todayYmd)).replace(',', ''); });
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
  on('chip', 'click', function () { if (selected !== todayYmd) { selected = todayYmd; render(); } });
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
  if ($('ab-get') && /android/i.test(navigator.userAgent)) {
    $('ab-get').href = 'https://play.google.com/store/apps/details?id=com.pillars.pillars';
  }

  placeSky();
  render();
  requestAnimationFrame(frame);

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

// Scroll bar: a blurred strip with the current prayer and its countdown appears once the header's pill
// scrolls up under it, so the time left stays in view anywhere on the page.
(function () {
  var bar = document.getElementById('topbar'), pill = document.getElementById('countdown');
  if (!bar || !pill) return;
  var on = false, queued = false;
  function update() {
    queued = false;
    var show = pill.getBoundingClientRect().bottom < bar.offsetHeight;
    if (show !== on) { on = show; bar.classList.toggle('on', show); }
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue, { passive: true });
  update();
})();
