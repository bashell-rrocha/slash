# Migration Guide: hydrate() → render()

This guide helps you migrate from the old `hydrate()` API (used before the first public release, `@_bashell/slash` 0.0.1) to the unified `render()` API. The "Before" snippets are historical: `hydrate()` and the `slash` / `slash/hydrate` import paths no longer exist.

## Summary

The `hydrate()` function was **removed** in favor of `render()`, which auto-detects whether to hydrate or render from scratch. The package is now published as `@_bashell/slash`, with the subpaths `core`, `router`, `forms` and `ssr`.

**Benefits of the new API:**
- ✅ Single API for all rendering scenarios
- ✅ Zero configuration — automatic hydration detection
- ✅ Same code works for SSR and SPA
- ✅ Less boilerplate
- ✅ Simpler mental model

## Quick Migration

### Before (Old API, removed)

```typescript
import { hydrate } from "slash";

// Client code after SSR
hydrate(
  () => App(),
  "#app",
  { state: window.__SLASH_STATE__ }
);
```

### After (New API)

```typescript
import { render } from "@_bashell/slash/core";

// Same code works for SSR and SPA!
render(() => App(), "#app");
```

That's it! If the view reads state with `createState`, mount it as a component (``render(html`<${App} />`, "#app")``) so it re-renders when that state changes. The `render()` function automatically:
1. Detects if the container has pre-rendered HTML
2. Looks for the `__SLASH_STATE__` script tag
3. Hydrates if both conditions are met (it also removes the state script)
4. Otherwise, renders normally

## Detailed Examples

### Example 1: Basic SSR Setup

**Before:**

```typescript
// server.ts
import { htmlString, renderToString } from "@_bashell/slash/ssr";

const { html, state } = renderToString(() => App());

res.send(`
  <div id="app">${html}</div>
  <script>window.__SLASH_STATE__ = ${JSON.stringify(state)};</script>
  <script src="/client.js"></script>
`);

// client.ts
import { hydrate } from "slash";

hydrate(() => App(), "#app", { state: window.__SLASH_STATE__ });
```

**After:**

```typescript
// server.ts
import { renderToString, serializeStateForScript } from "@_bashell/slash/ssr";

const { html, state } = renderToString(() => App());

res.send(`
  <div id="app">${html}</div>
  <script id="__SLASH_STATE__" type="application/json">${serializeStateForScript(state)}</script>
  <script src="/client.js"></script>
`);

// client.ts (simpler!)
import { render } from "@_bashell/slash/core";

render(() => App(), "#app");
```

**Key changes:**
- Remove `window.__SLASH_STATE__` global variable
- Use `<script id="__SLASH_STATE__">` instead
- Replace `hydrate()` with `render()`
- No need to pass state manually

### Example 2: Conditional Rendering

If you were conditionally using `hydrate()` vs `render()`:

**Before:**

```typescript
import { hydrate, render } from "slash";

if (window.__SLASH_STATE__) {
  // After SSR
  hydrate(() => App(), "#app", { state: window.__SLASH_STATE__ });
} else {
  // SPA mode
  render(() => App(), "#app");
}
```

**After:**

```typescript
import { render } from "@_bashell/slash/core";

// Works in both cases!
render(() => App(), "#app");
```

### Example 3: Multiple Containers

**Before:**

```typescript
import { hydrate, render } from "slash";

const hasState = Boolean(window.__SLASH_STATE__);

if (hasState) {
  hydrate(() => Header(), "#header", { state: window.__SLASH_STATE__.header });
  hydrate(() => Main(), "#main", { state: window.__SLASH_STATE__.main });
} else {
  render(() => Header(), "#header");
  render(() => Main(), "#main");
}
```

**After:**

```typescript
import { render } from "@_bashell/slash/core";

// Auto-detects for each container
render(() => Header(), "#header");
render(() => Main(), "#main");
```

Note: For multiple containers, you'll need to adjust your server-side state injection to create separate `__SLASH_STATE__` scripts, or use a single root component.

## Server-Side Changes

### State Script Format

The state must now be in a `<script>` tag with `id="__SLASH_STATE__"`:

**Before:**

```html
<script>
  window.__SLASH_STATE__ = {"s0": 0, "s1": "hello"};
</script>
```

**After:**

```html
<script id="__SLASH_STATE__" type="application/json">
  {"s0": 0, "s1": "hello"}
</script>
```

**Why?**
- No global pollution
- Proper JSON parsing (no eval)
- Auto-cleanup (script is removed after hydration)
- Better security (`serializeStateForScript` escapes `<`, `>`, `&`, U+2028 and U+2029, so a value like `</script>` cannot close the tag; never use raw `JSON.stringify` inside `<script>`)

### Server-Side Template Example

```typescript
import { renderToString, serializeStateForScript } from "@_bashell/slash/ssr";

export function renderPage(App: () => any) {
  const { html, state } = renderToString(App);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>My App</title>
      </head>
      <body>
        <div id="app">${html}</div>

        <!-- State for hydration -->
        <script id="__SLASH_STATE__" type="application/json">
          ${serializeStateForScript(state)}
        </script>

        <!-- Your client bundle -->
        <script type="module" src="/client.js"></script>
      </body>
    </html>
  `;
}
```

## Breaking Changes

### 1. State Injection Method

- **Before:** `window.__SLASH_STATE__` global variable
- **After:** `<script id="__SLASH_STATE__">` tag

**Migration:** Update your server template to use the script tag format.

### 2. API Signature

- **Before:** `hydrate(view, container, { state })`
- **After:** `render(view, container)`

**Migration:** Remove the third argument — state is auto-detected.

### 3. Import Path

If you were importing from a specific path:

- **Before:** `import { hydrate } from "slash/hydrate"` (path no longer exists)
- **After:** `import { render } from "@_bashell/slash/core"`

## Backward Compatibility

There is none: `hydrate()` is not exported by any `@_bashell/slash` entry point (`core`, `router`, `forms`, `ssr` or the root bundle). Code that still imports it fails at import time and must be migrated to `render()`.

## Common Pitfalls

### Pitfall 1: State Script Placement

❌ **Wrong:**
```html
<script id="__SLASH_STATE__">
  const state = {"s0": 0};
