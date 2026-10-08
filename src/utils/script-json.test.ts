import { describe, expect, test } from "bun:test";
import { escapeJsonForScript } from "./script-json";

describe("escapeJsonForScript", () => {
  test("escapa <, >, &, U+2028 e U+2029", () => {
    const out = escapeJsonForScript('"</script><!-- & \u2028 \u2029"');
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
    expect(out).not.toContain("\u2028");
    expect(out).not.toContain("\u2029");
    expect(out).toContain("\\u003c/script\\u003e");
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  test("preserva o valor no round-trip", () => {
    const value = { a: "</script><!-- & > \u2028 \u2029" };
    expect(JSON.parse(escapeJsonForScript(JSON.stringify(value)))).toEqual(value);
  });
});
