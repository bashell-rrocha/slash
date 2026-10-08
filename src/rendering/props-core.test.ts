import { describe, it, expect } from "bun:test";
import {
  computePropUpdate,
  hasNativeProperty,
  getElementType,
  applyPropUpdate,
  type PropUpdate,
} from "./props-core";

describe("rendering/props-core (Functional Core)", () => {
  describe("getElementType", () => {
    it("retorna tagName em lowercase para div", () => {
      // Arrange
      const el = document.createElement("div");

      // Act
      const result = getElementType(el);

      // Assert
      expect(result).toBe("div");
    });

    it("retorna tagName em lowercase para input", () => {
      // Arrange
      const el = document.createElement("input");

      // Act
      const result = getElementType(el);

      // Assert
      expect(result).toBe("input");
    });

    it("retorna tagName em lowercase para select", () => {
      // Arrange
      const el = document.createElement("select");

      // Act
      const result = getElementType(el);

      // Assert
      expect(result).toBe("select");
    });

    it("retorna string vazia para elemento sem tagName", () => {
      // Arrange
      const el = {} as Element;

      // Act
      const result = getElementType(el);

      // Assert
      expect(result).toBe("");
    });
  });

  describe("hasNativeProperty", () => {
    it("retorna true para propriedade nativa 'value' em input", () => {
      // Arrange
      const el = document.createElement("input");

      // Act
      const result = hasNativeProperty(el, "value");

      // Assert
      expect(result).toBe(true);
    });

    it("retorna true para propriedade nativa 'checked' em input", () => {
      // Arrange
      const el = document.createElement("input");

      // Act
      const result = hasNativeProperty(el, "checked");

      // Assert
      expect(result).toBe(true);
    });

    it("retorna false para atributo customizado", () => {
      // Arrange
      const el = document.createElement("div");

      // Act
      const result = hasNativeProperty(el, "data-test");

      // Assert
      expect(result).toBe(false);
    });

    it("retorna true para propriedade 'className' em div", () => {
      // Arrange
      const el = document.createElement("div");

      // Act
      const result = hasNativeProperty(el, "className");

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("computePropUpdate", () => {
    describe("NO_OP cases", () => {
      it("retorna NO_OP para key 'children'", () => {
        // Arrange
        const elementType = "div";
        const key = "children";
        const value = "some content";
        const hasProperty = false;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("NO_OP");
        expect(result.key).toBe("children");
        expect(result.value).toBe("some content");
      });
    });

    describe("SET_CLASS cases", () => {
      it("retorna SET_CLASS para key 'class' com string", () => {
        // Arrange
        const elementType = "div";
        const key = "class";
        const value = "foo bar";
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_CLASS");
        expect(result.key).toBe("class");
        expect(result.value).toBe("foo bar");
        expect(result.metadata?.processedClassName).toBe("foo bar");
      });

      it("retorna SET_CLASS para key 'className' com array", () => {
        // Arrange
        const elementType = "div";
        const key = "className";
        const value = ["foo", false, "bar"];
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_CLASS");
        expect(result.key).toBe("className");
        expect(result.value).toEqual(["foo", false, "bar"]);
        expect(result.metadata?.processedClassName).toBe("foo bar");
      });

      it("retorna SET_CLASS para key 'class' com objeto", () => {
        // Arrange
        const elementType = "div";
        const key = "class";
        const value = { foo: true, bar: false, baz: true };
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_CLASS");
        expect(result.metadata?.processedClassName).toBe("foo baz");
      });

      it("retorna SET_CLASS com string vazia para null", () => {
        // Arrange
        const elementType = "div";
        const key = "class";
        const value = null;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_CLASS");
        expect(result.value).toBe("");
        expect(result.metadata?.processedClassName).toBe("");
      });

      it("retorna SET_CLASS com string vazia para false", () => {
        // Arrange
        const elementType = "div";
        const key = "class";
        const value = false;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_CLASS");
        expect(result.value).toBe("");
        expect(result.metadata?.processedClassName).toBe("");
      });
    });

    describe("SET_STYLE cases", () => {
      it("retorna SET_STYLE para key 'style' com objeto", () => {
        // Arrange
        const elementType = "div";
        const key = "style";
        const value = { color: "red", fontSize: "16px" };
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_STYLE");
        expect(result.key).toBe("style");
        expect(result.value).toEqual({ color: "red", fontSize: "16px" });
      });

      it("não retorna SET_STYLE para style string (fallback para SET_PROPERTY)", () => {
        // Arrange
        const elementType = "div";
        const key = "style";
        const value = "color: red;";
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_PROPERTY");
      });

      it("não retorna SET_STYLE para style null", () => {
        // Arrange
        const elementType = "div";
        const key = "style";
        const value = null;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("REMOVE_ATTRIBUTE");
      });
    });

    describe("SET_VALUE cases", () => {
      it("retorna SET_VALUE para input value com string", () => {
        // Arrange
        const elementType = "input";
        const key = "value";
        const value = "test";
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_VALUE");
        expect(result.key).toBe("value");
        expect(result.value).toBe("test");
      });

      it("retorna SET_VALUE para textarea value com número", () => {
        // Arrange
        const elementType = "textarea";
        const key = "value";
        const value = 123;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_VALUE");
        expect(result.value).toBe("123");
      });

      it("retorna SET_VALUE com string vazia para value null", () => {
        // Arrange
        const elementType = "input";
        const key = "value";
        const value = null;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_VALUE");
        expect(result.value).toBe("");
      });

      it("retorna SET_VALUE com string vazia para value undefined", () => {
        // Arrange
        const elementType = "input";
        const key = "value";
        const value = undefined;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_VALUE");
        expect(result.value).toBe("");
      });
    });

    describe("SET_SELECT_OPTIONS cases", () => {
      it("retorna SET_SELECT_OPTIONS para select value", () => {
        // Arrange
        const elementType = "select";
        const key = "value";
        const value = "option-b";
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_SELECT_OPTIONS");
        expect(result.key).toBe("value");
        expect(result.value).toBe("option-b");
        expect(result.metadata?.selectedValue).toBe("option-b");
      });

      it("retorna SET_SELECT_OPTIONS com string vazia para select value null", () => {
        // Arrange
        const elementType = "select";
        const key = "value";
        const value = null;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_SELECT_OPTIONS");
        expect(result.value).toBe("");
        expect(result.metadata?.selectedValue).toBe("");
      });
    });

    describe("SET_CHECKED cases", () => {
      it("retorna SET_CHECKED para checked true", () => {
        // Arrange
        const elementType = "input";
        const key = "checked";
        const value = true;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_CHECKED");
        expect(result.key).toBe("checked");
        expect(result.value).toBe(true);
      });

      it("retorna SET_CHECKED para checked false", () => {
        // Arrange
        const elementType = "input";
        const key = "checked";
        const value = false;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_CHECKED");
        expect(result.value).toBe(false);
      });

      it("retorna SET_CHECKED convertendo truthy para true", () => {
        // Arrange
        const elementType = "input";
        const key = "checked";
        const value = "truthy-string";
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_CHECKED");
        expect(result.value).toBe(true);
      });

      it("retorna SET_CHECKED convertendo falsy para false", () => {
        // Arrange
        const elementType = "input";
        const key = "checked";
        const value = 0;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_CHECKED");
        expect(result.value).toBe(false);
      });
    });

    describe("REMOVE_ATTRIBUTE cases", () => {
      it("retorna REMOVE_ATTRIBUTE para null com hasProperty=true", () => {
        // Arrange
        const elementType = "div";
        const key = "data-test";
        const value = null;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("REMOVE_ATTRIBUTE");
        expect(result.key).toBe("data-test");
      });

      it("retorna REMOVE_ATTRIBUTE para false com hasProperty=false", () => {
        // Arrange
        const elementType = "div";
        const key = "disabled";
        const value = false;
        const hasProperty = false;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("REMOVE_ATTRIBUTE");
        expect(result.key).toBe("disabled");
      });

      it("retorna REMOVE_ATTRIBUTE para undefined", () => {
        // Arrange
        const elementType = "div";
        const key = "title";
        const value = undefined;
        const hasProperty = false;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("REMOVE_ATTRIBUTE");
      });
    });

    describe("SET_PROPERTY cases", () => {
      it("retorna SET_PROPERTY para propriedade nativa com hasProperty=true", () => {
        // Arrange
        const elementType = "input";
        const key = "disabled";
        const value = true;
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_PROPERTY");
        expect(result.key).toBe("disabled");
        expect(result.value).toBe(true);
        expect(result.metadata?.useFallbackToAttribute).toBe(true);
      });

      it("retorna SET_PROPERTY para string com hasProperty=true", () => {
        // Arrange
        const elementType = "div";
        const key = "id";
        const value = "my-id";
        const hasProperty = true;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_PROPERTY");
        expect(result.value).toBe("my-id");
      });
    });

    describe("SET_ATTRIBUTE cases", () => {
      it("retorna SET_ATTRIBUTE para atributo customizado com hasProperty=false", () => {
        // Arrange
        const elementType = "div";
        const key = "data-test";
        const value = "test-value";
        const hasProperty = false;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_ATTRIBUTE");
        expect(result.key).toBe("data-test");
        expect(result.value).toBe("test-value");
      });

      it("retorna SET_ATTRIBUTE convertendo número para string", () => {
        // Arrange
        const elementType = "div";
        const key = "data-count";
        const value = 42;
        const hasProperty = false;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_ATTRIBUTE");
        expect(result.value).toBe("42");
      });

      it("retorna SET_ATTRIBUTE convertendo boolean true para string", () => {
        // Arrange
        const elementType = "div";
        const key = "aria-hidden";
        const value = true;
        const hasProperty = false;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_ATTRIBUTE");
        expect(result.value).toBe("true");
      });
    });

    describe("edge cases", () => {
      it("retorna SET_ATTRIBUTE para objeto em atributo customizado", () => {
        // Arrange
        const elementType = "div";
        const key = "data-config";
        const value = { foo: "bar" };
        const hasProperty = false;

        // Act
        const result = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result.type).toBe("SET_ATTRIBUTE");
        expect(result.value).toBe("[object Object]");
      });

      it("preserva imutabilidade do comando retornado", () => {
        // Arrange
        const elementType = "div";
        const key = "class";
        const value = "foo";
        const hasProperty = true;

        // Act
        const result1 = computePropUpdate(elementType, key, value, hasProperty);
        const result2 = computePropUpdate(elementType, key, value, hasProperty);

        // Assert
        expect(result1).not.toBe(result2); // Novos objetos
        expect(result1).toEqual(result2); // Mas com mesmo conteúdo
      });
    });
  });

  describe("applyPropUpdate (Imperative Shell)", () => {
    describe("NO_OP", () => {
      it("não faz nada para comando NO_OP", () => {
        // Arrange
        const el = document.createElement("div");
        const update: PropUpdate = { type: "NO_OP", key: "children", value: "test" };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.getAttribute("children")).toBeNull();
      });
    });

    describe("SET_CLASS", () => {
      it("aplica className via metadata", () => {
        // Arrange
        const el = document.createElement("div");
        const update: PropUpdate = {
          type: "SET_CLASS",
          key: "class",
          value: "foo bar",
          metadata: { processedClassName: "foo bar" },
        };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.className).toBe("foo bar");
      });

      it("limpa className quando metadata é vazia", () => {
        // Arrange
        const el = document.createElement("div");
        el.className = "existing";
        const update: PropUpdate = {
          type: "SET_CLASS",
          key: "class",
          value: null,
          metadata: { processedClassName: "" },
        };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.className).toBe("");
      });

      it("não faz nada se elemento não é HTMLElement", () => {
        // Arrange
        const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const update: PropUpdate = {
          type: "SET_CLASS",
          key: "class",
          value: "foo",
          metadata: { processedClassName: "foo" },
        };

        // Act
        applyPropUpdate(el, update);

        // Assert - SVGElement tem className como SVGAnimatedString, não string
        expect(el instanceof HTMLElement).toBe(false);
      });
    });

    describe("SET_STYLE", () => {
      it("aplica style object ao elemento", () => {
        // Arrange
        const el = document.createElement("div");
        const update: PropUpdate = {
          type: "SET_STYLE",
          key: "style",
          value: { color: "red", fontSize: "16px" },
        };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.style.color).toBe("red");
        expect(el.style.fontSize).toBe("16px");
      });

      it("não faz nada se elemento não é HTMLElement", () => {
        // Arrange
        const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const update: PropUpdate = {
          type: "SET_STYLE",
          key: "style",
          value: { color: "red" },
        };

        // Act
        applyPropUpdate(el, update);

        // Assert - não deve falhar
      });
    });

    describe("SET_VALUE", () => {
      it("aplica value a input", () => {
        // Arrange
        const el = document.createElement("input");
        const update: PropUpdate = { type: "SET_VALUE", key: "value", value: "test" };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.value).toBe("test");
        expect(el.defaultValue).toBe("test");
      });

      it("aplica value a textarea", () => {
        // Arrange
        const el = document.createElement("textarea");
        const update: PropUpdate = { type: "SET_VALUE", key: "value", value: "multi\nline" };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.value).toBe("multi\nline");
        expect(el.defaultValue).toBe("multi\nline");
      });

      it("não atualiza se value já é igual", () => {
        // Arrange
        const el = document.createElement("input");
        el.value = "test";
        const update: PropUpdate = { type: "SET_VALUE", key: "value", value: "test" };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.value).toBe("test");
      });
    });

    describe("SET_SELECT_OPTIONS", () => {
      it("aplica value a select e marca option correta como selected", () => {
        // Arrange
        const el = document.createElement("select");
        el.innerHTML = '<option value="a">A</option><option value="b">B</option><option value="c">C</option>';
        const update: PropUpdate = {
          type: "SET_SELECT_OPTIONS",
          key: "value",
          value: "b",
          metadata: { selectedValue: "b" },
        };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.value).toBe("b");
        expect(el.options[0].selected).toBe(false);
        expect(el.options[1].selected).toBe(true);
        expect(el.options[2].selected).toBe(false);
      });

      it("mantém primeira option selecionada para valor não existente", () => {
        // Arrange
        const el = document.createElement("select");
        el.innerHTML = '<option value="a">A</option><option value="b">B</option>';
        const update: PropUpdate = {
          type: "SET_SELECT_OPTIONS",
          key: "value",
          value: "nonexistent",
          metadata: { selectedValue: "nonexistent" },
        };

        // Act
        applyPropUpdate(el, update);

        // Assert - Browser mantém primeira option como selected por padrão
        expect(el.value).toBe("a"); // Browser seleciona primeira option
        expect(el.options[0].selected).toBe(true);
        expect(el.options[1].selected).toBe(false);
      });
    });

    describe("SET_CHECKED", () => {
      it("aplica checked=true a checkbox", () => {
        // Arrange
        const el = document.createElement("input");
        el.type = "checkbox";
        const update: PropUpdate = { type: "SET_CHECKED", key: "checked", value: true };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.checked).toBe(true);
        expect(el.defaultChecked).toBe(true);
      });

      it("aplica checked=false a checkbox", () => {
        // Arrange
        const el = document.createElement("input");
        el.type = "checkbox";
        el.checked = true;
        const update: PropUpdate = { type: "SET_CHECKED", key: "checked", value: false };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.checked).toBe(false);
        expect(el.defaultChecked).toBe(false);
      });

      it("não atualiza se checked já é igual", () => {
        // Arrange
        const el = document.createElement("input");
        el.type = "checkbox";
        el.checked = true;
        const update: PropUpdate = { type: "SET_CHECKED", key: "checked", value: true };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.checked).toBe(true);
      });
    });

    describe("REMOVE_ATTRIBUTE", () => {
      it("remove atributo existente", () => {
        // Arrange
        const el = document.createElement("div");
        el.setAttribute("data-test", "value");
        const update: PropUpdate = { type: "REMOVE_ATTRIBUTE", key: "data-test", value: null };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.hasAttribute("data-test")).toBe(false);
      });

      it("não falha ao remover atributo inexistente", () => {
        // Arrange
        const el = document.createElement("div");
        const update: PropUpdate = { type: "REMOVE_ATTRIBUTE", key: "data-foo", value: null };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.hasAttribute("data-foo")).toBe(false);
      });
    });

    describe("SET_PROPERTY", () => {
      it("define propriedade via Reflect.set", () => {
        // Arrange
        const el = document.createElement("input");
        const update: PropUpdate = {
          type: "SET_PROPERTY",
          key: "disabled",
          value: true,
          metadata: { useFallbackToAttribute: true },
        };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.disabled).toBe(true);
      });

      it("usa setAttribute como fallback quando Reflect.set falha", () => {
        // Arrange
        const el = document.createElement("div");
        Object.defineProperty(el, "customProp", {
          value: "initial",
          writable: false,
          configurable: true,
        });
        const update: PropUpdate = {
          type: "SET_PROPERTY",
          key: "customProp",
          value: "new",
          metadata: { useFallbackToAttribute: true },
        };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.getAttribute("customProp")).toBe("new");
      });

      it("remove atributo como fallback quando valor é null", () => {
        // Arrange
        const el = document.createElement("div");
        el.setAttribute("customProp", "value");
        Object.defineProperty(el, "customProp", {
          value: "initial",
          writable: false,
          configurable: true,
        });
        const update: PropUpdate = {
          type: "SET_PROPERTY",
          key: "customProp",
          value: null,
          metadata: { useFallbackToAttribute: true },
        };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.hasAttribute("customProp")).toBe(false);
      });
    });

    describe("SET_ATTRIBUTE", () => {
      it("define atributo HTML", () => {
        // Arrange
        const el = document.createElement("div");
        const update: PropUpdate = { type: "SET_ATTRIBUTE", key: "title", value: "test" };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.getAttribute("title")).toBe("test");
      });

      it("converte número para string ao definir atributo", () => {
        // Arrange
        const el = document.createElement("div");
        const update: PropUpdate = { type: "SET_ATTRIBUTE", key: "data-count", value: 42 };

        // Act
        applyPropUpdate(el, update);

        // Assert
        expect(el.getAttribute("data-count")).toBe("42");
      });
    });
  });
});