</script>
```

✅ **Correct:**
```html
<script id="__SLASH_STATE__" type="application/json">
  {"s0": 0}
</script>
```

The content must be valid JSON, not JavaScript.

### Pitfall 2: Multiple Hydrations

If you call `render()` multiple times on the same container:

```typescript
render(() => App(), "#app"); // First call: hydrates
render(() => App(), "#app"); // Second call: renders from scratch (state script already removed)
```

The second call will re-render because the state script is removed after first hydration.

**Solution:** Only call `render()` once per container.

### Pitfall 3: Custom State Handling

If you were manually managing state:

❌ **Don't do this:**
```typescript
const customState = { /* ... */ };
render(() => App(), "#app"); // Won't use customState
```

✅ **Instead:** Ensure your server generates the proper `__SLASH_STATE__` script.

## Testing Your Migration

1. **Check console** for errors
2. **Verify hydration** — DOM should not flash or re-render
3. **Test events** — Click handlers and other events should work
4. **Test state** — Updates made with `state.set()` should re-render the components that read that state
5. **Check state script** — Should be removed from DOM after hydration

### Simple Test

```typescript
// Before hydration
console.log(document.getElementById("__SLASH_STATE__")); // Should exist

render(() => App(), "#app");

// After hydration
console.log(document.getElementById("__SLASH_STATE__")); // Should be null
```

## Migrating to 0.0.3 (secure by default)

0.0.3 changes what is trusted. Plain strings are always text, URLs and handlers are checked, and markup needs an explicit type. Find each case with the searches below.

| If your code... | What happens now | How to migrate |
| --- | --- | --- |
| uses ``htmlString`...` `` as a `string` (`.length`, `+`, `.startsWith`, `res.send(x)`) | it returns a `SafeHtml` | use `String(x)`, or `renderToString(() => x).html` |
| returns hand-built HTML strings from a component or helper (`return "<div>...</div>"`, Markdown, icons) | the string renders as visible text | return an `htmlString`/`html` template; for trusted markup use `unsafeHtml(str)` |
| passes `innerHTML=${...}`, `outerHTML=...` or `srcdoc=${...}` as a prop | the prop is ignored (dev warning) | use `unsafeHtml(...)` as a child; `srcdoc=${unsafeHtml(...)}` |
| uses `javascript:`, `data:text/html`, `blob:` or custom schemes in `href`/`src`/`action` | the value becomes `about:blank#blocked` | use a real URL, or `unsafeUrl(url)` for a trusted one |
| uses `<${Link} to="./x">`, `to="../x"`, `to="about"` or an absolute URL | no navigation, `href` blocked | use an app path (`/x`, `?q`, `#h`); for an external site add `external` |
| uses string handlers (`onclick="..."`) or a plain attribute starting with `on` | any `on*` prop that is not a function, handler object or `[fn, options]` is dropped (client and SSR) | pass a function: `onClick=${fn}`; use `data-` for plain attributes |
| writes `<script>${json}</script>` or `<style>${css}</style>` with dynamic values in `htmlString` | dynamic strings are escaped (dev warning) | `unsafeHtml(serializeStateForScript(data))` for JSON; keep CSS/JS static |
| puts a literal `<` in a static `<script>` inside `htmlString` (`if (a < b)`) | htm reads it as a tag | move that code into `unsafeHtml(...)` |
| interpolates a `State` directly in SSR (`${state}`) | a `State` is not reactive on the server | interpolate `state.get()` |
| embeds state with `JSON.stringify(state)` in a `<script>` | breaks out on `</script>` | `serializeStateForScript(state)` |
| calls `__addBatchEndCallback`, `__removeBatchEndCallback` or `__recordBatchUpdate` | removed | use `batch()` and `state.watch()` |
| builds a `RouterInstance` mock by hand | `ready` is required | add `ready: Promise.resolve()` |
| calls `data.hasOwnProperty(...)` on `formToObject()` or `router.query` | those objects have no prototype | `Object.hasOwn(data, "field")` |
| relied on client `style="..."` strings being applied verbatim | unsafe declarations are dropped | keep to plain CSS values (see [docs/19-security](./docs/19-security/README.md)) |

Quick searches: `grep -rnE "htmlString|innerHTML=|srcdoc=|href=\$\{|onclick=|JSON.stringify\(state" src`.

Full explanation: [docs/19-security](./docs/19-security/README.md).

## Need Help?

If you encounter issues during migration:

1. Check that your state script format is correct
2. Verify that `renderToString()` is generating the expected state
3. Ensure your client and server components are identical
4. Look for console errors or warnings

For more examples, see the [README](./README.md).

## Summary Checklist

- [ ] Update server template to use `<script id="__SLASH_STATE__">`
- [ ] Replace `hydrate()` calls with `render()`
- [ ] Remove state passing from client code
- [ ] Remove `window.__SLASH_STATE__` global variable
- [ ] Test hydration in browser (no flash, events work)
- [ ] Use `serializeStateForScript(state)` (not `JSON.stringify`) inside `<script>`
- [ ] Review the 0.0.3 table above: `htmlString` is a `SafeHtml`, strings are text, `Link` takes app paths

---

**Questions?** Open an issue on GitHub!
