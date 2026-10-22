/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import raw from "../public/_headers?raw";

// Workers static assets join the headers of every matching _headers rule, so
// two rules matching one file produce a doubled Cache-Control.
const rules = raw.split("\n").filter((l) => l.startsWith("/")).map((pattern) => ({
  pattern,
  re: new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`),
}));
const files = Object.keys(import.meta.glob("../public/prayer-times/**/*", { query: "?url" })).map((p) => p.replace("../public", ""));

describe("public/_headers", () => {
  it("gives every served file exactly one Cache-Control rule", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(rules.filter((r) => r.re.test(file)).map((r) => r.pattern), file).toHaveLength(1);
    }
  });
});
