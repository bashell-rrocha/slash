import { describe, expect, it } from "bun:test";
import { html } from "./hyper";
import { htmlString } from "./server-render";

// Atributo booleano do HTML com valor true: no navegador vira presença (propriedade nativa, open=""); o servidor tem
// de gerar presença também (open, sem valor, como já faz com checked/disabled), não open="true".

describe("htmlString: atributos booleanos do HTML", () => {
  it("open=${true} sai como presença, sem o texto true", () => {
    // Arrange
    const isOpen = true;

    // Act
    const out = htmlString`<details open=${isOpen}>x</details>`.value;

    // Assert
    expect(out).toBe("<details open>x</details>");
  });

  // `option selected` fica de fora: no cliente vira a propriedade de seleção, não o atributo (a opção sai selecionada
  // nos dois lados, por caminhos diferentes)
  it("os booleanos do HTML saem com o mesmo atributo que o cliente, depois do parse", () => {
    // Arrange
    const cases = [
      ["details", "open"],
      ["dialog", "open"],
      ["input", "disabled"],
      ["input", "checked"],
      ["input", "required"],
      ["input", "autofocus"],
      ["select", "multiple"],
      ["video", "muted"],
      ["video", "autoplay"],
      ["ol", "reversed"],
    ] as const;
    const parse = (markup: string) => {
      const holder = document.createElement("div");
      holder.innerHTML = markup;
      return holder.firstElementChild?.getAttribute(holder.firstElementChild.getAttributeNames()[0] ?? "");
    };

    // Act
    const pairs = cases.map(([tag, attr]) => {
      const strings = Object.assign([`<${tag} ${attr}=`, `></${tag}>`], { raw: [`<${tag} ${attr}=`, `></${tag}>`] });
      const server = htmlString(strings as unknown as TemplateStringsArray, true).value;
      const client = html(strings as unknown as TemplateStringsArray, true) as unknown as Element;
      return [`${tag} ${attr}: ${parse(server)}`, `${tag} ${attr}: ${client.getAttribute(attr)}`];
    });

    // Assert
    for (const [server, client] of pairs) expect(server).toBe(client);
  });

  it("true, \"\" e false saem com a mesma presença que no cliente, inclusive sem propriedade de mesmo nome", () => {
    // Arrange
    const cases = [
      ["details", "open"],
      ["input", "required"],
      ["input", "readonly"],
      ["video", "playsinline"],
      ["iframe", "allowfullscreen"],
      ["form", "novalidate"],
      ["script", "nomodule"],
    ] as const;
    const values = [true, "", false] as const;
    const parse = (markup: string, attr: string) => {
      const holder = document.createElement("div");
      holder.innerHTML = markup;
      return holder.firstElementChild?.hasAttribute(attr) ?? false;
    };

    // Act
    const pairs = cases.flatMap(([tag, attr]) =>
      values.map((value) => {
        const parts = [`<${tag} ${attr}=`, `></${tag}>`];
        const strings = Object.assign([...parts], { raw: parts }) as unknown as TemplateStringsArray;
        const server = parse(htmlString(strings, value).value, attr);
        const client = (html(strings, value) as unknown as Element).hasAttribute(attr);
        return [`${tag} ${attr}=${JSON.stringify(value)}: ${server}`, `${tag} ${attr}=${JSON.stringify(value)}: ${client}`];
      }),
    );

    // Assert
    for (const [server, client] of pairs) expect(server).toBe(client);
  });

  it("atributo que não é booleano do HTML continua com o texto \"true\"", () => {
    // Arrange
    const flag = true;

    // Act
    const out = htmlString`<span data-clip=${flag} aria-hidden=${flag}>x</span>`.value;

    // Assert
    expect(out).toBe('<span data-clip="true" aria-hidden="true">x</span>');
  });

  it("false continua removendo o atributo", () => {
    // Arrange
    const isOpen = false;

    // Act
    const out = htmlString`<details open=${isOpen}>x</details>`.value;

    // Assert
    expect(out).toBe("<details>x</details>");
  });
});
