# City pages: parked list

Ideas and features set aside for later. Code that already exists is kept behind a flag, not deleted.

## Built, hidden behind a flag

Flags live in `src/render/page.ts`.

- **Embed widget card**: `SHOW_WIDGET_CARD`. Hidden 23 Oct 2026.
- **Nearby cities card**: `SHOW_NEARBY_CARD`. Hidden 23 Oct 2026. Its test in `test/page.test.ts` is skipped.
- **Breadcrumb hub and country links, plus BreadcrumbList schema**: `HUBS_LIVE`. Turn this on once the `/prayer-times/` and `/prayer-times/uk/` hub pages exist.

## Not built yet

- **Prayer time "notification" on landing**: when someone lands on a city page, slide in an iOS-style notification banner showing the current or next prayer time, and open the App Store when it is tapped. It is a styled in-page banner, not a real web push, so it needs no permission prompt.
- **Unified switch**: let people toggle between the city's published timetable and calculated times.
- **Ramadan page**: Suhoor and Iftar times for each city.
- **Hub pages**: `/prayer-times/` and a page for each country.
- **More cities**: London is the only live city so far.
- **US and Canada**.
