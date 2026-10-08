import { describe, expect, test } from "bun:test";
import * as core from "./core";
import * as ssr from "./ssr";
import { BLOCKED_URL, sanitizeUrl } from "./utils/url-policy";

describe("sanitizeUrl and BLOCKED_URL exports", () => {
  for (const [name, mod] of [["core", core], ["ssr", ssr]] as const) {
    test(`${name} exports sanitizeUrl and BLOCKED_URL`, () => {
      expect(mod.sanitizeUrl).toBe(sanitizeUrl);
      expect(mod.BLOCKED_URL).toBe(BLOCKED_URL);
      expect(mod.sanitizeUrl("href", "/ok", "a")).toBe("/ok");
    });
  }
});
