# slash

**htm + hyper + reactive signals** — Tiny, fast, DX-first framework with zero VDOM overhead.

## Features

- ✅ **Tagged templates** via [htm](https://github.com/developit/htm)
- ✅ **Reactive signals** with fine-grained reactivity
- ✅ **Zero VDOM** — Direct DOM manipulation
- ✅ **SSR with automatic hydration** — Single API for client and server
- ✅ **Tiny bundle** — Minimal runtime overhead
- ✅ **TypeScript** support

## Installation

```bash
bun install slash
```

## Quick Start

### SPA (Client-Side Rendering)

```typescript
import { html, render, createSignal } from "slash";

function Counter() {
  const count = createSignal(0);

  return html`
    <div>
      <button onClick=${() => count.set(c => c + 1)}>
        Count: ${count}
      </button>
    </div>
  `;
}

render(() => Counter(), "#app");
```

### SSR with Automatic Hydration

**Server:**

```typescript
import { htmlString, renderToString } from "slash/server";

function App() {
  const count = createSignal(0);

  return htmlString`
    <div>
      <button onClick=${() => count.set(c => c + 1)}>
        Count: ${count}
      </button>
    </div>
  `;
}

const { html, state } = renderToString(() => App());

// Send to client
const htmlResponse = `
  <!DOCTYPE html>
  <html>
    <body>
      <div id="app">${html}</div>
      <script id="__SLASH_STATE__" type="application/json">
        ${JSON.stringify(state)}
      </script>
      <script type="module" src="/client.js"></script>
    </body>
  </html>
`;
```

**Client:**

```typescript
import { html, render, createSignal } from "slash";

function App() {
  const count = createSignal(0);

  return html`
    <div>
      <button onClick=${() => count.set(c => c + 1)}>
        Count: ${count}
      </button>
    </div>
  `;
}

// render() automatically detects and hydrates server-rendered HTML!
render(() => App(), "#app");
```

**That's it!** No need to call `hydrate()` — `render()` auto-detects when:
- The container has pre-rendered HTML
- A `__SLASH_STATE__` script tag exists

The same `render()` call works for:
- ✅ **SSR hydration** — Preserves server DOM, attaches events
- ✅ **SPA rendering** — Creates fresh DOM from scratch

### Zero Flash, Zero Re-render

The hydration process:

1. **Detects** server-rendered HTML + state script
2. **Restores** signal values from serialized state
3. **Re-executes** components to attach event listeners
4. **Reconnects** signals to existing DOM markers
5. **Preserves** 100% of server DOM — no flash, no re-render

## API Reference

### Client API

#### `html`

Tagged template for creating elements:

```typescript
html`<div class="container">${content}</div>`
```

#### `render(view, container)`

Renders or hydrates a view into a container:

```typescript
render(() => App(), "#app");
```

Auto-detects:
- **Hydration mode** if container has HTML + `__SLASH_STATE__`
- **Normal mode** if container is empty

#### `createSignal(initialValue)`

Creates a reactive signal:

```typescript
const count = createSignal(0);

count.get();           // Get current value
count.set(5);          // Set new value
count.set(c => c + 1); // Update with function
count.subscribe(val => console.log(val)); // Subscribe to changes
```

#### `Repeat(listSignal, keyFn, renderFn)`

Efficient keyed list rendering:

```typescript
const items = createSignal([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" }
]);

Repeat(
  items,
  item => item.id,
  item => html`<li>${item.name}</li>`
);
```

### Server API

#### `htmlString`

Tagged template for SSR (same syntax as `html`):

```typescript
import { htmlString } from "slash/server";

const view = htmlString`<div>${content}</div>`;
```

#### `renderToString(view)`

Renders view to HTML string with serialized state:

```typescript
import { renderToString } from "slash/server";

const { html, state } = renderToString(() => App());

// html: "<div>...</div>"
// state: { s0: 0, s1: "value", ... }
```

### Migration from `hydrate()`

If you're using the old `hydrate()` API:

**Before:**

```typescript
import { hydrate } from "slash";

hydrate(() => App(), "#app", { state: window.__SLASH_STATE__ });
```

**After:**

```typescript
import { render } from "slash";

render(() => App(), "#app"); // That's it!
```

The `hydrate()` function is now deprecated. Use `render()` for everything.

## Examples

### Counter with Signal

```typescript
import { html, render, createSignal } from "slash";

function Counter() {
  const count = createSignal(0);

  return html`
    <div>
      <button onClick=${() => count.set(c => c - 1)}>-</button>
      <span>${count}</span>
      <button onClick=${() => count.set(c => c + 1)}>+</button>
    </div>
  `;
}

render(() => Counter(), "#app");
```

### Todo List with Repeat

```typescript
import { html, render, createSignal, Repeat } from "slash";

function TodoList() {
  const todos = createSignal([
    { id: 1, text: "Learn Slash", done: false },
    { id: 2, text: "Build app", done: false }
  ]);

  const addTodo = (text: string) => {
    todos.set(t => [...t, { id: Date.now(), text, done: false }]);
  };

  const toggle = (id: number) => {
    todos.set(t => t.map(todo =>
      todo.id === id ? { ...todo, done: !todo.done } : todo
    ));
  };

  return html`
    <div>
      <ul>
        ${Repeat(
          todos,
          todo => todo.id,
          todo => html`
            <li>
              <input
                type="checkbox"
                checked=${todo.done}
                onClick=${() => toggle(todo.id)}
              />
              <span style=${{ textDecoration: todo.done ? 'line-through' : 'none' }}>
                ${todo.text}
              </span>
            </li>
          `
        )}
      </ul>
    </div>
  `;
}

render(() => TodoList(), "#app");
```

### Nested Components

```typescript
import { html, render, createSignal } from "slash";

function Header({ title }: { title: string }) {
  return html`<header><h1>${title}</h1></header>`;
}

function Counter() {
  const count = createSignal(0);
  return html`
    <div>
      <button onClick=${() => count.set(c => c + 1)}>
        Clicks: ${count}
      </button>
    </div>
  `;
}

function App() {
  return html`
    <main>
      <${Header} title="My App" />
      <${Counter} />
    </main>
  `;
}

render(() => App(), "#app");
```

## Development

### Install Dependencies

```bash
bun install
```

### Build

```bash
bun run build
```

### Run Tests

```bash
bun test
```

### Type Checking

```bash
bun run build:types
```

## Why Slash?

- **No VDOM overhead** — Direct DOM manipulation is faster
- **Fine-grained reactivity** — Only update what changed
- **Simple mental model** — Tagged templates + signals
- **SSR with zero config** — Automatic hydration detection
- **Tiny runtime** — Minimal JavaScript shipped to client
- **Great DX** — TypeScript support, simple API

## License

MIT

---

Created with [Bun](https://bun.sh)
