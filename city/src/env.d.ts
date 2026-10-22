// Secrets are set with `wrangler secret put NAME --env <env>` and locally in
// .dev.vars (gitignored), so they never appear in wrangler.jsonc or in the
// generated worker-configuration.d.ts. Merges into the generated Env.
interface Env {
  // Legacy X-App-Secret for masjid-times. Absent locally unless set in
  // .dev.vars: the page then renders without a mosque section.
  MASJID_TIMES_SECRET?: string;
  // Service binding to masjid-times-prod in staging and production. Local dev
  // has none and fetches MASJID_TIMES_URL over the internet instead.
  MASJID_TIMES?: Fetcher;
}
