# City prayer-times pages

A Cloudflare Worker that serves `https://thepillarsapp.com/prayer-times/{country}/{city}/`. Webflow serves every other path on the domain.

| URL | Served by |
|---|---|
| `/prayer-times/uk/london/` | the city page, rendered by the Worker |
| `/prayer-times/uk/london/widget/` | the embeddable widget (framable, noindex) |
| `/prayer-times/`, `/prayer-times/uk/` | noindex index pages, so every breadcrumb resolves |
| `/prayer-times/_/…` | static files: fonts, vendored adhan, the hashed client script |
| the slashless forms | 301 to the slashed form, query kept |
| anything else under the prefix | the Worker's own 404 |

The Worker answers every request under its prefix itself. It never passes a request through, because behind Webflow's Orange-to-Orange proxy a passthrough would reach Webflow, which strips the slash and 404s.

## Analytics

Production pages (`ENVIRONMENT=production`) carry the homepage's Plausible and PostHog snippet from `page/analytics.html`, copied verbatim so consent state is shared with the Webflow site. The city page and the hub and country stubs include it. The widget and the 404 never do. Dev and staging send no analytics and are noindex.

## Preview while designing

```
cd city
npm install
npm run dev
```

Open <http://localhost:8787/prayer-times/uk/london/>. Edit `page/template.html`, `page/city.css`, `page/city.js` or anything in `src/` and reload. The dev server never caches.

`?now=2026-06-21T21:30` (city-local), `?theme=night`, `?clock=12` and `?safe` work as before. In dev, `?now` also sets the server's clock, so the tables and FAQ match what the browser shows. Outside dev the server ignores it.

Dev reads mosques from the deployed `masjid-times-prod` through a remote service binding, so `npm run dev` needs `wrangler login`. Without a login, or while masjid-times is unreachable, the page has no mosque section. That is the honest state, not an error: there are no placeholder mosques anywhere in the Worker. `npm test` never uses the remote binding and needs no login.

To get a page as a file for diffing, run `npm run snapshot -- uk/london > /tmp/london.html` while the dev server runs.

## Where things live

| Path | What |
|---|---|
| `page/template.html`, `page/city.css`, `page/city.js` | the page the owner designs. `template.html` has `<!-- build:NAME -->` regions that `src/render/page.ts` fills |
| `page/widget.html` | the widget template |
| `src/cities.ts` | the cities and countries (data), each city with the prayer-time standard it follows |
| `data/timetables/<id>.json` | published timetables, one per standard, in the shape `scripts/timetable-data.mjs` checks |
| `scripts/timetable-data.mjs` | runs inside `npm run client`: validates every timetable file and writes `src/generated/timetables.ts` (gitignored). A malformed file fails the build; a missing one means that city calculates |
| `src/routes.ts` | every URL the Worker serves, and the only place the page's links are built |
| `src/render/` | the renderers: page, widget, index stubs, prayer-time arithmetic |
| `src/mosques.ts` | the masjid-times `MosqueDirectory` client |
| `src/cache.ts` | the edge cache policy |
| `public/prayer-times/_/` | static files, at the path they are served from |
| `scripts/client.mjs` | bundles `page/city.js` to `public/prayer-times/_/city.<hash>.js` and writes `src/generated/client.ts` (gitignored) |

## Add a city

Add one entry to `CITIES` in `src/cities.ts`, with the standard its times follow:

```ts
{ country: "uk", slug: "leeds", name: "Leeds", lat: 53.8008, lng: -1.5491,
  timezone: "Europe/London", datePublished: "2026-11-02",
  mosques: { radiusKm: 12, max: 10, featured: [] },
  standard: { kind: "gps", name: "Moonsighting Committee method", asrFirst: "Hanafi",
    badge: "Calculated with the Moonsighting Committee method, within 2 minutes of …",
    isha: "… lists Isha about 4 minutes later than this page." } },
```

A standard is `gps` (calculated), `city-timetable` or `mosque`; the last two name a `timetable` id (a file under `data/timetables/`) or `null` when the standard's own times match the calculation. `asrFirst` is the Asr the list shows by default; `badge` and `isha` are the copy in the badge dialog and at the end of the Isha card. The dialog, the source line, the trust caption, the method card and the FAQ all follow the standard, so a city needs no copy change beyond those two lines.

For a published standard the clock reads the day's row from the timetable, fills any null column from the calculation, falls back to last year's row carried forward by whole days (so a clock change that moved between years lands right), and calculates when neither year is published. Every day that is not published is marked as an estimate. The client (`page/city.js`) applies the same rules to the rows the page inlines.

