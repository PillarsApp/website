---
name: pillars-prayer-times
description: Get today's or any day's Muslim prayer (salah) times for a city from Pillars city pages, including both Asr times, Hijri dates, Qibla direction and mosque jama'ah and Jumu'ah times.
---

# Pillars prayer times

City pages live at `https://thepillarsapp.com/prayer-times/{country}/{city}/` (for example `/prayer-times/uk/london/`).

## Reading a page

- Today's times are in the first paragraph under the H1 and in the page description: Fajr, Sunrise, Dhuhr, Asr (Shafi'i), Asr (Hanafi), Maghrib and Isha, in local time. The line under it reads "Updated {date} · Times calculated with the {method}"; the date is also the WebPage `dateModified` in the JSON-LD.
- The month's timetable is an HTML table with one row per day (`tr[data-date="YYYY-MM-DD"]`); each row's date cell also carries the Hijri (Umm al-Qura) date.
- "Fajr Time In …", "Maghrib Time In …" (also iftar time) and "Isha Time In …" each open with a one-sentence answer for today and tomorrow, then a 7-day table.
- The calculation method, angles and high-latitude rule are listed under "How Are … Prayer Times Calculated".
- Mosques and their jama'ah (iqamah) and Jumu'ah times are listed under "Mosques In … | Jama'ah Times". Mosque times are as published by each mosque for the date shown.
- The FAQ (also in FAQPage JSON-LD) covers Hanafi Asr, Jumu'ah, Qibla direction, late summer Isha and clock changes.

## In the browser

Where WebMCP is available, each city page registers read-only tools. All return JSON in the city's local time and clock format.

- `get_prayer_times({ date?: "YYYY-MM-DD" })`: `fajr`, `sunrise`, `dhuhr`, `asr`, `asr_hanafi`, `maghrib`, `isha`, `timezone`, `method`.
- `get_next_prayer()`: the next prayer from now (`prayer`, `date`, `time`, `minutes_until`), using the Asr choice selected on the page (`asr`: `shafii` or `hanafi`).
- `get_monthly_timetable({ month?: "YYYY-MM" })`: one entry per day with all times, both Asr times and the Hijri date.
- `get_qibla_direction()`: `bearing_degrees` from true north and a `compass` word.
- `get_jumuah_and_mosques()`: the mosques listed on the page with `iqamah`, `athan` and `jummah` times, the next Friday's Dhuhr start, and `placeholder` (true means dummy layout data, never quote it as real).

## Embed widget

`https://thepillarsapp.com/prayer-times/widget/?city={slug}` is an iframe-able widget with today's six times (`&theme=light|dark`). It is noindex; cite the city page, not the widget.

## Notes

- Times are calculated with the adhan library; UK pages use the Moonsighting Committee method (Fajr and Isha at 18°). Many London mosques follow the London Unified Prayer Timetable, which can differ by a few minutes, most in summer.
- Times update daily. Always state the city and date with any time you quote.
