import { describe, expect, test } from "bun:test";
import { isSafeUrl, unsafeUrl } from "./safe-url";

describe("SafeUrl / unsafeUrl", () => {
  test("unsafeUrl embrulha a string sem alterá-la", () => {
    const u = unsafeUrl("javascript:void(0)");
    expect(isSafeUrl(u)).toBe(true);
    expect(u.value).toBe("javascript:void(0)");
    expect(String(u)).toBe("javascript:void(0)");
  });
  test("string e objetos comuns não são SafeUrl (sem falsificação estrutural)", () => {
    expect(isSafeUrl("javascript:x")).toBe(false);
    expect(isSafeUrl({ value: "javascript:x" })).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
  });
});

describe("SafeUrl com marca Symbol.for", () => {
  const BRAND = Symbol.for("slash.safeUrl");
  test("a marca é propriedade própria; poluir o protótipo não forja SafeUrl", () => {
    (Object.prototype as any)[BRAND] = true;
    try {
      expect(isSafeUrl({ value: "javascript:x" })).toBe(false);
      expect(isSafeUrl(Object.create({ [BRAND]: true, value: "javascript:x" }))).toBe(false);
    } finally {
      delete (Object.prototype as any)[BRAND];
    }
  });
  test("objeto com a marca própria (outro bundle/realm) é reconhecido", () => {
    expect(isSafeUrl({ [BRAND]: true, value: "/x" })).toBe(true);
    expect(isSafeUrl({ [BRAND]: true, value: 1 })).toBe(false);
  });
  test("não é instanceof de nada exposto: reconhecimento independe de classe", () => {
    expect(Object.hasOwn(unsafeUrl("/x"), BRAND)).toBe(true);
    expect(Object.isFrozen(unsafeUrl("/x"))).toBe(true);
  });
});

describe("exports públicos", () => {
  test("core, ssr e index expõem unsafeUrl/isSafeUrl", async () => {
    const [core, ssr, index] = await Promise.all([import("./core"), import("./ssr"), import("./index")]);
    for (const mod of [core, ssr, index]) {
      expect(mod.unsafeUrl).toBe(unsafeUrl);
      expect(mod.isSafeUrl).toBe(isSafeUrl);
    }
  });
});