`npm test` rejects a duplicate `(country, slug)`, a malformed masjid id and an unknown country, and checks every bundled timetable belongs to a city and shares its zone. The "Prayer times near" card on each page is derived from the registry by distance, so it appears once a country has a second city.

The clock-change FAQ, the Isha summer answer and the Fajr/Isha method comparisons are derived from the city's zone, latitude and method, so a new city needs no copy change. A country with custom angles (France, Morocco, Indonesia and others) can be written in the data (`calc: { method: "Custom", … }`), but `page/city.js` reads `CalculationMethod[city.method]` and needs a matching change first.

## Refresh the timetables

`npm run timetables` re-runs every script in `scripts/timetables/` and prints a report: the last published day of each timetable and whether its script ran. It exits 1 when a script failed or a timetable runs out within 30 days. The London script needs `LONDON_PRAYER_TIMES_KEY` in the environment (the value is in `.dev.vars`), and the Chelmsford and Leicester scripts need `pdftotext` (poppler).

`.github/workflows/timetables.yml` runs it every Monday at 06:17 UTC, and on demand from the Actions tab. When a published time changed and the tests pass, it opens a pull request from a new `timetables/refresh` branch, which closes any older one. Merging that pull request deploys. When the report needs attention or the tests fail, the workflow opens or updates the issue "Prayer timetables need attention", and it closes the issue once nothing does. A script that fails keeps its last good file. The weekly run only adds and corrects days. A day the last file had and the run did not supply is kept, so a source that stops answering (Masjid Umar's site returns nothing to GitHub's runners) does not unpublish it. The report counts the upcoming days kept this way. To remove a day, run that timetable's own script. A new year usually brings new source URLs or a year to change in a script, and the issue shows that a month ahead.

## Checks

```
npm run check     # tsc, strict
npm test          # vitest in workerd (@cloudflare/vitest-pool-workers)
npm run golden    # London page against the old Node build, for two dates
```

`npm run golden` builds the output of the last commit before the Worker (`322d125`) in a temp directory and diffs it with the Worker's London page rendered with the calculated standard that build had. It lists the intended differences it ignores and exits 1 if any other line differs. It needs the git history.

## Deploy

Merging to `main` deploys. `.github/workflows/city.yml` runs `npm test` and `npm run check`, deploys staging, waits until the staging London page loads this build's client script, then deploys production. A merge that changes nothing under `city/` deploys nothing.

Each pull request that changes `city/` gets a Preview of the staging Worker at `https://pr-<number>-city-pages-staging.omar-abb.workers.dev/prayer-times/`. The workflow comments the link on the pull request, updates the same Preview on every push and deletes it when the pull request closes. A Preview behaves like staging: noindex, no analytics, mosques from `masjid-times-prod`. Its settings are `env.staging.previews` in `wrangler.jsonc`, because a Preview inherits no vars or bindings. Pull requests from forks are tested but get no Preview.

The workflow needs the repository secret `CLOUDFLARE_API_TOKEN`, a token made from the "Edit Cloudflare Workers" template for this account and the `thepillarsapp.com` zone. The production routes need the zone.

To deploy by hand, run one of these. Each runs the client build, `npm test` and `npm run check` first.

```
npm run deploy:staging       # https://city-pages-staging.omar-abb.workers.dev/prayer-times/uk/london/
npm run deploy:production    # routes thepillarsapp.com/prayer-times/* and thepillarsapp.com/prayer-times
```

Never run a bare `wrangler deploy`: the top-level config is the local `city-pages-dev` Worker. `npx wrangler deploy --env production --dry-run` lists the routes and the assets directory without deploying.

The production route is `thepillarsapp.com/prayer-times/*` plus the exact `thepillarsapp.com/prayer-times`. Do not use `thepillarsapp.com/prayer-times*`: it would capture the live Webflow pages `/prayer-times-app` and `/prayer-times-widget`.

### Caching

A rendered page is cached at the edge until the city's next local midnight, or for ten minutes when masjid-times was unavailable. The cache key is the canonical path, the deploy (`BUILD_ID`) and the city-local date, so a deploy flushes every page and a page can never be served on the wrong day. `x-city-cache: hit | miss | bypass` on each response shows which happened. The Cache API does nothing on `*.workers.dev`, so staging renders every request.

### Mosque data

Pages read mosques over RPC from the `MosqueDirectory` entrypoint of `masjid-times-prod`, through the `MASJID_TIMES` service binding. The binding is the authorization, so there is no secret to set. The entrypoint must be deployed in masjid-times before this Worker. `liveMosqueSource` in `src/mosques.ts` is the only code that talks to it.
