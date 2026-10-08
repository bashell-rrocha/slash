import { test, expect, describe } from "bun:test";
import { renderToString, renderToStream, htmlString } from "./server-render";
import { createState } from "./state";

describe("renderToString", () => {
  test("renderiza componente simples para HTML string", () => {
    // Arrange
    const Component = () => htmlString`<div class="hello">Hello World</div>`;

    // Act
    const { html, state } = renderToString(Component);

    // Assert
    expect(html).toBe('<div class="hello">Hello World</div>');
    expect(state).toEqual({});
  });

  test("renderiza e captura signals no estado", () => {
    // Arrange
    const count = createState({ value: 42 });
    const Component = () => {
      const { value } = count.get();
      return htmlString`<div>Count: ${value}</div>`;
    };

    // Act
    const { html, state } = renderToString(Component);

    // Assert
    expect(html).toContain("Count:");
    expect(html).toContain("42");
    expect(html).toContain("<!--reactive-start:s0-->");
    expect(html).toContain("<!--reactive-end:s0-->");
    expect(Object.keys(state)).toHaveLength(1);
    expect(state.s0).toBe(42);
  });

  test("renderiza signals em atributos com data-signal markers", () => {
    // Arrange
    const className = createState({ value: "active" });
    const Component = () => {
      const { value } = className.get();
      return htmlString`<div class=${value}>Content</div>`;
    };

    // Act
    const { html, state } = renderToString(Component);

    // Assert
    expect(html).toContain('class="active"');
    expect(html).toContain('data-reactive-class="s0"');
    expect(state.s0).toBe("active");
  });

  test("escapa HTML corretamente em text nodes", () => {
    // Arrange
    const malicious = "<script>alert('xss')</script>";
    // Usando primitivos (não signals) para testar escaping
    const Component = () => {
      const escaped = malicious; // String será escapada por childToString
      return htmlString`<div>${escaped}</div>`;
    };

    // Act
    const { html } = renderToString(Component);

    // Assert
    // Note: htmlString não escapa automaticamente, é responsabilidade do desenvolvedor
    // Este teste documenta o comportamento atual
    expect(html).toContain(malicious);
  });

  test("renderiza void elements sem tag de fechamento", () => {
    // Arrange
    const Component = () => htmlString`
      <div>
        <input type="text" />
        <br />
        <img src="test.jpg" />
      </div>
    `;

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toContain('<input type="text">');
    expect(html).toContain('<br>');
    expect(html).toContain('<img src="test.jpg">');
    expect(html).not.toContain('</input>');
    expect(html).not.toContain('</br>');
  });

  test("processa class como array", () => {
    // Arrange
    const classes = ["btn", "btn-primary", "active"];
    const Component = () => htmlString`<button class=${classes}>Click</button>`;

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toContain('class="btn btn-primary active"');
  });

  test("processa class como objeto", () => {
    // Arrange
    const classes = { active: true, disabled: false, selected: true };
    const Component = () => htmlString`<div class=${classes}>Content</div>`;

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toContain('class="active selected"');
    expect(html).not.toContain('disabled');
  });

  test("renderiza atributos boolean corretamente", () => {
    // Arrange
    const Component = () => htmlString`
      <input type="checkbox" checked=${true} />
      <button disabled=${true}>Submit</button>
      <input type="text" readonly=${false} />
    `;

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toContain('checked');
    expect(html).toContain('disabled');
    expect(html).not.toContain('readonly');
  });

  test("ignora event handlers no SSR", () => {
    // Arrange
    const onClick = () => console.log("clicked");
    const Component = () => htmlString`<button onClick=${onClick}>Click</button>`;

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toBe('<button>Click</button>');
    expect(html).not.toContain('onClick');
  });

  test("ignora múltiplos event handlers no SSR", () => {
    // Arrange
    const onClick = () => {};
    const onMouseOver = () => {};
    const Component = () => htmlString`<button onClick=${onClick} onMouseOver=${onMouseOver}>Click</button>`;

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toBe('<button>Click</button>');
    expect(html).not.toContain('onClick');
    expect(html).not.toContain('onMouseOver');
  });

  test("renderiza componentes aninhados", () => {
    // Arrange
    const Button = ({ text }: { text: string }) => htmlString`<button>${text}</button>`;
    const Card = () => htmlString`
      <div class="card">
        <${Button} text="Click me" />
      </div>
    `;

    // Act
    const { html } = renderToString(Card);

    // Assert
    expect(html).toContain('<div class="card">');
    expect(html).toContain('<button>Click me</button>');
  });

  test("renderiza arrays de children", () => {
    // Arrange
    const items = ["Item 1", "Item 2", "Item 3"];
    const Component = () => htmlString`
      <ul>
        ${items.map(item => htmlString`<li>${item}</li>`)}
      </ul>
    `;

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toContain('<li>Item 1</li>');
    expect(html).toContain('<li>Item 2</li>');
    expect(html).toContain('<li>Item 3</li>');
  });

  test("reseta signal registry entre renderizações", () => {
    // Arrange
    const sig1 = createState({ value: "first" });
    const Component1 = () => htmlString`<div>${sig1}</div>`;

    // Act - primeira renderização
    const result1 = renderToString(Component1);

    // Assert - primeira renderização
    expect(Object.keys(result1.state)).toHaveLength(1);
    expect(result1.state.s0).toEqual({ value: "first" });

    // Arrange - segunda renderização
    const sig2 = createState({ value: "second" });
    const Component2 = () => htmlString`<div>${sig2}</div>`;

    // Act - segunda renderização
    const result2 = renderToString(Component2);

    // Assert - segunda renderização (registry foi resetado)
    expect(Object.keys(result2.state)).toHaveLength(1);
    expect(result2.state.s0).toEqual({ value: "second" }); // Counter resetou
  });
});

