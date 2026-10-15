import { describe, expect, it } from "bun:test";
import { html } from "./hyper";
import { htmlString } from "./server-render";
import { closeVoidTags } from "./void-elements";

// Elementos vazios do HTML escritos sem `/>` (<br>, <img …>): o htm não conhece elementos vazios e, sem a barra,
// tratava o resto do template como filho deles (o parse quebrava em silêncio).

const strings = (parts: string[]): TemplateStringsArray =>
  Object.assign([...parts], { raw: [...parts] }) as unknown as TemplateStringsArray;

describe("closeVoidTags", () => {
  it("fecha <br> sem barra", () => {
    // Arrange
    const input = strings(["<p>a<br>b</p>"]);

    // Act
    const out = closeVoidTags(input);

    // Assert
    expect([...out]).toEqual(["<p>a<br/>b</p>"]);
  });

  it("fecha a tag vazia que atravessa interpolações", () => {
    // Arrange
    const input = strings(['<div><img src=', " alt=", '>c<input value="x" disabled></div>']);

    // Act
    const out = closeVoidTags(input);

    // Assert
    expect([...out]).toEqual(['<div><img src=', " alt=", '/>c<input value="x" disabled/></div>']);
  });

  it("não mexe em quem já tem barra, em tag comum nem em > dentro de aspas", () => {
    // Arrange
    const input = strings(['<p>a<br/>b<hr />c<span title="x>y">d</span><img alt="a > b"></p>']);

    // Act
    const out = closeVoidTags(input);

    // Assert
    expect([...out]).toEqual(['<p>a<br/>b<hr />c<span title="x>y">d</span><img alt="a > b"/></p>']);
  });

  it("não confunde nome que começa igual (<header>, <col> × <colgroup>, <link> × <linkx>)", () => {
    // Arrange
    const input = strings(["<header><colgroup><col></colgroup></header>"]);

    // Act
    const out = closeVoidTags(input);

    // Assert
    expect([...out]).toEqual(["<header><colgroup><col/></colgroup></header>"]);
  });

  it("descarta o fechamento de elemento vazio (</input>), que o HTML ignora", () => {
    // Arrange
    const input = strings(["<input checked=", "></input><p>x</p >"]);

    // Act
    const out = closeVoidTags(input);

    // Assert
    expect([...out]).toEqual(["<input checked=", "/><p>x</p >"]);
  });

  it("devolve o mesmo array para o mesmo template (cache por identidade)", () => {
    // Arrange
    const input = strings(["<br>"]);

    // Act
    const [a, b] = [closeVoidTags(input), closeVoidTags(input)];

    // Assert
    expect(a).toBe(b);
    expect(a.raw).toEqual(["<br/>"]);
  });
});

describe("<br> sem barra nos dois renderizadores", () => {
  it("servidor: o resto do template continua no lugar", () => {
    expect(String(htmlString`<p>a<br>b</p>`)).toBe("<p>a<br>b</p>");
    expect(String(htmlString`<div><img src=${"x.png"}>c</div>`)).toBe('<div><img src="x.png">c</div>');
  });

  it("cliente: o texto depois do <br> é irmão, não filho", () => {
    // Arrange / Act
    const p = html`<p>a<br>b</p>` as unknown as HTMLElement;

    // Assert
    expect(p.outerHTML).toBe("<p>a<br>b</p>");
  });
});
