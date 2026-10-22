import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("routing", () => {
  it("answers unknown paths under the prefix with the Worker's own 404", async () => {
    const res = await SELF.fetch("https://example.com/prayer-times/x/");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });
});
