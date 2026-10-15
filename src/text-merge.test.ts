import { describe, expect, it } from "bun:test";
import { html } from "./hyper";
import { createState } from "./state";

// Textos vizinhos num nó só, como o HTML do servidor depois do parse: com um nó por pedaço, o navegador mede o texto
// em partes e um glifo pode cair num subpixel diferente da mesma página vinda do servidor.

const asElement = (value: unknown) => value as unknown as HTMLElement;

describe("html: textos vizinhos", () => {
  it("valor e texto estático lado a lado viram um nó de texto", () => {
    // Arrange / Act
    const p = asElement(html`<p>${"a"} b ${"c"}</p>`);

    // Assert
    expect(p.childNodes).toHaveLength(1);
    expect(p.textContent).toBe("a b c");
  });

  it("listas de textos também se juntam", () => {
    // Arrange / Act
    const p = asElement(html`<p>${["a", "b"]}c</p>`);

    // Assert
    expect(p.childNodes).toHaveLength(1);
    expect(p.textContent).toBe("abc");
  });

  it("um elemento no meio separa os textos", () => {
    // Arrange / Act
    const p = asElement(html`<p>${"a"}<b>x</b>${"c"}</p>`);

    // Assert
    expect(Array.from(p.childNodes).map((n) => n.nodeType)).toEqual([3, 1, 3]);
  });

  it("nó de texto que veio pronto (de fora) não é mexido", () => {
    // Arrange
    const own = document.createTextNode("x");

    // Act
    const p = asElement(html`<p>${own}${"y"}</p>`);

    // Assert
    expect(p.firstChild).toBe(own);
    expect(own.data).toBe("x");
    expect(p.textContent).toBe("xy");
  });

  it("texto reativo vizinho continua atualizando sozinho", () => {
    // Arrange
    const count = createState(1);
    const p = asElement(html`<p>${"total: "}${count}${" itens"}</p>`);

    // Act
    count.set(2);

    // Assert
    expect(p.textContent).toBe("total: 2 itens");
  });
});
