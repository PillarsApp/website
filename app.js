/* Pillars homepage behaviour. Vanilla JS, no framework.
   One small state object; each change repaints only the nodes that depend on it. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var root = $('page') || document.querySelector('.snapon, .snapoff');
  if (!root) return;
  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var isPhone = function () { return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches); };
  var STEP = 300, N = 13;
  var AY = { font: "'QCF P250', 'KFGQPC Hafs', serif", l1: '\ufc9c \ufc9d \ufc9e \ufc9f \ufca0 \ufca1', l2: '\ufca2 \ufca3 \ufca4 \ufca5 \ufcb6' };

  var state = {
    day: 0, pin: false, vh: 800, openQ: 0, showQr: false, ay1: '', ay2: '', ayQcf: false,
    count: 1600000 + Math.floor(Math.max(0, Date.now() - Date.UTC(2026, 9, 11)) / 86400000 * 1250)
  };

  /* ---------- nodes ---------- */
  var dayEl = $('day'), track = $('day-track'), stage = $('day-stage'), rail = $('day-rail');
  var feats = Array.prototype.slice.call(document.querySelectorAll('.m-feat'));
  var slots = rail ? Array.prototype.slice.call(rail.querySelectorAll('[data-mi]')).map(function (el) {
    var media = false; for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.classList.contains('m-in')) media = true;
    return { el: el, i: parseInt(el.getAttribute('data-mi'), 10), fx: !media };
  }) : [];
  var faqs = Array.prototype.slice.call(document.querySelectorAll('.faq-item'));
  var countEl = $('hdr-count'), qrBtn = $('qr-toggle'), qrPop = $('qr-pop');
  var ayBox = $('ayah-box'), ay = [$('ayah-1'), $('ayah-2')];

  /* ---------- painters ---------- */
  var paint = {
    count: function () { if (countEl) countEl.textContent = Math.round(state.count).toLocaleString('en-GB'); },
    day: function () {
      var d = state.day;
      feats.forEach(function (b, i) { b.setAttribute('aria-expanded', i === d ? 'true' : 'false'); });
      slots.forEach(function (s) {
        var on = s.i === d;
        if (s.fx) s.el.classList.toggle('fx-on', on);
        s.el.style.opacity = on ? 1 : 0;
        s.el.style.transform = 'translate(-50%, ' + (on ? '0px' : s.i < d ? '-28px' : '28px') + ') scale(' + (on ? 1 : 0.96) + ')';
      });
    },
    pin: function () {
      var p = state.pin, vh = state.vh;
      root.classList.toggle('snapon', p); root.classList.toggle('snapoff', !p);
      if (track) track.style.height = p ? (vh + STEP * (N - 1)) + 'px' : 'auto';
      if (stage) {
        stage.style.position = p ? 'sticky' : 'static';
        stage.style.height = p ? vh + 'px' : 'auto';
        stage.style.paddingTop = p ? Math.max(104, Math.round((vh - 880) / 2)) + 'px' : '0px';
      }
    },
    openQ: function () {
      faqs.forEach(function (it, i) {
        var open = i === state.openQ, b = it.querySelector('.m-faq-q'), m = it.querySelector('.faq-mark');
        it.classList.toggle('is-open', open);
        if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (m) m.textContent = open ? '−' : '+';
      });
    },
    showQr: function () {
      if (!qrBtn || !qrPop) return;
      qrPop.hidden = !state.showQr;
      qrBtn.setAttribute('aria-expanded', state.showQr ? 'true' : 'false');
      qrBtn.textContent = state.showQr ? 'Hide Download QR Code' : 'Show Download QR Code';
    },
    ay: function () {
      if (ay[0]) ay[0].style.fontSize = state.ay1 || 'clamp(36px, 8.6vw, 132px)';
      if (ay[1]) ay[1].style.fontSize = state.ay2 || 'clamp(36px, 8.6vw, 132px)';
    },
    ayQcf: function () {
      if (!state.ayQcf || !ayBox || !ay[0] || !ay[1]) return;
      ayBox.style.fontFamily = AY.font; ay[0].textContent = AY.l1; ay[1].textContent = AY.l2;
    }
  };
  var DEPS = { count: 'count', day: 'day', pin: 'pin', vh: 'pin', openQ: 'openQ', showQr: 'showQr', ay1: 'ay', ay2: 'ay', ayQcf: 'ayQcf' };
  var setState = function (next) {
    var todo = {};
    Object.keys(next).forEach(function (k) { if (state[k] !== next[k]) { state[k] = next[k]; todo[DEPS[k]] = 1; } });
    Object.keys(todo).forEach(function (k) { paint[k](); });
  };

  /* ---------- reviews: second copy of each row so the marquee loops seamlessly ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.rv-track[data-loop="clone"]'), function (t) {
    Array.prototype.slice.call(t.children).forEach(function (tile) {
      var c = tile.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.setAttribute('tabindex', '-1'); t.appendChild(c);
    });
  });

  /* ---------- Our Mission ayah: fit each line to 92% of the box ---------- */
  var fitAyah = function () {
    if (!ayBox) return;
    var w = ayBox.clientWidth * 0.92; var next = {};
    ['ay1', 'ay2'].forEach(function (k, n) {
      var el = ay[n]; if (!el || !el.offsetWidth) return;
      var size = Math.round(parseFloat(getComputedStyle(el).fontSize) * w / el.offsetWidth * 10) / 10;
      if (Math.abs(size - parseFloat(state[k] || 0)) > 0.6) next[k] = size + 'px';
    });
    if (Object.keys(next).length) setState(next);
  };
  fitAyah(); setTimeout(fitAyah, 400); setTimeout(fitAyah, 1500);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitAyah(); setTimeout(fitAyah, 200); });
  window.addEventListener('resize', fitAyah);
  if (document.fonts && document.fonts.load) document.fonts.load("40px 'QCF P250'", 'ﲜ').then(function (l) {
    if (l && l.length) { setState({ ayQcf: true }); [60, 400, 1200, 2500].forEach(function (t) { setTimeout(fitAyah, t); }); }
  }).catch(function () {});

  /* ---------- header counter ---------- */
  paint.count();
  (function tick() {
    setTimeout(function () {
      if (!isPhone()) setState({ count: state.count + 1 + Math.floor(Math.random() * 3) });
      tick();
    }, 2200 + Math.random() * 4300);
  })();

  /* ---------- features (#day): desktop pinned stage + scroll snap ---------- */
  var snapEl = null, dayRaf = 0, vhW;
  var dayScroller = function () {
    var n = track;
    while (n) {
      n = n.parentNode || n.host; if (!n) break; if (n.nodeType !== 1) continue;
      var oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 200) return n;
    }
    return null;
  };
  var dayGeo = function () {
    if (!track) return null;
    var sc = dayScroller(); var se = document.scrollingElement || document.documentElement;
    var vh = sc ? sc.clientHeight : window.innerHeight; var base = sc ? sc.getBoundingClientRect().top : 0;
    var can = vh >= 560 && vh < 1700 && (sc ? true : se.scrollHeight > vh + 200);
    return { tr: track, sc: sc, can: can, vh: vh, base: base };
  };
  var onDay = function () {
    dayRaf = 0;
    var g = dayGeo(); if (!g) return;
    var next = {};
    if (g.can !== state.pin) next.pin = g.can;
    var se = g.can ? (g.sc || document.documentElement) : null;
    if (se !== snapEl) {
      if (snapEl) snapEl.style.scrollSnapType = '';
      snapEl = se; if (se) se.style.scrollSnapType = 'y mandatory';
    }
    if (g.can) {
      if (!isPhone() || vhW !== window.innerWidth) {
        vhW = window.innerWidth;
        document.documentElement.style.setProperty('--vh', g.vh + 'px');
        if (g.vh !== state.vh) next.vh = g.vh;
      }
      if (state.pin && !isPhone()) {
        var i = Math.min(N - 1, Math.max(0, Math.round((g.base - g.tr.getBoundingClientRect().top) / STEP)));
        if (i !== state.day) next.day = i;
      }
    }
    if (Object.keys(next).length) setState(next);
  };
  var dayKick = function (e) {
    if (e && e.type === 'scroll' && (e.target === rail || (state.pin && isPhone()))) return;
    if (!dayRaf) dayRaf = requestAnimationFrame(onDay);
  };

  /* ---------- features on phones: horizontal carousel, dots follow the centred slide ---------- */
  var railC = null, railI, railRaf = 0, railT = 0, railTouch = false;
  var railMap = function () {
    if (!rail) return [];
    if (!railC) {
      var rb = rail.getBoundingClientRect(); var c = [];
      Array.prototype.forEach.call(rail.querySelectorAll('[data-mi]'), function (s) { var b = s.getBoundingClientRect(); c.push([parseInt(s.getAttribute('data-mi'), 10), b.left + b.width / 2 - rb.left + rail.scrollLeft]); });
      railC = c;
    }
    return railC;
  };
  var railPaint = function () {
    railRaf = 0; if (!rail || !isPhone()) return;
    var mid = rail.scrollLeft + rail.clientWidth / 2; var best = -1; var bd = 1e9;
    railMap().forEach(function (x) { var d = Math.abs(x[1] - mid); if (d < bd) { bd = d; best = x[0]; } });
    if (best >= 0 && best !== railI) { railI = best; if (dayEl) dayEl.setAttribute('data-mday', best); }
  };
  var railSettle = function () {
    clearTimeout(railT); railT = 0; if (railTouch || !isPhone()) return;
    railPaint();
    if (railI >= 0 && railI !== state.day) setState({ day: railI });
  };
  var railWait = function (ms) { clearTimeout(railT); railT = setTimeout(railSettle, ms); };
  var railKick = function () { if (!railRaf) railRaf = requestAnimationFrame(railPaint); railWait(160); };
  var railReset = function () { railC = null; railI = -1; railKick(); };

  var jumpT = 0;
  var dayGo = function (i) {
    if (isPhone()) {
      var c = rail && railMap().find(function (x) { return x[0] === i; });
      if (!c) { setState({ day: i }); return; }
      try { rail.scrollTo({ left: c[1] - rail.clientWidth / 2, behavior: calm ? 'auto' : 'smooth' }); } catch (e) { rail.scrollLeft = c[1] - rail.clientWidth / 2; }
      return;
    }
    var g = dayGeo();
    if (!g || !state.pin) { setState({ day: i }); return; }
    var delta = g.tr.getBoundingClientRect().top - g.base + i * STEP;
    if (Math.abs(delta) < 1) return;
    /* Chrome honours scroll-snap-stop:always for scrollBy, so a jump of several features would halt at the next one.
       .day-jump relaxes it on the day marks for the length of this one programmatic scroll. */
    root.classList.add('day-jump'); clearTimeout(jumpT);
    jumpT = setTimeout(function () { root.classList.remove('day-jump'); }, 1600);
    try { (g.sc || window).scrollBy({ top: delta, behavior: 'smooth' }); } catch (e2) { setState({ day: i }); }
  };

  if (rail) {
    rail.addEventListener('scroll', railKick, { passive: true });
    rail.addEventListener('touchstart', function () { railTouch = true; }, { passive: true });
    var railUp = function () { railTouch = false; railWait(160); };
    rail.addEventListener('touchend', railUp, { passive: true });
    rail.addEventListener('touchcancel', railUp, { passive: true });
    window.addEventListener('resize', railReset);
    [0, 400, 1500].forEach(function (t) { setTimeout(railReset, t); });
  }
  window.addEventListener('scroll', dayKick, { capture: true, passive: true });
  window.addEventListener('resize', dayKick);
  [0, 300, 1200, 3000].forEach(function (t) { setTimeout(dayKick, t); });
  feats.forEach(function (b, i) { b.addEventListener('click', function () { dayGo(i); }); });

  /* ---------- feature videos: play the active one once, rewind the rest ---------- */
  var syncVids = function () {
    try {
      if (!stage) return;
      Array.prototype.forEach.call(stage.querySelectorAll('video[data-fv]'), function (v) {
        if (String(v.getAttribute('data-fv')) === String(state.day)) {
          if (v.paused && !v.ended) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        } else {
          if (!v.paused) v.pause();
          if (v.currentTime) { try { v.currentTime = 0; } catch (e) {} }
        }
      });
    } catch (e) {}
  };
  setInterval(syncVids, 400);

  /* ---------- FAQ + QR ---------- */
  faqs.forEach(function (it, i) {
    var b = it.querySelector('.m-faq-q');
    if (b) b.addEventListener('click', function () { setState({ openQ: i === state.openQ ? -1 : i }); });
  });
  if (qrBtn) qrBtn.addEventListener('click', function () { setState({ showQr: !state.showQr }); });

  /* ---------- live prayer-times phone (hero + first feature slot) ---------- */
  function mountPhone(el, fixed) {
    const P = {"arc": "M-55 255.8C-30.4 271.9 -11.9 280 0.4 280C12.7 280 31.1 271.9 55.7 255.8C123.2 203.2 173.9 176.9 207.6 176.9C241.4 176.9 292 203.2 359.6 255.8C383.8 271.9 402.1 280 414.2 280C426.4 280 444.6 271.9 468.9 255.8", "bell": "M369.5 460.17C368.29 459.14 367.6 457.63 367.6 456.03L367.6 453.78C367.6 450.93 365.51 448.58 362.8 448.18L362.8 447.31C362.8 446.86 362.44 446.5 362 446.5C361.56 446.5 361.2 446.86 361.2 447.31L361.2 448.18C358.49 448.58 356.4 450.93 356.4 453.78L356.4 456.03C356.4 457.63 355.71 459.14 354.49 460.18C354.18 460.45 354 460.84 354 461.25C354 462.03 354.63 462.67 355.4 462.67L368.6 462.67C369.37 462.67 370 462.03 370 461.25C370 460.84 369.82 460.45 369.5 460.17L369.5 460.17ZM362 465.9C363.45 465.9 364.66 464.86 364.94 463.48L359.06 463.48C359.34 464.86 360.55 465.9 362 465.9L362 465.9Z", "arrowL": "M87.94 346L81.24 353L87.94 360", "arrowR": "M326.06 346L332.76 353L326.06 360", "crescent": "M301.46 386.99C301.35 386.88 301.19 386.84 301.05 386.89C299.09 387.59 296.91 387.1 295.45 385.63C293.98 384.17 293.49 381.99 294.19 380.03C294.24 379.89 294.2 379.73 294.09 379.62C293.98 379.51 293.82 379.47 293.68 379.52C292.81 379.83 292.03 380.32 291.38 380.97C288.98 383.38 288.98 387.29 291.39 389.69C293.79 392.1 297.7 392.1 300.11 389.7C300.76 389.05 301.25 388.27 301.56 387.4C301.61 387.26 301.57 387.1 301.46 386.99L301.46 386.99Z", "send": "M210.37 313.12C210.28 313.36 210.04 313.51 209.78 313.5C209.53 313.48 209.31 313.31 209.24 313.06L208.33 309.66L204.93 308.75C204.68 308.68 204.51 308.46 204.49 308.21C204.48 307.95 204.63 307.71 204.87 307.62L212.68 304.54C212.9 304.45 213.15 304.51 213.32 304.67C213.48 304.84 213.54 305.09 213.45 305.31L210.37 313.12L210.37 313.12Z", "treeF": "M39 170L34.8 213L43.2 213L39 170Z", "treeB": "M49 154L43.5 212L54.5 212L49 154Z", "nav_prayer": "M59.81 878.15C61.54 876.72 63.27 876 65 876C66.73 876 68.46 876.72 70.19 878.15C71.33 879.1 72 880.51 72 882L72 895C72 895.55 71.55 896 71 896L59 896C58.45 896 58 895.55 58 895L58 882C58 880.51 58.67 879.1 59.81 878.15L59.81 878.15Z", "nav_tracker": "M245.5 887L251.2 892.2L264 879", "nav_gear": "M351.29 876.81L352.37 879.54C352.6 880.11 353.22 880.41 353.81 880.24L356.48 879.41C357.12 880.05 357.68 880.78 358.12 881.58L356.75 883.94C356.44 884.46 356.61 885.15 357.11 885.49L359.25 886.96C359.17 887.91 358.96 888.84 358.61 889.71L356.07 890.1C355.46 890.2 355.02 890.74 355.06 891.36L355.26 893.96C354.49 894.51 353.64 894.93 352.75 895.21L350.8 893.41C350.35 893 349.65 893 349.2 893.41L347.25 895.21C346.36 894.93 345.51 894.51 344.74 893.96L344.94 891.36C344.98 890.74 344.54 890.2 343.93 890.1L341.39 889.71C341.04 888.84 340.83 887.91 340.75 886.96L342.89 885.49C343.39 885.15 343.56 884.46 343.25 883.94L341.88 881.58C342.32 880.78 342.88 880.05 343.52 879.41L346.19 880.24C346.78 880.41 347.4 880.11 347.63 879.54L348.71 876.81C349.14 876.76 349.56 876.73 350 876.73C350.44 876.73 350.86 876.76 351.29 876.81L351.29 876.81Z", "qibla": "data:image/png;base64,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"};
    const NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    const FR = [12.42, 20.36, 50.14, 66.02, 79.19, 87.37];
    const DOTS = [[12.4, 278], [54, 256.9], [207.8, 176.9], [294.4, 209.9], [358, 254.6], [400.4, 277.4]];
    const HM = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhul-Qa'dah", 'Dhul-Hijjah'];
    const TZ = { 'Europe/London': ['London', 51.5074, -0.1278, 'gb'], 'Europe/Dublin': ['Dublin', 53.3498, -6.2603, 'ie'], 'Europe/Paris': ['Paris', 48.8566, 2.3522, 'fr'], 'Europe/Berlin': ['Berlin', 52.52, 13.405, 'de'], 'Europe/Amsterdam': ['Amsterdam', 52.3676, 4.9041, 'nl'], 'Europe/Brussels': ['Brussels', 50.8503, 4.3517, 'be'], 'Europe/Madrid': ['Madrid', 40.4168, -3.7038, 'es'], 'Europe/Rome': ['Rome', 41.9028, 12.4964, 'it'], 'Europe/Stockholm': ['Stockholm', 59.3293, 18.0686, 'se'], 'Europe/Oslo': ['Oslo', 59.9139, 10.7522, 'no'], 'Europe/Copenhagen': ['Copenhagen', 55.6761, 12.5683, 'dk'], 'Europe/Zurich': ['Zurich', 47.3769, 8.5417, 'ch'], 'Europe/Vienna': ['Vienna', 48.2082, 16.3738, 'at'], 'Europe/Istanbul': ['Istanbul', 41.0082, 28.9784, 'tr'], 'Europe/Moscow': ['Moscow', 55.7558, 37.6173, 'ru'], 'Africa/Cairo': ['Cairo', 30.0444, 31.2357, 'eg'], 'Africa/Casablanca': ['Casablanca', 33.5731, -7.5898, 'ma'], 'Africa/Tunis': ['Tunis', 36.8065, 10.1815, 'tn'], 'Africa/Algiers': ['Algiers', 36.7538, 3.0588, 'dz'], 'Africa/Lagos': ['Lagos', 6.5244, 3.3792, 'ng'], 'Africa/Johannesburg': ['Johannesburg', -26.2041, 28.0473, 'za'], 'Africa/Nairobi': ['Nairobi', -1.2921, 36.8219, 'ke'], 'Asia/Riyadh': ['Riyadh', 24.7136, 46.6753, 'sa'], 'Asia/Dubai': ['Dubai', 25.2048, 55.2708, 'ae'], 'Asia/Qatar': ['Doha', 25.2854, 51.531, 'qa'], 'Asia/Kuwait': ['Kuwait City', 29.3759, 47.9774, 'kw'], 'Asia/Amman': ['Amman', 31.9539, 35.9106, 'jo'], 'Asia/Beirut': ['Beirut', 33.8938, 35.5018, 'lb'], 'Asia/Baghdad': ['Baghdad', 33.3152, 44.3661, 'iq'], 'Asia/Karachi': ['Karachi', 24.8607, 67.0011, 'pk'], 'Asia/Kolkata': ['Mumbai', 19.076, 72.8777, 'in'], 'Asia/Calcutta': ['Mumbai', 19.076, 72.8777, 'in'], 'Asia/Dhaka': ['Dhaka', 23.8103, 90.4125, 'bd'], 'Asia/Jakarta': ['Jakarta', -6.2088, 106.8456, 'id'], 'Asia/Kuala_Lumpur': ['Kuala Lumpur', 3.139, 101.6869, 'my'], 'Asia/Singapore': ['Singapore', 1.3521, 103.8198, 'sg'], 'Australia/Sydney': ['Sydney', -33.8688, 151.2093, 'au'], 'Australia/Melbourne': ['Melbourne', -37.8136, 144.9631, 'au'], 'Australia/Perth': ['Perth', -31.9505, 115.8605, 'au'], 'Pacific/Auckland': ['Auckland', -36.8485, 174.7633, 'nz'], 'America/New_York': ['New York', 40.7128, -74.006, 'us'], 'America/Chicago': ['Chicago', 41.8781, -87.6298, 'us'], 'America/Denver': ['Denver', 39.7392, -104.9903, 'us'], 'America/Los_Angeles': ['Los Angeles', 34.0522, -118.2437, 'us'], 'America/Toronto': ['Toronto', 43.6532, -79.3832, 'ca'], 'America/Vancouver': ['Vancouver', 49.2827, -123.1207, 'ca'] };
    let browserTz = 'Europe/London';
    try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || browserTz; } catch (e) {}
    const guess = TZ[browserTz];
    let loc = guess ? { city: guess[0], lat: guess[1], lng: guess[2], cc: guess[3], tz: browserTz } : { city: 'London', lat: 51.5074, lng: -0.1278, cc: 'gb', tz: 'Europe/London' };
    let use24 = true;
    try { use24 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === false; } catch (e) {}

    const RP = fixed ? 59.6 : 70; const R0 = fixed ? 419.9 : 463.5; const RF = fixed ? 19 : 20; const DF = fixed ? 16 : 20; const K = 1.3101;
    const GO = (dx, dy) => fixed ? '<g transform="translate(' + dx + ' ' + dy + ')">' : ''; const GC = fixed ? '</g>' : '';
    const rows = NAMES.map((n, i) => {
      const y = +(R0 + RP * i).toFixed(1);
      return '<g class="pp-row pp-f" data-row="' + i + '"><text x="52" y="' + y + '" font-size="' + RF + '" letter-spacing="1.05" fill="#00193E">' + n + '</text><text class="pp-time" x="340" y="' + y + '" font-size="' + RF + '" letter-spacing="1.05" text-anchor="end" fill="#00193E"></text><path d="' + P.bell + '" fill="#00193E" fill-rule="evenodd" transform="translate(0 ' + +(y - 463.5).toFixed(1) + ')"></path></g>';
    }).join('');
    const seps = NAMES.concat(fixed ? [''] : []).map((n, i) => '<rect class="pp-sep pp-f" x="' + (fixed ? 46 : 52) + '" y="' + +(R0 - (fixed ? 36.7 : 42) + RP * i).toFixed(1) + '" width="' + (fixed ? 322 : 313) + '" height="1" fill="#BFC5CF"></rect>').join('');
    const heads = NAMES.concat(['Duha']).map((n) => '<text class="pp-head pp-f" x="46" y="74" font-size="' + (fixed ? 38 : 42) + '" font-weight="500" fill="#041C38" opacity="0">' + n + '</text>').join('');
    const dots = DOTS.map((p) => '<circle class="pp-dot" cx="' + p[0] + '" cy="' + p[1] + '" r="6" stroke-width="3"></circle>').join('');
    let sd = 200; const rnd = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280; };
    let stars = ''; for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 10; gx++) { const x = (gx + 0.15 + 0.7 * rnd()) * 41.4; const y = 14 + (gy + 0.15 + 0.7 * rnd()) * 24.5; const r = 0.3 + 1.3 * rnd(); const m = 0.2 + 0.7 * rnd(); const du = 2.4 + 3.5 * rnd(); const dl = 5 * rnd(); if (Math.hypot(x - 361, y - 74) < 92 + r) continue; stars += '<circle class="pp-st" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(2) + '" fill="#fff" style="--m:' + m.toFixed(2) + ';animation-duration:' + du.toFixed(1) + 's;animation-delay:-' + dl.toFixed(1) + 's"></circle>'; }
    const nav = [['Prayer', 65, '#FF8F6E', 600], ['Qibla', 160, '#C0C0C0', 500], ['Tracker', 255, '#C0C0C0', 500], ['Settings', 350, '#C0C0C0', 500]].map((n) => '<text x="' + n[1] + '" y="911" font-size="10" font-weight="' + n[3] + '" text-anchor="middle" fill="' + n[2] + '">' + n[0] + '</text>').join('');
    const chrome = !fixed ? '' : '<style>.pp-sb{fill:#000;transition:fill .26s ease-in-out .78s}.pp-n .pp-sb{fill:#fff}.pp-sbo{stroke:#000;transition:stroke .26s ease-in-out .78s}.pp-n .pp-sbo{stroke:#fff}.pp-sm{fill:#062447;transition:fill .26s ease-in-out .78s}.pp-n .pp-sm{fill:#fff}.pp-tl{fill:#8493A4;transition:fill .26s ease-in-out .78s}.pp-n .pp-tl{fill:#C0C0C0}</style>'
      + '<rect class="pp-sm" x="152" y="761.8" width="109.4" height="29.5" rx="14.75" fill-opacity=".04"></rect><text x="206.7" y="781.5" font-size="14" letter-spacing=".3" text-anchor="middle" fill="#9E9E9E">SHOW MORE</text>'
      + '<text class="pp-sb" x="77.3" y="39.8" font-size="19.6" font-weight="600" letter-spacing="-.26" text-anchor="middle" style="font-family:-apple-system,SF Pro Text,SF Pro Display,Helvetica Neue,Inter,sans-serif">09:41</text><rect x="142.8" y="14.4" width="128.4" height="36.7" rx="18.35" fill="#000"></rect>'
      + '<g transform="translate(296.1 23.6) scale(' + K + ')"><g class="pp-sb"><rect x="0" y="8.5" width="3" height="4.5" rx=".8"></rect><rect x="4.4" y="6.2" width="3" height="6.8" rx=".8"></rect><rect x="8.8" y="3.6" width="3" height="9.4" rx=".8"></rect><rect x="13.2" y="1" width="3" height="12" rx=".8"></rect><path d="M28 3.1c2.6 0 4.9 1 6.6 2.7l-1.3 1.3A7.4 7.4 0 0 0 28 5c-2 0-3.9.8-5.3 2.1l-1.3-1.3A9.3 9.3 0 0 1 28 3.1zm0 3.6c1.6 0 3 .6 4.1 1.7L30.8 9.7A3.9 3.9 0 0 0 28 8.6c-1.1 0-2.1.4-2.8 1.1l-1.3-1.3A5.8 5.8 0 0 1 28 6.7zm0 3.6c.7 0 1.3.3 1.8.7L28 12.9l-1.8-1.9c.5-.4 1.1-.7 1.8-.7z"></path><rect x="41" y="3" width="16" height="8" rx="1.9"></rect><path d="M59.8 5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill-opacity=".5"></path></g><rect class="pp-sbo" x="39.5" y="1.5" width="19" height="11" rx="3.2" fill="none" stroke-opacity=".45" stroke-width="1"></rect></g>'
      + [['Prayer', 4.5, '<path d="M3.5 17V7a5.5 5.5 0 0 1 11 0v10z" fill="#FF8F6E"></path>'], ['Qibla', 83.5, '<circle cx="9" cy="9" r="7.6" stroke-width="1.2"></circle><path d="M11.6 5.6 10 10l-3.6 2.4L8 8z" fill="#C0C0C0" stroke="none"></path>'], ['Tracker', 162.5, '<path d="M3.3 9.6 7.3 13.6 14.9 5.4" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path>'], ['Settings', 241, '<circle cx="9" cy="9" r="6.9" stroke-width="2" stroke-dasharray="2.7 2.72" stroke-dashoffset="1.35" opacity=".9"></circle><circle cx="9" cy="9" r="5.3" stroke-width="1.2"></circle><circle cx="9" cy="9" r="2.2" stroke-width="1.2"></circle>']].map((t, i) => '<g transform="translate(' + ((t[1] + 26) * K).toFixed(1) + ' 811) scale(' + K + ')" fill="none" stroke="#C0C0C0">' + t[2] + '</g><text' + (i ? ' class="pp-tl"' : '') + ' x="' + ((t[1] + 35) * K).toFixed(1) + '" y="851" font-size="' + (i ? 13.1 : 15) + '" font-weight="' + (i ? 400 : 500) + '" letter-spacing=".39" text-anchor="middle"' + (i ? '' : ' fill="#FF8F6E"') + '>' + t[0] + '</text>').join('');
    el.innerHTML = '<svg viewBox="0 0 414 ' + (fixed ? 900 : 946) + '" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:100%;font-family:Poppins,sans-serif;cursor:pointer;user-select:none">'
      + '<style>.pp-f{transition:opacity .1s linear,transform .12s ease-out}.pp-dot{fill:#DAE2EB;stroke:#DDE3EB;transition:fill .1s linear,stroke .1s linear}.pp-dot.on{fill:#00193E;stroke:#00193E}.pp-box{transition:transform .13s cubic-bezier(.3,0,.2,1),opacity .1s linear}.pp-sun,.pp-tb,.pp-tf{transition:opacity .3s ease-in 1.04s}.pp-nsky{opacity:0;transition:opacity .52s ease-in-out}.pp-n .pp-day,.pp-n .pp-sun{visibility:hidden;transition:visibility 0s linear .8s}.pp-nfg{opacity:0;transition:opacity .26s ease-out}.pp-n .pp-sun,.pp-n .pp-tb,.pp-n .pp-tf{opacity:0;transition:opacity .26s ease-out}.pp-n .pp-nsky{opacity:1;transition:opacity .52s ease-in-out .26s}.pp-n .pp-nfg{opacity:1;transition:opacity .3s ease-in 1.04s}.pp-n .pp-row text,.pp-n .pp-row path{fill:#fff;transition:fill .26s ease-in-out .78s}.pp-n .pp-head{fill:#fff;transition:opacity .1s linear,transform .12s ease-out,fill .26s ease-in-out .78s}.pp-n .pp-box{stroke:#fff;transition:transform .13s cubic-bezier(.3,0,.2,1),opacity .1s linear,stroke .26s ease-in-out .78s}.pp-n .pp-dot,.pp-n .pp-dot.on{fill:#fff;stroke:#fff;transition:fill .26s ease-in-out .78s,stroke .26s ease-in-out .78s}.pp-n .pp-arc{stroke:#FFBC91;transition:stroke .26s ease-in-out .78s}.pp-n .pp-arc0{stroke:#E5DCDC;transition:stroke .26s ease-in-out .78s}.pp-n .pp-pill{fill:#fff;transition:fill .26s ease-in-out .78s}.pp-n .pp-cd{fill:#fff;opacity:.8;transition:fill .26s ease-in-out .78s,opacity .26s ease-in-out .78s}.pp-n .pp-greg,.pp-n .pp-hijt,.pp-n .pp-sel text,.pp-n .pp-sel path,.pp-n .pp-sel rect:not(.pp-selbox){fill:#FBBC91;transition:fill .26s ease-in-out .78s}.pp-n .pp-selbox,.pp-n .pp-arw{stroke:#FBBC91;transition:stroke .26s ease-in-out .78s}.pp-sun circle{transform-box:fill-box;transform-origin:center}.pp-sun circle:nth-child(1){animation:pp-s1 4s ease-in-out infinite alternate}.pp-sun circle:nth-child(2){animation:pp-s2 4s ease-in-out infinite alternate}@keyframes pp-s1{from{transform:scale(.84)}to{transform:scale(1)}}@keyframes pp-s2{from{transform:scale(.78)}to{transform:scale(1)}}.pp-mh{transform-box:fill-box;transform-origin:center;animation:pp-mh 8s ease-in-out infinite alternate}@keyframes pp-mh{from{transform:scale(.9)}to{transform:scale(1)}}.pp-st{animation:pp-tw 4s ease-in-out infinite}@keyframes pp-tw{0%,100%{opacity:.1}50%{opacity:var(--m)}}@media (prefers-reduced-motion: reduce){.pp-mh,.pp-st,.pp-sun circle{animation:none!important}.pp-st{opacity:var(--m)}}</style>'
      + '<defs><linearGradient id="pp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ABD5F0"></stop><stop offset=".39" stop-color="#F5FBFF"></stop><stop offset=".46" stop-color="#FFFFFF"></stop><stop offset="1" stop-color="#FFFFFF"></stop></linearGradient><linearGradient id="pp-nsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#031831"></stop><stop offset=".3" stop-color="#031831"></stop><stop offset=".6" stop-color="#062447"></stop><stop offset="1" stop-color="#062447"></stop></linearGradient></defs>'
      + '<rect class="pp-day" width="414" height="946" fill="url(#pp-sky)"></rect>'
      + '<g class="pp-sun"><circle cx="409" cy="4" r="151" fill="#EDC798" opacity=".3"></circle><circle cx="409" cy="4" r="102" fill="#F0A852" opacity=".56"></circle><circle cx="409" cy="4" r="60" fill="#F0A852"></circle></g><rect class="pp-nsky" width="414" height="946" fill="url(#pp-nsk)"></rect><g class="pp-nfg"' + (fixed ? ' transform="translate(0 34)"' : '') + '>' + stars + '<circle class="pp-mh" cx="361" cy="74" r="85" fill="#fff" opacity=".3"></circle><circle class="pp-mh" cx="361" cy="74" r="58" fill="#fff" opacity=".56"></circle><circle cx="361" cy="74" r="36" fill="#fff"></circle></g>'
      + GO(0, 11) + '<g class="pp-tb" opacity=".35"><path d="' + P.treeB + '" fill="#85B2A1"></path><rect x="47.8" y="212" width="3" height="5" fill="#C18B81"></rect></g>'
      + '<g class="pp-tf" opacity=".85"><path d="' + P.treeF + '" fill="#85B2A1"></path><rect x="38.1" y="213" width="2" height="4" fill="#C18B81"></rect></g>'
      + '<path d="' + P.arc + '" class="pp-arc0" fill="none" stroke="#CACAD3" stroke-opacity=".4" stroke-width="5" stroke-linecap="round"></path>'
      + '<path class="pp-arc" d="' + P.arc + '" pathLength="100" fill="none" stroke="#00193E" stroke-width="5" stroke-linecap="round" stroke-dasharray="12.42 100"></path>'
      + dots + GC + GO(-6, 40.6) + heads + GC
      + GO(-6, 29) + '<rect class="pp-pill" x="35" y="94" width="222" height="31" rx="14.5" fill="#062447" fill-opacity=".04"></rect>'
      + '<text class="pp-cd" x="49" y="115" font-size="16" font-weight="400" fill="#062447" opacity=".5"></text>' + GC
      + GO(0, -24) + '<g class="pp-sel"><rect class="pp-selbox" x="145.5" y="299.5" width="118" height="19" rx="2.5" fill="none" stroke="#00193E" stroke-width="1"></rect><text x="150.2" y="313.2" font-size="12" font-weight="500" fill="#00193E">TODAY</text><rect x="197.9" y="303.6" width="1.4" height="11" fill="#00193E"></rect><path d="' + P.send + '" fill="#00193E"></path><text class="pp-city" x="217.5" y="313.2" font-size="12" font-weight="500" fill="#00193E"></text></g>' + GC
      + '<path class="pp-arw" d="' + P.arrowL + '"' + (fixed ? ' transform="translate(-32.8 -10.4)"' : '') + ' fill="none" stroke="#00193E" stroke-width="2" stroke-linecap="square"></path><path class="pp-arw" d="' + P.arrowR + '"' + (fixed ? ' transform="translate(32.2 -10.4)"' : '') + ' fill="none" stroke="#00193E" stroke-width="2" stroke-linecap="square"></path>'
      + '<text class="pp-greg" x="207" y="' + (fixed ? 336 : 360) + '" font-size="' + DF + '" font-weight="500" text-anchor="middle" fill="#00193E"></text>'
      + '<g class="pp-hij"><text class="pp-hijt" x="0" y="' + (fixed ? 359.6 : 393) + '" font-size="' + DF + '" font-weight="500" fill="#FF8F6E" xml:space="preserve"></text><path class="pp-moon" d="' + P.crescent + '" fill="#00193E" opacity=".25"></path><text class="pp-hijn" x="0" y="' + (fixed ? 359.6 : 393) + '" font-size="' + DF + '" font-weight="500" fill="#00193E" opacity=".25"></text></g>'
      + seps + GO(-5, 0) + rows + GC
      + '<rect class="pp-box" x="29" y="' + (fixed ? 384.7 : 429.5) + '" width="356" height="' + (fixed ? 57.3 : 54) + '" rx="8.5" fill="none" stroke="#00193E" stroke-width="3"></rect>'
      + (fixed ? chrome : '<path d="' + P.nav_prayer + '" fill="#FF8F6E" fill-rule="evenodd"></path><path d="' + P.nav_tracker + '" fill="none" stroke="#C0C0C0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="' + P.nav_gear + '" fill="none" stroke="#C0C0C0" stroke-width="1.09" stroke-linejoin="round"></path><circle cx="350" cy="886" r="2.75" fill="none" stroke="#C0C0C0" stroke-width="1.09"></circle>'
      + '<image href="' + P.qibla + '" x="148" y="874" width="24" height="24"></image>' + nav)
      + '</svg>';
    const svg = el.firstChild;
    const q = (s) => svg.querySelector(s); const qa = (s) => Array.prototype.slice.call(svg.querySelectorAll(s));
    const R = { arc: q('.pp-arc'), dots: qa('.pp-dot'), heads: qa('.pp-head'), pill: q('.pp-pill'), cd: q('.pp-cd'), sel: q('.pp-sel'), selbox: q('.pp-selbox'), city: q('.pp-city'), greg: q('.pp-greg'), hij: q('.pp-hij'), hijt: q('.pp-hijt'), moon: q('.pp-moon'), hijn: q('.pp-hijn'), seps: qa('.pp-sep'), rows: qa('.pp-row'), times: qa('.pp-time'), box: q('.pp-box'), tb: q('.pp-tb'), tf: q('.pp-tf') };
    let T = null; let TN = 0; let dayKey = ''; let last = { cur: -9, hi: -9, cd: '', e: -1 }; let raf = 0; let dead = false; let started = false; let running = false; let tickN = 0;

    const parts = (d, opt, lc) => { const o = {}; new Intl.DateTimeFormat(lc || 'en-GB', Object.assign({ timeZone: loc.tz }, opt)).formatToParts(d).forEach((p) => { o[p.type] = p.value; }); return o; };
    const fmtTime = (d) => { try { if (use24) { const p = parts(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return p.hour + ':' + p.minute; } const p = parts(d, { hour: 'numeric', minute: '2-digit', hour12: true }, 'en-US'); return p.hour + ':' + p.minute + ' ' + p.dayPeriod; } catch (e) { return ''; } };
    const hijri = (d) => { const p = parts(d, { day: 'numeric', month: 'numeric', year: 'numeric' }, 'en-u-ca-islamic-umalqura-nu-latn'); return { d: parseInt(p.day, 10), m: parseInt(p.month, 10), y: parseInt(p.year, 10) }; };
    const params = (cc) => {
      const A = window.adhan; const M = A.CalculationMethod; const other = (f, i) => { const p = M.Other(); p.fajrAngle = f; p.ishaAngle = i; return p; };
      let p;
      if (cc === 'us' || cc === 'ca') p = M.NorthAmerica(); else if (cc === 'qa') p = M.Qatar(); else if (cc === 'sa') p = M.UmmAlQura(); else if (cc === 'eg' || cc === 'lb') p = M.Egyptian(); else if (cc === 'pk' || cc === 'in') p = M.Karachi(); else if (cc === 'ae') p = M.Dubai(); else if (cc === 'kw') p = M.Kuwait(); else if (cc === 'sg') p = M.Singapore(); else if (cc === 'tr') p = M.Turkey(); else if (cc === 'fr' || cc === 'ma') p = other(18, 18); else if (cc === 'au' || cc === 'nl' || cc === 'za') p = M.MuslimWorldLeague(); else if (cc === 'id' || cc === 'my') p = other(20, 18); else if (cc === 'be' || cc === 'jo' || cc === 'tn') p = other(18, 17); else p = M.MoonsightingCommittee();
      p.madhab = A.Madhab.Shafi; p.highLatitudeRule = A.HighLatitudeRule.TwilightAngle; return p;
    };
    const compute = () => {
      const now = new Date(); let day = now;
      try { const p = parts(now, { year: 'numeric', month: 'numeric', day: 'numeric' }); day = new Date(parseInt(p.year, 10), parseInt(p.month, 10) - 1, parseInt(p.day, 10), 12); } catch (e) {}
      let times = null;
      try { if (window.adhan) { const lat = Math.max(-65, Math.min(65, loc.lat)); const pt = new window.adhan.PrayerTimes(new window.adhan.Coordinates(lat, loc.lng), day, params(loc.cc)); times = [pt.fajr, pt.sunrise, pt.dhuhr, pt.asr, pt.maghrib, pt.isha].map((d) => d.getTime()); if (times.some((t) => !isFinite(t))) times = null; } } catch (e) { times = null; }
      const live = !!times;
      if (!times) { const b = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime(); times = [[5, 13], [6, 58], [12, 57], [15, 46], [18, 47], [20, 17]].map((hm) => b + (hm[0] * 60 + hm[1]) * 60000); }
      T = times; TN = times[0] + 86400000; dayKey = day.toDateString();
      try { if (live) { const d2 = new Date(day.getTime() + 86400000); const lat2 = Math.max(-65, Math.min(65, loc.lat)); const f2 = new window.adhan.PrayerTimes(new window.adhan.Coordinates(lat2, loc.lng), d2, params(loc.cc)).fajr.getTime(); if (isFinite(f2)) TN = f2; } } catch (e) {}
      R.times.forEach((t, i) => { t.textContent = live ? fmtTime(new Date(times[i])) : new Date(times[i]).toTimeString().slice(0, 5); });
      R.city.textContent = live ? loc.city : 'London';
      try { const g = parts(now, { weekday: 'long', day: 'numeric', month: 'long' }); R.greg.textContent = g.weekday + ' ' + g.day + ' ' + g.month; } catch (e) {}
      try { const h = hijri(now); R.hijt.textContent = h.d + ' ' + HM[h.m - 1] + ' ' + h.y; R.hijn.textContent = ''; R.moon.style.display = 'none'; } catch (e) {}
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'The Pillars prayer screen showing today’s prayer times for ' + R.city.textContent);
      layout(); last = { cur: -9, hi: -9, cd: '', e: -1 }; apply(fixed || (started && !running) ? endT() : T[1], 0, true);
    };
    const layout = () => {
      try {
        const cw = R.city.getComputedTextLength(); const w = 217.5 + cw + 5.5 - 145.5; R.selbox.setAttribute('width', w.toFixed(1)); R.sel.setAttribute('transform', 'translate(' + (62 - w / 2).toFixed(1) + ' 0)');
        const hw = R.hijt.getComputedTextLength(); const nw = R.hijn.getComputedTextLength(); const x0 = 207 - hw / 2;
        R.hijt.setAttribute('x', x0.toFixed(1)); R.moon.setAttribute('transform', 'translate(' + (x0 + hw + 9 - 291.4).toFixed(1) + ' 0)'); R.hijn.setAttribute('x', (x0 + hw + 9 + 10.2 + 8).toFixed(1));
        if (R.cd.textContent) R.pill.setAttribute('width', (R.cd.getComputedTextLength() + 28).toFixed(1));
      } catch (e) {}
    };
    const apply = (t, prog, force) => {
      if (!T) return;
      let cur = -1; for (let i = 0; i < 6; i++) if (t >= T[i]) cur = i;
      const nextT = cur < 0 ? T[0] : cur < 5 ? T[cur + 1] : TN; const nextName = cur < 0 || cur === 5 ? 'Fajr' : NAMES[cur + 1];
      const night = t >= T[4] || t < T[1] - 1; if (night !== last.night) { last.night = night; svg.classList.toggle('pp-n', night); if (el.parentNode && el.parentNode.classList) el.parentNode.classList.toggle('pp-night', night); }
      let e;
      if (cur < 0) e = FR[0] * 0.5;
      else if (cur === 5) e = FR[5] + (100 - FR[5]) * 0.5 * Math.max(0, Math.min(1, (t - T[5]) / (TN - T[5])));
      else e = FR[cur] + (FR[cur + 1] - FR[cur]) * Math.max(0, Math.min(1, (t - T[cur]) / (T[cur + 1] - T[cur])));
      if (Math.abs(e - last.e) > 0.01) { R.arc.setAttribute('stroke-dasharray', e.toFixed(2) + ' 100'); last.e = e; }
      const sway = -1.6 * Math.sin(Math.PI * 1.46 * (prog || 0)); R.tf.setAttribute('transform', 'rotate(' + sway.toFixed(3) + ' 39 214)'); R.tb.setAttribute('transform', 'rotate(' + (-sway).toFixed(3) + ' 48 214)');
      const hi = cur < 0 ? 5 : (cur === 1 && t >= T[1] + 900000) ? 6 : cur;
      if (hi !== last.hi) { last.hi = hi; R.heads.forEach((h, i) => { h.style.opacity = i === hi ? 1 : 0; h.style.transform = 'translateY(' + (i === hi ? 0 : -8) + 'px)'; }); }
      if (cur !== last.cur) {
        last.cur = cur;
        R.rows.forEach((r, i) => { r.style.opacity = i < cur ? 0.25 : 1; r.setAttribute('font-weight', i === cur ? 600 : 500); });
        R.seps.forEach((sp, i) => { sp.style.opacity = (cur >= 0 && (i === cur || i === cur + 1)) ? 0 : 0.3; });
        R.dots.forEach((d, i) => { d.classList.toggle('on', i <= cur); });
        R.box.style.opacity = cur < 0 ? 0 : 1; if (cur >= 0) R.box.style.transform = 'translateY(' + +(RP * cur).toFixed(1) + 'px)';
      }
      tickN++;
      if (force || !running || tickN % 5 === 0) {
        const m = Math.max(0, Math.ceil((nextT - t) / 60000)); const h = Math.floor(m / 60); const mm = m % 60;
        const txt = (h > 0 ? h + (h === 1 ? ' hr ' : ' hrs ') : '') + mm + (mm === 1 ? ' min' : ' mins') + ' until ' + nextName;
        if (txt !== last.cd) { last.cd = txt; R.cd.textContent = txt; try { R.pill.setAttribute('width', (R.cd.getComputedTextLength() + 28).toFixed(1)); } catch (e2) {} }
      }
    };
    const endT = () => fixed ? T[2] + 2400000 : Date.now();
    const play = () => {
      cancelAnimationFrame(raf); if (dead || !T) return;
      if (fixed) { running = false; apply(endT(), 0, true); return; }
      const fin = endT(); const END = fin < T[1] ? T[5] + 1500000 : fin; const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (calm) { running = false; apply(fin, 0, true); return; }
      const span = Math.max(1, END - T[1]); const dur = 1400 + 4200 * Math.min(1, span / (T[5] - T[1])); const t0 = performance.now(); running = true; apply(T[1], 0, true);
      const step = (ts) => { if (dead) return; const p = Math.min(1, (ts - t0) / dur); const ez = 1 - (1 - p) * (1 - p); if (p < 1) { apply(T[1] + span * ez, p); raf = requestAnimationFrame(step); } else { running = false; apply(endT(), 1, true); } };
      raf = requestAnimationFrame(step);
    };
    compute();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!dead) layout(); });
    const start = () => { if (started || dead) return; started = true; play(); };
    const live = setInterval(() => { if (dead || running || !started) return; if (new Date().toDateString() !== new Date(dayKey).toDateString() && new Date().getHours() < 1) compute(); else apply(endT(), 1, true); }, 15000);
    const setLoc = (g) => { if (dead || !g || !isFinite(g.lat) || !isFinite(g.lng) || !g.city) return; loc = g; compute(); };
    let cached = null; try { cached = JSON.parse(sessionStorage.getItem('pp-loc') || 'null'); } catch (e) {}
    if (cached) { setLoc(cached); start(); } else {
      setTimeout(start, 1200);
      try {
        fetch('https://get.geojs.io/v1/ip/geo.json').then((r) => r.json()).then((g) => {
          const o = { city: g.city || g.region || g.country, lat: parseFloat(g.latitude), lng: parseFloat(g.longitude), cc: String(g.country_code || '').toLowerCase(), tz: g.timezone || browserTz };
          try { new Intl.DateTimeFormat('en-GB', { timeZone: o.tz }); } catch (e) { o.tz = browserTz; }
          setLoc(o); try { sessionStorage.setItem('pp-loc', JSON.stringify(o)); } catch (e) {}
          start();
        }).catch(() => { start(); });
      } catch (e) { start(); }
    }
    svg.addEventListener('click', play);
    return { replay: play, destroy: () => { dead = true; cancelAnimationFrame(raf); clearInterval(live); } };
  }

  var heroLive = $('hero-live'); if (heroLive) mountPhone(heroLive);
  var dayLive = $('day-live'); if (dayLive) mountPhone(dayLive, true);

  /* test hook only: lets a script read state and jump to a feature */
  window.__pillars = { state: state, go: dayGo, set: setState };
})();
