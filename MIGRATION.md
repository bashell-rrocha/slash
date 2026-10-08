# Migration Guide: hydrate() → render()

This guide helps you migrate from the deprecated `hydrate()` API to the new unified `render()` API.

## Summary

The `hydrate()` function is **deprecated** in favor of `render()`, which now auto-detects whether to hydrate or render from scratch.

**Benefits of the new API:**
- ✅ Single API for all rendering scenarios
- ✅ Zero configuration — automatic hydration detection
- ✅ Same code works for SSR and SPA
- ✅ Less boilerplate
- ✅ Simpler mental model

## Quick Migration

### Before (Old API)

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
import { render } from "slash";

// Same code works for SSR and SPA!
render(() => App(), "#app");
```

That's it! The `render()` function automatically:
1. Detects if the container has pre-rendered HTML
2. Looks for the `__SLASH_STATE__` script tag
3. Hydrates if both conditions are met
4. Otherwise, renders normally

## Detailed Examples

### Example 1: Basic SSR Setup

**Before:**

```typescript
// server.ts
import { htmlString, renderToString } from "slash/server";

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
// server.ts (unchanged)
import { htmlString, renderToString } from "slash/server";

const { html, state } = renderToString(() => App());

res.send(`
  <div id="app">${html}</div>
  <script id="__SLASH_STATE__" type="application/json">
    ${JSON.stringify(state)}
  </script>
  <script src="/client.js"></script>
`);

// client.ts (simpler!)
import { render } from "slash";

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
import { render } from "slash";

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
import { render } from "slash";

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
- Better security

### Server-Side Template Example

```typescript
import { renderToString } from "slash/server";

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
          ${JSON.stringify(state)}
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

- **Before:** `import { hydrate } from "slash/hydrate"`
- **After:** `import { render } from "slash"`

## Backward Compatibility

The old `hydrate()` function still works but is **deprecated**. It now:
1. Shows a console warning
2. Injects the state into a `__SLASH_STATE__` script tag
3. Calls `render()` internally

**Timeline:**
- Current version: `hydrate()` works with deprecation warning
- Next major version: `hydrate()` may be removed

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
render(() => App(), "#app"); // Second call: re-renders (state script already removed)
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

1. **Check console** for deprecation warnings
2. **Verify hydration** — DOM should not flash or re-render
3. **Test events** — Click handlers and other events should work
4. **Test signals** — Reactive updates should work correctly
5. **Check state script** — Should be removed from DOM after hydration

### Simple Test

```typescript
// Before hydration
console.log(document.getElementById("__SLASH_STATE__")); // Should exist

render(() => App(), "#app");

// After hydration
console.log(document.getElementById("__SLASH_STATE__")); // Should be null
```

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
- [ ] Remove deprecation warnings from console

---

**Questions?** Open an issue on GitHub!
