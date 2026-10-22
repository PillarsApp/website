import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Runs in workerd, so Intl (zone names, islamic-umalqura) behaves as in
// production. ENVIRONMENT=test turns the edge cache on (dev bypasses it).
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      remoteBindings: false,
      miniflare: {
        bindings: { ENVIRONMENT: "test" },
        serviceBindings: { MASJID_TIMES: () => new Response("masjid-times is not reachable from tests", { status: 503 }) },
      },
    }),
  ],
});
