# City pages: parked list

Ideas and features set aside for later. Code that already exists is kept behind a flag, not deleted.

## Built, hidden behind a flag

Flags live in `src/render/page.ts`.

- **Embed widget card**: `SHOW_WIDGET_CARD`. Hidden 23 Oct 2026.
- **"Verified by Pillars" box**: `SHOW_VERIFIED_BOX`. A card at the end of the page with the timetable name, the badge, one line on what it means and a "How We Verify" button that opens the verified sheet. Only for cities that follow a published timetable. Hidden 23 Oct 2026.
- **Breadcrumb hub and country links, plus BreadcrumbList schema**: `HUBS_LIVE`. Turn this on once the `/prayer-times/` and `/prayer-times/uk/` hub pages exist.

## Not built yet

- **Prayer time "notification" on landing**: when someone lands on a city page, slide in an iOS-style notification banner showing the current or next prayer time, and open the App Store when it is tapped. It is a styled in-page banner, not a real web push, so it needs no permission prompt.
- **Unified switch**: let people toggle between the city's published timetable and calculated times.
- **Ramadan page**: Suhoor and Iftar times for each city.
- **Hub pages**: `/prayer-times/` and a page for each country.
- **More cities**: London is the only live city so far.
- **US and Canada**.

## SEO and indexing to-dos

- **Link to London from the main site**: add a link from the homepage or footer. Google re-crawls those pages often, so this is the quickest way to get the city page indexed.
- **Add London to `llms.txt`**: this is done by hand in Webflow. The line to add is:
  `- [London prayer times](https://thepillarsapp.com/prayer-times/uk/london/): today's Fajr to Isha times from the London Unified Prayer Timetable, monthly calendar, local mosques`
- **IndexNow ping**: tell Bing and others about new city pages as they go live.
- **Share image on PR previews**: `og:image` always points at production, so a preview link shows no image until merge. Point it at the preview's own copy instead.

## Clean-ups from the PR No. 10 review

- **Flags are global**: `SHOW_WIDGET_CARD` and `HUBS_LIVE` apply to every city. Make them per city once more cities go live.
- **"Zuhr" is hardcoded**: the spelling is fixed in the SEO description for cities that have an `seo` block. Make it follow the city's own spelling.
- **Share image filename isn't versioned**: `og-london.png` is cached for a week, so a new image takes up to a week to show. Add a version or hash to the filename.
