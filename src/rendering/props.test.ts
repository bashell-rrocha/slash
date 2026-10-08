import { describe, it, expect, mock } from "bun:test";
import { setProp, applyClass, setPropReactive } from "./props";
import type { Reactive } from "../types";

// Helper para criar reactive mock
function createReactive<T>(initial: T): Reactive<T> {
  let value = initial;
  const subscribers = new Set<(v: T) => void>();

  return {
    get: () => value,
    subscribe: (fn: (v: T) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    set: (newValue: T) => {
      value = newValue;
      subscribers.forEach((fn) => fn(value));
    },
  } as Reactive<T> & { set: (v: T) => void };
}

describe("rendering/props", () => {
  describe("applyClass", () => {
    it("aplica classe string", () => {
      const el = document.createElement("div");
      applyClass(el, "foo bar");
      expect(el.className).toBe("foo bar");
    });

    it("aplica classe de array", () => {
      const el = document.createElement("div");
      applyClass(el, ["foo", false, "bar"]);
      expect(el.className).toBe("foo bar");
    });

    it("aplica classe de objeto", () => {
      const el = document.createElement("div");
      applyClass(el, { foo: true, bar: false, baz: true });
      expect(el.className).toBe("foo baz");
    });

    it("limpa classe para null", () => {
      const el = document.createElement("div");
      el.className = "test";
      applyClass(el, null);
      expect(el.className).toBe("");
    });
  });

  describe("setProp", () => {
    it("ignora key 'children'", () => {
      const el = document.createElement("div");
      setProp(el, "children", "test");
      expect(el.getAttribute("children")).toBeNull();
    });

    it("aplica atributo string", () => {
      const el = document.createElement("div");
      setProp(el, "title", "test");
      expect(el.getAttribute("title")).toBe("test");
    });

    it("aplica atributo boolean true", () => {
      const el = document.createElement("input");
      setProp(el, "disabled", true);
      expect(el.hasAttribute("disabled")).toBe(true);
    });

    it("remove atributo para false", () => {
      const el = document.createElement("input");
      el.setAttribute("disabled", "");
      setProp(el, "disabled", false);
      expect(el.hasAttribute("disabled")).toBe(false);
    });

    it("remove atributo customizado para null", () => {
      const el = document.createElement("div");
      el.setAttribute("data-test", "value");
      setProp(el, "data-test", null);
      expect(el.hasAttribute("data-test")).toBe(false);
    });

    it("aplica value a input", () => {
      const el = document.createElement("input");
      setProp(el, "value", "test");
      expect(el.value).toBe("test");
    });

    it("aplica checked a checkbox", () => {
      const el = document.createElement("input");
      el.type = "checkbox";
      setProp(el, "checked", true);
      expect(el.checked).toBe(true);
    });

    it("aplica style object", () => {
      const el = document.createElement("div");
      setProp(el, "style", { color: "red", fontSize: "16px" });
      expect(el.style.color).toBe("red");
      expect(el.style.fontSize).toBe("16px");
    });

    it("aplica event handler", () => {
      const el = document.createElement("button");
      const handler = mock(() => {});
      setProp(el, "onClick", handler);
      el.click();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("aplica value a select e atualiza options", () => {
      const el = document.createElement("select");
      el.innerHTML = '<option value="a">A</option><option value="b">B</option><option value="c">C</option>';
      setProp(el, "value", "b");
      expect(el.value).toBe("b");
      expect(el.options[0].selected).toBe(false);
      expect(el.options[1].selected).toBe(true);
      expect(el.options[2].selected).toBe(false);
    });
  });

  describe("setPropReactive", () => {
    it("aplica valor inicial de signal", () => {
      const el = document.createElement("div");
      const sig = createReactive("test");
      setPropReactive(el, "title", sig);
      expect(el.getAttribute("title")).toBe("test");
    });

    it("atualiza quando signal muda", () => {
      const el = document.createElement("div");
      const sig = createReactive("initial");
      setPropReactive(el, "title", sig);
      expect(el.getAttribute("title")).toBe("initial");

      (sig as Reactive<string> & { set: (v: string) => void }).set("updated");
      expect(el.getAttribute("title")).toBe("updated");
    });

    it("atualiza value de input quando signal muda", () => {
      const el = document.createElement("input");
      const sig = createReactive("initial");
      setPropReactive(el, "value", sig);
      expect(el.value).toBe("initial");

      (sig as Reactive<string> & { set: (v: string) => void }).set("updated");
      expect(el.value).toBe("updated");
    });

    it("atualiza checked de checkbox quando signal muda", () => {
      const el = document.createElement("input");
      el.type = "checkbox";
      const sig = createReactive(false);
      setPropReactive(el, "checked", sig);
      expect(el.checked).toBe(false);

      (sig as Reactive<boolean> & { set: (v: boolean) => void }).set(true);
      expect(el.checked).toBe(true);
    });

    it("atualiza className quando signal muda", () => {
      const el = document.createElement("div");
      const sig = createReactive("foo");
      setPropReactive(el, "class", sig);
      expect(el.className).toBe("foo");

      (sig as Reactive<string> & { set: (v: string) => void }).set("bar");
      expect(el.className).toBe("bar");
    });

    it("atualiza style object quando signal muda", () => {
      const el = document.createElement("div");
      const sig = createReactive({ color: "red", fontSize: "16px" });
      setPropReactive(el, "style", sig);
      expect(el.style.color).toBe("red");
      expect(el.style.fontSize).toBe("16px");

      (sig as Reactive<{ color: string; fontSize: string }> & { set: (v: { color: string; fontSize: string }) => void }).set({ color: "blue", fontSize: "20px" });
      expect(el.style.color).toBe("blue");
      expect(el.style.fontSize).toBe("20px");
    });

    it("atualiza select options quando signal muda", () => {
      const el = document.createElement("select");
      el.innerHTML = '<option value="a">A</option><option value="b">B</option>';
      const sig = createReactive("a");
      setPropReactive(el, "value", sig);
      expect(el.value).toBe("a");
      expect(el.options[0].selected).toBe(true);
      expect(el.options[1].selected).toBe(false);

      (sig as Reactive<string> & { set: (v: string) => void }).set("b");
      expect(el.value).toBe("b");
      expect(el.options[0].selected).toBe(false);
      expect(el.options[1].selected).toBe(true);
    });

    it("remove attribute quando signal é null", () => {
      const el = document.createElement("div");
      const sig = createReactive("test");
      setPropReactive(el, "data-foo", sig);
      expect(el.getAttribute("data-foo")).toBe("test");

      (sig as any).set(null);
      expect(el.hasAttribute("data-foo")).toBe(false);
    });

    it("remove attribute quando signal é false", () => {
      const el = document.createElement("div");
      const sig = createReactive("test");
      setPropReactive(el, "data-bar", sig);
      expect(el.getAttribute("data-bar")).toBe("test");

      (sig as any).set(false);
      expect(el.hasAttribute("data-bar")).toBe(false);
    });

    it("usa setAttribute quando Reflect.set falha", () => {
      const el = document.createElement("div");
      const sig = createReactive("test");
      // Testar propriedade que existe no elemento mas é readonly
      Object.defineProperty(el, "customProp", {
        value: "initial",
        writable: false,
        configurable: true
      });
      setPropReactive(el, "customProp", sig);
      expect(el.getAttribute("customProp")).toBe("test");

      (sig as any).set(null);
      expect(el.hasAttribute("customProp")).toBe(false);
    });
  });
});
