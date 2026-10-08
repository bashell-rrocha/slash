# Slash

**htm + hyper + observable state** — a small, fast, DX-first framework with no virtual DOM.

Slash renders [htm](https://github.com/developit/htm) tagged templates straight to DOM nodes, re-renders components when the state they read changes, and ships SSR with automatic hydration.

## Features

- **Tagged templates** via [htm](https://github.com/developit/htm), no build step required
- **No virtual DOM**, templates create real DOM nodes
- **`createState`**: `get` / `set` / `watch` state with automatic tracking in components, observer pattern and `batch()` updates
- **Secure by default**: text and attributes are escaped, dangerous URLs and string handlers are blocked (see [Security](#security))
- **Router** with dynamic params, guards and history/hash modes
- **Form helpers** for two-way bindings and submit handling
- **SSR** (`renderToString`, `renderToStream`) with automatic hydration in `render()`
- **TypeScript** types included
- **Subpath imports** so you only ship what you use

## Installation

```bash
npm i @_bashell/slash
```

```bash
bun add @_bashell/slash
```

## Quick start

### Client

```typescript
import { html, render, createState } from "@_bashell/slash/core";

// State lives outside the component so it survives re-renders
const counter = createState({ count: 0 });

function Counter() {
  return html`
    <button onClick=${() => counter.set({ count: counter.get().count + 1 })}>
      Count: ${counter.get().count}
    </button>
  `;
}

// Mount components as <${Component} /> so they re-render when their state changes
render(html`<${Counter} />`, "#app");
```

### SSR

Server:

```typescript
import { createState } from "@_bashell/slash/core";
import { htmlString, renderToString, serializeStateForScript } from "@_bashell/slash/ssr";

const counter = createState({ count: 0 });

function App() {
  return htmlString`
    <button>Count: ${counter.get().count}</button>
  `;
}

const { html, state } = renderToString(() => App());

// htmlString returns SafeHtml; renderToString(...).html is a plain string
const page = `<!DOCTYPE html>
<html>
  <body>
    <div id="app">${html}</div>
    <script id="__SLASH_STATE__" type="application/json">${serializeStateForScript(state)}</script>
    <script type="module" src="/client.js"></script>
  </body>
</html>`;
```

Client (`client.js`):

```typescript
import { html, render, createState } from "@_bashell/slash/core";

const counter = createState({ count: 0 });

function App() {
  return html`
    <button onClick=${() => counter.set({ count: counter.get().count + 1 })}>
      Count: ${counter.get().count}
    </button>
  `;
}

// Finds the pre-rendered markup and the __SLASH_STATE__ script and hydrates
render(html`<${App} />`, "#app");
```

## Security

Slash is secure by default. You write templates the normal way and the library does the safe thing:

- **All text and attribute values are escaped**, on the client and on the server. A string is always data, never markup, whatever it contains.
- **Dangerous URLs are blocked.** Links and sources accept `http:`, `https:`, `mailto:`, `tel:`, `sms:` and relative URLs. `javascript:`, `data:text/html`, `file:` and any other scheme become `about:blank#blocked`. Images also accept `data:image/*` and `blob:`. `sanitizeUrl` is exported if you want to validate input yourself.
- **Event handlers must be functions.** `onclick="alert(1)"` and other non-function `on*` values are dropped, on the client and on the server. A plain attribute that starts with "on" must use a `data-` prefix.
- **`Link` and the router only navigate inside your app** (`/x`, `?q`, `#h`). Anything else is blocked unless you opt in with `external`.
- **`<script>` and `<style>` never take dynamic values.** Interpolated strings, numbers and templates are dropped; only the static text you write and `unsafeHtml(...)` are kept.
- **State goes into `<script>` safely** (`serializeStateForScript`, `serializeLoaderData`), so a value like `</script>` cannot break out.
- `innerHTML`, `outerHTML` and `srcdoc` props are blocked, and `style` is checked against a strict CSS policy.
- **Dev and production builds.** Vite and webpack pick the dev build in development, which prints a warning for each block. Production builds drop those warnings (errors still reach `console.error`). Details: [docs/19-security](./docs/19-security/README.md).

```typescript
import { html } from "@_bashell/slash/core";

const comment = '<img src=x onerror="alert(1)">';
const link = "javascript:alert(1)";

html`<p>${comment}</p>`;            // shows the text literally, nothing runs
html`<a href=${link}>Open</a>`;     // href becomes "about:blank#blocked"
```

### The two explicit escape hatches

Sometimes you really do have trusted markup or a trusted URL. There are exactly two ways to say so. Both have long names on purpose: they are easy to spot in a code review and a `grep unsafe` finds every one of them.

```typescript
import { html, unsafeHtml, unsafeUrl } from "@_bashell/slash/core";

// Trusted markup you produced (an icon, Markdown you rendered and sanitized, ...)
const icon = unsafeHtml('<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>');
html`<button>${icon} Save</button>`;

// A URL with a scheme the policy blocks (a custom app scheme, for example)
html`<a href=${unsafeUrl("myapp://open/42")}>Open in app</a>`;
```

- `unsafeHtml(html)` returns a `SafeHtml`: the string is emitted as markup, as is. It works in `html` (client) and `htmlString` (server). `isSafeHtml(x)` tells them apart.
- `unsafeUrl(url)` returns a `SafeUrl` that skips the URL policy for that one value. It only has effect on URL attributes and on the `content` of `<meta http-equiv="refresh">`.
- **Neither sanitizes anything.** The name is a warning: they tell Slash "I vouch for this value". Never pass user input through them, not even "cleaned" with a regex. If the content comes from users (comments, Markdown, CMS), run it through a real sanitizer first, then wrap the result.
- `htmlString` templates produce `SafeHtml` already, so nested templates and components compose without any wrapper.

Things to know:

- **Strings that look like markup are text.** A component that returns `"<div>hi</div>"` renders the literal characters (dev mode logs a hint). Return an `html`/`htmlString` template, or `unsafeHtml(...)` if the string is trusted.
- **Client-side guards (router guards, hidden buttons) are UX, not security.** The server must authorize every request.
- Dynamic values inside `<script>`/`<style>` are dropped; for JSON use `unsafeHtml(serializeStateForScript(data))`.

Full reference, URL policy, `Link`, `style`, and the small differences between client and server rendering: [docs/19-security](./docs/19-security/README.md) (also: `Link` and router rules, literal `<` in a static `<script>`, `SafeHtml` in reactive state).

## State

`createState(initial)` returns an object with three methods:

```typescript
import { createState, batch } from "@_bashell/slash/core";

const user = createState({ name: "Ada", age: 36 });

user.get();                          // { name: "Ada", age: 36 } (a copy)
user.set({ name: "Grace", age: 85 }); // replaces the whole value

const stop = user.watch((value) => console.log("changed", value));
stop();                              // unsubscribe
```

- `set` replaces the state. To update one field, spread the current value: `user.set({ ...user.get(), age: 37 })`.
- `get` returns a copy, so mutating the result never changes the state.
- Watchers run only when the new value is deeply different from the old one.

### Batching

`batch()` groups several `set` calls and notifies watchers once, when it finishes.

```typescript
import { createState, batch } from "@_bashell/slash/core";

const form = createState({ first: "", last: "" });
form.watch((value) => console.log(value));

batch(() => {
  form.set({ first: "Ada", last: "" });
  form.set({ first: "Ada", last: "Lovelace" });
}); // logs once: { first: "Ada", last: "Lovelace" }
```

Watcher errors during the flush are isolated (every watcher runs) and the first one is rethrown to the caller. If the batch function itself also throws, its error wins and the watcher error is only reported with `console.error`; the production build strips `console` calls (`drop: ['console']`), so in that case the watcher error is silent in production.

Pass `{ enableHistory: true }` as the second argument to `createState` to record changes and use `getHistory()` / `clearHistory()` (time-travel debugging).

## Components and lifecycle

A component is a function that receives its props plus `children` and returns a template. Use it in a template as `<${Component} />`:

```typescript
import { html, render, createState } from "@_bashell/slash/core";

const todos = createState({ items: ["Learn Slash", "Build an app"] });

function Item({ text }: { text: string }) {
  return html`<li>${text}</li>`;
}

function List({ title, children }: { title: string; children?: unknown }) {
  return html`
    <section>
      <h2>${title} (${todos.get().items.length})</h2>
      <ul>
        ${todos.get().items.map((text) => html`<${Item} text=${text} />`)}
      </ul>
      ${children}
    </section>
  `;
}

render(html`<${List} title="Todos"><footer>done</footer><//>`, "#app");

todos.set({ items: [...todos.get().items, "Ship it"] }); // List re-renders
```

Lifecycle:

- **Render:** the component runs and every state it reads with `get()` is tracked.
- **Update:** when a tracked state changes, the component runs again and its previous nodes are replaced.
- **Cleanup:** removed nodes are destroyed (`destroyNode`), which releases their watchers.
- **Side effects:** use `state.watch()` outside the template for logging, persistence and the like.

Wrap risky children in `ErrorBoundary`. Note: `html` evaluates children before the boundary runs, so errors thrown while *building* the children are not caught by it (they propagate to the caller). To protect a subtree, use `safeRender(() => view, fallback)` (`fallback` is required):

```typescript
import { html, ErrorBoundary } from "@_bashell/slash/core";

html`
  <${ErrorBoundary} fallback=${(error: Error) => html`<p>Failed: ${error.message}</p>`}>
    <${Counter} />
  <//>
`;

// Protect a subtree whose construction may throw
import { safeRender } from "@_bashell/slash/core";

html`${safeRender(() => html`<${Counter} />`, (error) => html`<p>Failed: ${error.message}</p>`)}`;
```

## Router

```typescript
import { html, render } from "@_bashell/slash/core";
import { createRouter, Router, Link } from "@_bashell/slash/router";

const router = createRouter({
  routes: [
    { path: "/", component: () => html`<h1>Home</h1>` },
    { path: "/users/:id", component: (state) => html`<h1>User ${state.params.id}</h1>` },
    { path: "/404", component: () => html`<h1>Not found</h1>` },
  ],
  mode: "history", // or "hash"
  fallback: "/404",
});

function App() {
  return html`
    <div>
      <nav>
        <${Link} to="/" router=${router}>Home<//>
        <${Link} to="/users/42" router=${router}>User 42<//>
      </nav>
      <main><${Router} router=${router} /></main>
    </div>
  `;
}

render(html`<${App} />`, "#app");

await router.push("/users/7");
```

The router is itself a state (`router.get()`, `router.watch()`) holding `currentRoute`, `params`, `query`, `meta` and `isNavigating`. It also exposes `push`, `replace`, `back`, `forward` and `go`. Guards (global or per route) return `false` to block or a path string to redirect. For SSR, pass `initialPath`. `await router.ready` resolves when the initial navigation (including guards) is done. Client-side guards are UX only: the server must always authorize access.

`Link` only navigates to app paths (`/x`, `?q`, `#h`). Relative forms such as `./x`, `../x` or `about` and dangerous schemes are blocked (`href="about:blank#blocked"`, no navigation, dev warning). For a real external link opt in explicitly: `<${Link} to="https://example.com" external router=${router}>Docs<//>` renders a native link with `rel="noopener noreferrer"`. `state.query` has no prototype (use `Object.hasOwn`). See [ROUTER.md](./ROUTER.md). The router only intercepts same-origin `http(s)` links; with ctrl/meta/shift/alt, a non-left button, `target` other than `_self` or `download`, the browser acts normally. `?q` and `#h` are relative to the current page.

## Forms

```typescript
import { html, createState } from "@_bashell/slash/core";
import { textFieldControl, checkboxControl, onSubmit } from "@_bashell/slash/forms";

const name = createState({ value: "" });
const agree = createState({ value: false });

function SignUp() {
  return html`
    <form onSubmit=${onSubmit((data) => console.log(data))}>
      <input name="name" ...${textFieldControl(name)} />
      <input name="agree" type="checkbox" ...${checkboxControl(agree)} />
      <button type="submit">Send</button>
    </form>
  `;
}
```

Available helpers: `textFieldControl`, `checkboxControl`, `radioControl`, `SelectControl`, `getText`, `getChecked`, `getSelectValue`, `delegate`, `formToObject`, `onSubmit`, `onReset`, `onButtonClick`, plus the form event types.

`formToObject()` returns an object without a prototype (`Object.create(null)`): field names such as `__proto__` or `constructor` are plain own keys, but `data.hasOwnProperty(...)` does not exist; use `Object.hasOwn(data, "field")`.

## SSR and hydration

- `htmlString` is the server twin of `html`: same syntax, but it returns a `SafeHtml` (not a `string`). Dynamic values are escaped; use `String(x)` or `x.value` if you need the text. Components can return `htmlString` templates, and plain strings they return are escaped as text.
- `renderToString(view)` returns `{ html, state }` (`html` is a plain `string`). Build the page shell with a template literal, put `html` in the body and embed `state` with `serializeStateForScript(state)` (JSON with `<`, `>`, `&`, U+2028 and U+2029 escaped, so values cannot close the tag) in a `<script id="__SLASH_STATE__" type="application/json">` tag. Reactives (an object with `get` and `subscribe`, such as `Router`) are wrapped in `<!--reactive-start:id-->` markers and their value is not written to `state`. A `State` is not reactive on the server: interpolate `state.get()` to render its value. Strings are always escaped, including `state.get()` values and strings returned by components; there are no exceptions. For trusted markup use `unsafeHtml()` (see [Security](#security)). The shell is your own template literal: escape anything user-provided that you put in it yourself (a title, for example).
- `renderToStream(view)` is an async generator that yields HTML chunks and ends with the `__SLASH_STATE__` script.
- `render(view, container)` hydrates automatically when the container already has content and a `__SLASH_STATE__` script exists. Otherwise it renders from scratch. There is no separate `hydrate()` function.
- Data loading helpers: `createLoader`, `invalidateLoader`, `serializeLoaderData` (safe for `<script type="application/json">`: escapes `<`, `>`, `&`, U+2028 and U+2029), `deserializeLoaderData`, `hydrateLoaderCache`, `isServer`.

## Subpath exports

| Import | Contents |
| --- | --- |
| `@_bashell/slash/core` | `html`, `h`, `render`, `destroyNode`, `createState`, `batch`, `ErrorBoundary`, `safeRender`, `catchAsync`, `setupGlobalErrorHandler`, `unsafeHtml`, `isSafeHtml`, `unsafeUrl`, `isSafeUrl`, `sanitizeUrl`, `BLOCKED_URL` (types `SafeHtml`, `SafeUrl`), dev-mode helpers |
| `@_bashell/slash/router` | `createRouter`, `Router`, `Link`, route utilities and types |
| `@_bashell/slash/forms` | form controls, event helpers and form types |
| `@_bashell/slash/ssr` | `htmlString`, `renderToString`, `renderToStream`, `serializeStateForScript`, `unsafeHtml`, `isSafeHtml`, `unsafeUrl`, `isSafeUrl`, `sanitizeUrl`, `BLOCKED_URL`, loader helpers |
| `@_bashell/slash` | everything above in one bundle |

Prefer the subpaths: they keep your bundle small.

## Templates

- [slash-spa](https://github.com/bashell-rrocha/slash-spa): single-page app with router
- [slash-ssr](https://github.com/bashell-rrocha/slash-ssr): server-side rendering with hydration
- [slash-ssg](https://github.com/bashell-rrocha/slash-ssg): static site generation

## Development

```bash
bun install
bun test
bun run build
```

## License

MIT
