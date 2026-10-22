/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import raw from "../wrangler.jsonc?raw";

// wrangler.jsonc here has only whole-line comments.
const config = JSON.parse(raw.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"));

describe("wrangler.jsonc", () => {
  const envs = { dev: config, staging: config.env.staging, production: config.env.production };

  it("repeats vars and assets in every env, because named envs do not inherit them", () => {
    const keys = Object.keys(config.vars).sort();
    for (const [name, env] of Object.entries(envs)) {
      expect(Object.keys(env.vars).sort(), name).toEqual(keys);
      expect(env.assets, name).toEqual({ directory: "./public", not_found_handling: "none" });
    }
    expect(Object.values(envs).map((e) => e.vars.ENVIRONMENT)).toEqual(["dev", "staging", "production"]);
  });

  it("routes only /prayer-times/* and the exact /prayer-times in production, never /prayer-times*", () => {
    const { routes } = envs.production;
    expect(routes.map((r: { pattern: string }) => r.pattern).sort()).toEqual(["thepillarsapp.com/prayer-times", "thepillarsapp.com/prayer-times/*"]);
    expect(new Set(routes.map((r: { zone_id: string }) => r.zone_id))).toEqual(new Set(["50f55a7e891d8e8bdc988d43e6a83a31"]));
    expect(envs.production.workers_dev).toBe(false);
    expect(envs.staging.routes).toBeUndefined();
  });

  it("deploys to named workers, never the dev one", () => {
    expect(envs.staging.name).toBe("city-pages-staging");
    expect(envs.production.name).toBe("city-pages-prod");
  });
});
