import { describe, it, expect } from "bun:test";
import { h } from "./element";
import type { Props } from "../types";

describe("rendering/element", () => {
  describe("h() - elementos nativos", () => {
    it("cria elemento div por padrão", () => {
      const el = h(null, null);
      expect(el.nodeName).toBe("DIV");
    });

    it("cria elemento com tag especificada", () => {
      const el = h("span", null);
      expect(el.nodeName).toBe("SPAN");
    });

    it("cria elemento SVG para tags SVG", () => {
      const el = h("svg", null) as Element;
      expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
    });

    it("aplica props ao elemento", () => {
      const props: Props = { id: "test", className: "foo" };
      const el = h("div", props) as HTMLElement;
      expect(el.id).toBe("test");
      expect(el.className).toBe("foo");
    });

    it("adiciona children texto", () => {
      const el = h("div", null, "hello", " ", "world");
      expect(el.textContent).toBe("hello world");
    });

    it("adiciona children elementos", () => {
      const child1 = document.createElement("span");
      const child2 = document.createElement("span");
      const el = h("div", null, child1, child2);
      expect((el as Element).children.length).toBe(2);
    });

    it("adiciona children array", () => {
      const el = h("div", null, ["a", "b", "c"]);
      expect(el.textContent).toBe("abc");
    });

    it("ignora children null e false", () => {
      const el = h("div", null, "a", null, "b", false, "c");
      expect(el.textContent).toBe("abc");
    });
  });

  describe("h() - componentes", () => {
    it("executa componente e retorna resultado", () => {
      const Component = () => {
        return h("span", { id: "component" }, "Component Content");
      };

      const el = h(Component, null);
      expect(el.nodeName).toBe("SPAN");
      expect((el as HTMLElement).id).toBe("component");
      expect(el.textContent).toBe("Component Content");
    });

    it("passa props para componente", () => {
      const Component = ({ message }: { message: string }) => {
        return h("div", null, message);
      };

      const el = h(Component, { message: "Hello" });
      expect(el.textContent).toBe("Hello");
    });

    it("passa children para componente", () => {
      const Component = ({ children }: { children: unknown }) => {
        return h("div", null, children as string);
      };

      const el = h(Component, null, "Child Content");
      expect(el.textContent).toBe("Child Content");
    });

    it("retorna fragment se componente retorna não-Node", () => {
      const Component = () => "Just text";
      const el = h(Component, null);
      expect(el.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE);
    });
  });

  describe("h() - casos especiais", () => {
    it("ignora prop 'children' (reservada)", () => {
      const el = h("div", { children: "ignored" }) as Element;
      expect(el.getAttribute("children")).toBeNull();
    });

    it("cria elemento vazio sem children", () => {
      const el = h("div", null);
      expect(el.childNodes.length).toBe(0);
    });

    it("cria elemento com props null", () => {
      const el = h("div", null, "content");
      expect(el.textContent).toBe("content");
    });
  });
});
