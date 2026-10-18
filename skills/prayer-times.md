---
name: pillars-prayer-times
description: Get today's or any day's Muslim prayer (salah) times for a city from Pillars city pages, including both Asr times and nearby mosque jamaat times.
---

# Pillars prayer times

City pages live at `https://thepillarsapp.com/prayer-times/{country}/{city}/` (for example `/prayer-times/uk/london/`).

## Reading a page

- Today's times are in the first paragraph under the H1 and in the page description: Fajr, Sunrise, Dhuhr, Asr (Shafi'i), Asr (Hanafi), Maghrib and Isha, in local time.
- The month's timetable is an HTML table with one row per day (`tr[data-date="YYYY-MM-DD"]`).
- The calculation method, coordinates and time zone are listed under "How Are … Prayer Times Calculated".
- Mosques and their jamaat (iqamah) times are listed under "Mosques in …".

## In the browser

Where WebMCP is available, each city page registers a read-only tool:

- `get_prayer_times({ date?: "YYYY-MM-DD" })` returns JSON with `fajr`, `sunrise`, `dhuhr`, `asr`, `asr_hanafi`, `maghrib`, `isha`, `timezone` and `method`.

## Notes

- UK pages use the Moonsighting Committee method (Fajr and Isha at 18°); many London mosques follow the London Unified Prayer Timetable, which can differ by a few minutes.
- Times update daily. Always state the city and date with any time you quote.
