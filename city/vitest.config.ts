import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

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
