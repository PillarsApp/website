// Mosque prayer times page. Logic mirrors masjid_timetable_list.dart:
// athan-based current prayer, finished rows at 0.35, one inline iqama
// countdown, Jumuah rows on Friday only. All times are mosque-local.
(function () {
  'use strict';

  var data = JSON.parse(document.getElementById('mosque-data').textContent);
  var masjid = data.masjid;
  var tz = masjid.timezone;
  var params = new URLSearchParams(location.search);
  var use24h = params.get('clock') === '24';
  var COL = use24h ? 64 : 86;

  var PRAYERS = [
    ['fajr', 'Fajr'], ['sunrise', 'Sunrise'], ['dhuhr', 'Dhuhr'],
    ['asr', 'Asr'], ['maghrib', 'Maghrib'], ['isha', 'Isha']
  ];

  // ---------- Mosque-local clock ----------
  // ?now=2026-10-14T13:10 pins the clock (mosque-local) for testing.
  var pinned = params.get('now');
  var startReal = Date.now();
  var pinnedSecs = null;
  if (pinned) {
    var m = pinned.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) pinnedSecs = { date: m[1], secs: (+m[2]) * 3600 + (+m[3]) * 60 + (+(m[4] || 0)) };
  }
  var fmtParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });

  function localNow() {
    if (pinnedSecs) {
      return { date: pinnedSecs.date, secs: pinnedSecs.secs + Math.floor((Date.now() - startReal) / 1000) };
    }
    var p = {};
    fmtParts.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { date: p.year + '-' + p.month + '-' + p.day, secs: (+p.hour) * 3600 + (+p.minute) * 60 + (+p.second) };
  }

  function toSecs(hhmm) {
    if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
    var a = hhmm.split(':');
    return (+a[0]) * 3600 + (+a[1]) * 60;
  }

  // prayer_time_slot.dart: "h:mm a", or "HH:mm"; exactly 12:00 stays "12:00".
  function formatTime(hhmm) {
    var s = toSecs(hhmm);
    if (s === null) return '—';
    var h = Math.floor(s / 3600), mi = (s % 3600) / 60;
    var mm = (mi < 10 ? '0' : '') + mi;
    if (use24h || (h === 12 && mi === 0)) return (h < 10 ? '0' : '') + h + ':' + mm;
    var ap = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + mm + ' ' + ap;
  }

  function formatCountdown(secs) {
    var h = Math.floor(secs / 3600), mi = Math.floor((secs % 3600) / 60), s = secs % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return h > 0 ? h + ':' + pad(mi) + ':' + pad(s) : mi + ':' + pad(s);
  }

  function dateObj(ymd) {
    var a = ymd.split('-');
    return new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12));
  }

  var gregFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  var hijriDay = new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura', { timeZone: 'UTC', day: 'numeric' });
  var hijriMonth = new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura', { timeZone: 'UTC', month: 'long' });

  function hijriLabel(ymd, afterSunset) {
    var d = dateObj(ymd);
    var day = hijriDay.format(d), month = hijriMonth.format(d);
    if (!afterSunset) return day + ' ' + month;
    var next = new Date(d.getTime() + 864e5);
    var nDay = hijriDay.format(next), nMonth = hijriMonth.format(next);
    return nMonth === month ? day + '/' + nDay + ' ' + month : nDay + ' ' + nMonth;
  }

  // ---------- State ----------
  var days = data.days;
  var now = localNow();
  var todayIdx = Math.max(0, days.findIndex(function (d) { return d.date === now.date; }));
  var selected = todayIdx;

  var $ = function (id) { return document.getElementById(id); };
  var body = document.body;

  // ---------- Theme: night after Maghrib until Fajr; Fajr theme until sunrise ----------
  function applyTheme() {
    var forced = params.get('theme');
    var t = days[todayIdx].athan;
    var n = localNow().secs;
    var theme = 'day';
    if (forced) theme = forced;
    else if (n >= toSecs(t.maghrib) || n < toSecs(t.fajr)) theme = 'night';
    else if (n < toSecs(t.sunrise)) theme = 'fajr';
    body.classList.toggle('theme-night', theme === 'night');
    body.classList.toggle('theme-fajr', theme === 'fajr');
    return theme;
  }

  // ---------- Rows ----------
  function buildRows(day) {
    var rows = PRAYERS.map(function (p) {
      return { key: p[0], name: p[1], athan: day.athan[p[0]], iqama: p[0] === 'sunrise' ? null : day.iqamah[p[0]], hasIqamaCol: p[0] !== 'sunrise' };
    });
    var isFriday = dateObj(day.date).getUTCDay() === 5;
    if (isFriday && day.jummah && day.jummah.length) {
      var dhuhrAt = 2;
      rows[dhuhrAt].iqama = null;
      var j = day.jummah.map(function (time, i) {
        return { key: 'jumuah' + i, name: day.jummah.length > 1 ? 'Jumuah ' + (i + 1) : 'Jumuah', athan: null, iqama: time, jumuah: true, hasIqamaCol: true };
      });
      rows.splice.apply(rows, [dhuhrAt + 1, 0].concat(j));
    }
    return rows;
  }

  function render() {
    now = localNow();
    var day = days[selected];
    var isToday = selected === todayIdx;
    var isPast = selected < todayIdx;
    var theme = applyTheme();

    // Chip + date row
    var chip = $('chip');
    chip.style.opacity = isToday ? 1 : (theme === 'night' ? 0.4 : 0.3);
    chip.style.cursor = isToday ? 'default' : 'pointer';
    $('date-greg').textContent = gregFmt.format(dateObj(day.date)).replace(',', '');
    var afterSunset = isToday && now.secs >= toSecs(day.athan.maghrib);
    $('date-hijri').textContent = hijriLabel(day.date, afterSunset);
    $('prev').disabled = selected === 0;
    $('next').disabled = selected === days.length - 1;

    var rows = buildRows(day);

    // Current prayer: last athan <= now, today only.
    var current = -1;
    if (isToday) {
      rows.forEach(function (r, i) {
        var s = toSecs(r.athan);
        if (s !== null && s <= now.secs) current = i;
      });
      // A Jumuah row that follows the current Dhuhr is not "current", but past ones fade.
    }

    // Inline countdown: first iqama still ahead, today only.
    var countdownAt = -1;
    if (isToday) {
      countdownAt = rows.findIndex(function (r) {
        var s = toSecs(r.iqama);
        return s !== null && s > now.secs;
      });
    }

    var tt = $('timetable');
    tt.style.setProperty('--col', COL + 'px');
    var html = '';
    if (data.times_reliable === false) {
      html += '<div class="warn">The prayer times from this mosque seem incorrect. Please verify prayer times with the mosque directly.</div>';
    }
    html += '<div class="head"><div class="head-chip"><span>ATHAN</span></div><div class="head-chip"><span>IQAMA</span></div></div>';

    rows.forEach(function (r, i) {
      var finished = isPast;
      if (isToday) {
        finished = r.jumuah ? toSecs(r.iqama) <= now.secs : current > -1 && i < current;
      }
      var isCurrent = i === current;
      var cls = 'row' + (isCurrent ? ' current' : '') + (finished && !isCurrent ? ' finished' : '');
      var label = r.name + (r.athan ? ', athan ' + formatTime(r.athan) : '') + (r.iqama ? ', iqama ' + formatTime(r.iqama) : '');
      html += '<div class="' + cls + '" aria-label="' + label + '">';
      html += '<span class="name">' + r.name + '</span>';
      if (i === countdownAt) {
        html += '<span class="countdown" id="countdown" aria-label="Iqama in ' + formatCountdown(toSecs(r.iqama) - now.secs) + '">' + formatCountdown(toSecs(r.iqama) - now.secs) + '</span>';
      }
      html += r.jumuah ? '' : '<span class="t">' + formatTime(r.athan) + '</span>';
      html += '<span class="t">' + (r.hasIqamaCol ? (r.iqama ? formatTime(r.iqama) : (r.key === 'dhuhr' ? '' : '—')) : '') + '</span>';
      html += '</div>';
      var isLast = i === rows.length - 1;
      var hide = isCurrent || i === current - 1;
      if (!(isLast && isCurrent)) html += '<div class="sep' + (hide ? ' hidden' : '') + '"></div>';
    });
    tt.innerHTML = html;
  }

  // ---------- Map ----------
  var tileLayer, map;
  function setupMap() {
    if (!window.L) return;
    map = L.map('map', {
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
      tap: false,
      attributionControl: true
    });
    map.attributionControl.setPrefix(false);
    var pinIcon = L.divIcon({
      className: '',
      html: '<div class="pin">' + document.querySelector('.chip-icon').outerHTML.replace('chip-icon', '') + '</div>',
      iconSize: [30, 30], iconAnchor: [15, 15]
    });
    // Offset the centre so the pin sits in the visible (unfaded) top of the map.
    map.setView([masjid.lat, masjid.lng], 15);
    map.panBy([0, 50], { animate: false });
    L.marker([masjid.lat, masjid.lng], { icon: pinIcon, keyboard: false }).addTo(map);
    setTiles();
  }
  function setTiles() {
    if (!map) return;
    // Night styling is a CSS filter on the tile pane (mosque.css).
    if (tileLayer) return;
    tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
  }

  // ---------- Wiring ----------
  $('prev').addEventListener('click', function () { if (selected > 0) { selected--; render(); } });
  $('next').addEventListener('click', function () { if (selected < days.length - 1) { selected++; render(); } });
  $('chip').addEventListener('click', function () { if (selected !== todayIdx) { selected = todayIdx; render(); } });

  $('directions').href = 'https://www.google.com/maps/dir/?api=1&destination=' + masjid.lat + ',' + masjid.lng;

  $('share').addEventListener('click', function () {
    var text = 'Prayer & Iqama Times for ' + masjid.name;
    if (navigator.share) {
      navigator.share({ title: document.title, text: text, url: location.href }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(location.href).then(function () {
        $('share-label').textContent = 'COPIED';
        setTimeout(function () { $('share-label').textContent = 'SHARE'; }, 2500);
      });
    }
  });

  render();
  setupMap();

  // Tick: countdown every second; full re-render when a minute rolls over.
  var lastMinute = Math.floor(localNow().secs / 60);
  setInterval(function () {
    var n = localNow();
    var minute = Math.floor(n.secs / 60);
    if (minute !== lastMinute) {
      lastMinute = minute;
      render();
      setTiles();
      return;
    }
    var el = $('countdown');
    if (!el || selected !== todayIdx) return;
    var rows = buildRows(days[selected]);
    var target = rows.find(function (r) { var s = toSecs(r.iqama); return s !== null && s > n.secs; });
    if (!target) { render(); return; }
    var left = toSecs(target.iqama) - n.secs;
    el.textContent = formatCountdown(left);
    el.setAttribute('aria-label', 'Iqama in ' + formatCountdown(left));
  }, 1000);
})();