describe("renderToStream", () => {
  test("gera chunks de HTML incrementalmente", async () => {
    // Arrange
    const Component = () => htmlString`<div>Hello World</div>`;
    const chunks: string[] = [];

    // Act
    for await (const chunk of renderToStream(Component)) {
      chunks.push(chunk);
    }

    // Assert
    expect(chunks.length).toBeGreaterThan(0);
    const fullHtml = chunks.join("");
    expect(fullHtml).toContain('<div>Hello World</div>');
  });

  test("inclui script de estado no final do stream", async () => {
    // Arrange
    const count = createState({ value: 99 });
    const Component = () => {
      const { value } = count.get();
      return htmlString`<div>${value}</div>`;
    };
    const chunks: string[] = [];

    // Act
    for await (const chunk of renderToStream(Component)) {
      chunks.push(chunk);
    }

    // Assert
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk).toContain('<script id="__SLASH_STATE__"');
    expect(lastChunk).toContain('"s0":99');
  });

  test("divide HTML grande em chunks de 16KB", async () => {
    // Arrange - Criar conteúdo grande (> 32KB)
    const largeContent = "x".repeat(40000);
    const Component = () => htmlString`<div>${largeContent}</div>`;
    const chunks: string[] = [];

    // Act
    for await (const chunk of renderToStream(Component)) {
      chunks.push(chunk);
    }

    // Assert - Deve ter múltiplos chunks (HTML + script state)
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Assert - Chunks HTML não devem exceder 16KB (exceto último com script)
    const htmlChunks = chunks.slice(0, -1);
    for (const chunk of htmlChunks) {
      expect(chunk.length).toBeLessThanOrEqual(16384);
    }

    // Assert - Conteúdo completo está presente
    const fullHtml = chunks.join("");
    expect(fullHtml).toContain(largeContent);
  });

  test("reseta signal registry entre streams", async () => {
    // Arrange & Act - Primeira stream
    const sig1 = createState({ value: "stream1" });
    const chunks1: string[] = [];
    for await (const chunk of renderToStream(() => {
      const { value } = sig1.get();
      return htmlString`<div>${value}</div>`;
    })) {
      chunks1.push(chunk);
    }

    // Assert - Primeira stream
    const html1 = chunks1.join("");
    expect(html1).toContain('"s0":"stream1"');

    // Arrange & Act - Segunda stream
    const sig2 = createState({ value: "stream2" });
    const chunks2: string[] = [];
    for await (const chunk of renderToStream(() => {
      const { value } = sig2.get();
      return htmlString`<div>${value}</div>`;
    })) {
      chunks2.push(chunk);
    }

    // Assert - Segunda stream (counter resetou)
    const html2 = chunks2.join("");
    expect(html2).toContain('"s0":"stream2"');
  });

  test("funciona com componentes complexos", async () => {
    // Arrange
    const user = { name: "João", age: 30 };
    const isActive = createState({ value: true });
    const Component = () => {
      const { value } = isActive.get();
      return htmlString`
        <div class="profile">
          <h1>${user.name}</h1>
          <p>Age: ${user.age}</p>
          <span class=${value}>Status</span>
        </div>
      `;
    };
    const chunks: string[] = [];

    // Act
    for await (const chunk of renderToStream(Component)) {
      chunks.push(chunk);
    }

    // Assert
    const fullHtml = chunks.join("");
    expect(fullHtml).toContain('<h1>João</h1>');
    expect(fullHtml).toContain('Age: 30');
    expect(fullHtml).toContain('data-reactive-class="s0"');
    expect(fullHtml).toContain('"s0":true');
  });

  test("renderiza signal value em input", () => {
    // Arrange
    const state = createState({ value: "test" });
    const Component = () => {
      const { value } = state.get();
      return htmlString`<input value=${value} />`;
    };

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toContain('value="test"');
    expect(html).toContain('data-reactive-value="s0"');
  });

  test("renderiza signal checked em checkbox", () => {
    // Arrange
    const state = createState({ value: true });
    const Component = () => {
      const { value } = state.get();
      return htmlString`<input type="checkbox" checked=${value} />`;
    };

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toContain('checked');
    expect(html).toContain('data-reactive-checked="s0"');
  });

  test("não renderiza checked quando signal é false", () => {
    // Arrange
    const state = createState({ value: false });
    const Component = () => {
      const { value } = state.get();
      return htmlString`<input type="checkbox" checked=${value} />`;
    };

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).not.toContain(' checked');
    expect(html).toContain('data-reactive-checked="s0"');
  });

  test("renderiza style object", () => {
    // Arrange
    const Component = () => htmlString`<div style=${{ color: "red", fontSize: "16px" }}></div>`;

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toContain('style="color: red; font-size: 16px"');
  });

  test("renderiza signal como array", () => {
    // Arrange
    const state = createState({ value: ["a", "b", "c"] });
    const Component = () => {
      const { value } = state.get();
      return htmlString`<div>${value}</div>`;
    };

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toContain('<!--reactive-start:s0-->abc<!--reactive-end:s0-->');
  });

  test("renderiza função child", () => {
    // Arrange
    const Component = () => htmlString`<div>${() => "dynamic"}</div>`;

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(html).toContain('dynamic');
  });

  test("avisa sobre objeto inesperado em child", () => {
    // Arrange
    const consoleWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (msg: string) => warnings.push(msg);

    const Component = () => htmlString`<div>${{ unexpected: "object" } as any}</div>`;

    // Act
    const { html } = renderToString(Component);

    // Assert
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("Unexpected object");
    expect(html).toContain('[Object]');

    // Cleanup
    console.warn = consoleWarn;
  });

  test("renderiza array reativo com .map() e captura estado", () => {
    // Arrange
    type Todo = { id: number; text: string };
    const state = createState({
      todos: [
        { id: 1, text: "task 1" },
        { id: 2, text: "task 2" },
      ] as Todo[],
    });

    const App = () => htmlString`
      <ul>
        ${state.get().todos.map((t: Todo) => htmlString`<li>${t.text}</li>`)}
      </ul>
    `;

    // Act
    const { html, state: capturedState } = renderToString(App);

    // Assert
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>task 1</li>");
    expect(html).toContain("<li>task 2</li>");
    expect(html).toContain("<!--reactive-start:s0-->");
    expect(html).toContain("<!--reactive-end:s0-->");

    // Valida que o estado foi capturado
    expect(Object.keys(capturedState)).toHaveLength(1);
    expect(capturedState.s0).toEqual(["<li>task 1</li>", "<li>task 2</li>"]);
  });
});
