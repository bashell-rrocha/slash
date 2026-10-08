/**
 * History management for router
 */

export type HistoryListener = (location: string) => void

/**
 * History interface
 */
export interface History {
  /** Get current location */
  location(): string
  /** Push new location */
  push(path: string): void
  /** Replace current location */
  replace(path: string): void
  /** Go back in history */
  back(): void
  /** Go forward in history */
  forward(): void
  /** Go to specific history entry */
  go(delta: number): void
  /** Listen to location changes */
  listen(listener: HistoryListener): () => void
}

/**
 * Check if running in browser
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.history !== "undefined"
}

// Base usada quando a location não é http(s) (about:blank em testes): só há caminhos do app
const FALLBACK_BASE = "http://slash.invalid/"

function resolveBase(): string {
  const protocol = window.location.protocol
  return protocol === "http:" || protocol === "https:" ? window.location.href : FALLBACK_BASE
}

/**
 * Resolve `raw` against the current location. Returns null if it is not a valid URL.
 */
function resolveUrl(raw: string): URL | null {
  try {
    return new URL(raw, resolveBase())
  } catch {
    return null
  }
}

/**
 * Normalized listener path (pathname + search + hash) for a pushState/replaceState url,
 * resolved BEFORE the native call so relative urls ("?q", "#h") use the previous location.
 */
function normalizedPath(url: string | URL | null | undefined): string | null {
  if (url === undefined || url === null) {
    return null
  }
  const resolved = resolveUrl(String(url))
  return resolved ? resolved.pathname + resolved.search + resolved.hash : null
}

function currentPath(): string {
  return window.location.pathname + window.location.search + window.location.hash
}

/**
 * Track if history has been patched globally
 */
let historyPatched = false

/**
 * All history listeners (shared across instances)
 */
const globalListeners = new Set<HistoryListener>()

/**
 * Store original history methods
 */
let originalPushState: typeof window.history.pushState | undefined
let originalReplaceState: typeof window.history.replaceState | undefined

/**
 * Store the click handler so we can remove it
 */
let clickHandler: ((event: MouseEvent) => void) | undefined

/**
 * Reset history interception state (for testing)
 * @internal
 */
export function __resetHistoryForTesting__(): void {
  if (!isBrowser()) {
    return
  }

  // Clear all listeners
  globalListeners.clear()

  // Remove click handler
  if (clickHandler) {
    window.removeEventListener("click", clickHandler)
    clickHandler = undefined
  }

  // Restore original methods if they were patched
  if (originalPushState) {
    window.history.pushState = originalPushState
  }
  if (originalReplaceState) {
    window.history.replaceState = originalReplaceState
  }

  // Reset state
  historyPatched = false
  originalPushState = undefined
  originalReplaceState = undefined
}

/**
 * Setup global history monkey patch and link interception (only once)
 */
function setupHistoryInterception(): void {
  if (!isBrowser() || historyPatched) {
    return
  }

  // Save original methods before patching
  if (!originalPushState) {
    originalPushState = window.history.pushState.bind(window.history)
  }
  if (!originalReplaceState) {
    originalReplaceState = window.history.replaceState.bind(window.history)
  }

  // Monkey patch history.pushState and replaceState
  window.history.pushState = function (data, title, url) {
    const normalized = normalizedPath(url)
    const result = originalPushState!(data, title, url)
    // Listeners always receive the normalized same-origin path, never the raw url
    const path = normalized ?? currentPath()
    globalListeners.forEach((listener) => listener(path))
    return result
  }

  window.history.replaceState = function (data, title, url) {
    const normalized = normalizedPath(url)
    const result = originalReplaceState!(data, title, url)
    const path = normalized ?? currentPath()
    globalListeners.forEach((listener) => listener(path))
    return result
  }

  // Intercept clicks on <a href> for SPA navigation
  clickHandler = (event: MouseEvent) => {
    // Cliques no document, em nós de texto ou sem target não têm closest()
    const target = event.target as HTMLElement | null
    if (!target || typeof target.closest !== "function") {
      return
    }
    const anchor = target.closest("a") as HTMLAnchorElement | null

    if (!anchor) {
      return
    }

    if (!shouldInterceptLink(anchor, event)) {
      return
    }

    // Intercept the navigation
    event.preventDefault()
    const href = anchor.getAttribute("href")!

    // Use pushState which will trigger our monkey-patched version
    window.history.pushState({}, "", href)
  }

  window.addEventListener("click", clickHandler)

  historyPatched = true
}

/**
 * Check if a link should be intercepted for SPA navigation
 */
function shouldInterceptLink(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
  // Ignore if event has modifiers (Ctrl+click, etc)
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return false
  }

  // Ignore if target is not _self
  if (anchor.target && anchor.target !== "_self") {
    return false
  }

  // Ignore download links
  if (anchor.hasAttribute("download")) {
    return false
  }

  // Opt-out: data-native forces traditional navigation
  if (anchor.hasAttribute("data-native")) {
    return false
  }

  const href = anchor.getAttribute("href")
  if (!href) {
    return false
  }

  // Ignore hash-only links
  if (href.startsWith("#")) {
    return false
  }

  // Resolve like the browser would; only same-origin http(s) is handled by the SPA.
  // mailto:, tel:, sms:, //host, other schemes and cross-origin links stay native.
  const url = resolveUrl(href)
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return false
  }
  const base = new URL(resolveBase())
  if (url.origin !== base.origin) {
    return false
  }

  // At this point, it's either a relative path or same-origin absolute URL
  return true
}

/**
 * pushState só atualiza a location em origens http(s); em about:blank ou file: não
 */
function canPushState(): boolean {
  if (typeof window.history?.pushState !== "function") {
    return false
  }
  const protocol = window.location.protocol
  return protocol === "http:" || protocol === "https:"
}

/**
 * Create history mode implementation (HTML5 pushState)
 */
export function createHistoryMode(): History {
  const listeners = new Set<HistoryListener>()

  // Internal state for test environments where pushState doesn't update location
  let internalPath = ""
  let useInternalPath = false

  // Setup instance-specific listeners in browser
  if (isBrowser()) {
    // Detecta (sem mexer no histórico) se pushState atualiza a location: em
    // ambientes de teste (about:blank) ele não atualiza, então usamos um caminho interno
    const testPath = window.location.pathname

    useInternalPath = !canPushState()

    if (useInternalPath) {
      internalPath = testPath === "blank" ? "/" : testPath
    }

    // Setup global history interception
    setupHistoryInterception()

    // Listen to popstate (back/forward buttons)
    window.addEventListener("popstate", () => {
      const location = window.location.pathname + window.location.search
      listeners.forEach((listener) => listener(location))
    })

    // Register this instance's listeners with global set
    // Create a wrapper that forwards to instance listeners
    const instanceListener: HistoryListener = (location) => {
      if (useInternalPath) {
        internalPath = location
      }
      listeners.forEach((listener) => listener(location))
    }
    globalListeners.add(instanceListener)
  }

  return {
    location(): string {
      if (!isBrowser()) {
        return "/"
      }

      if (useInternalPath) {
        return internalPath
      }

      const pathname = window.location.pathname === "blank" ? "/" : window.location.pathname
      return pathname + window.location.search
    },

    push(path: string): void {
      if (!isBrowser()) {
        return
      }

      if (useInternalPath) {
        internalPath = path
      }

      // pushState will trigger our monkey-patched version which notifies listeners
      // No need to notify here to avoid double notification
      window.history.pushState({}, "", path)
    },

    replace(path: string): void {
      if (!isBrowser()) {
        return
      }

      if (useInternalPath) {
        internalPath = path
      }

      // replaceState will trigger our monkey-patched version which notifies listeners
      // No need to notify here to avoid double notification
      window.history.replaceState({}, "", path)
    },

    back(): void {
      if (!isBrowser()) {
        return
      }
      window.history.back()
    },

    forward(): void {
      if (!isBrowser()) {
        return
      }
      window.history.forward()
    },

    go(delta: number): void {
      if (!isBrowser()) {
        return
      }
      window.history.go(delta)
    },

    listen(listener: HistoryListener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Create hash mode implementation (location.hash)
 */
export function createHashMode(): History {
  const listeners = new Set<HistoryListener>()

  // Setup hashchange listener in browser
  if (isBrowser()) {
    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.slice(1) || "/"
      listeners.forEach((listener) => listener(hash))
    })
  }

  return {
    location(): string {
      if (!isBrowser()) {
        return "/"
      }
      return window.location.hash.slice(1) || "/"
    },

    push(path: string): void {
      if (!isBrowser()) {
        return
      }
      window.location.hash = path
    },

    replace(path: string): void {
      if (!isBrowser()) {
        return
      }
      const url = window.location.href.split("#")[0]
      window.location.replace(url + "#" + path)
    },

    back(): void {
      if (!isBrowser()) {
        return
      }
      window.history.back()
    },

    forward(): void {
      if (!isBrowser()) {
        return
      }
      window.history.forward()
    },

    go(delta: number): void {
      if (!isBrowser()) {
        return
      }
      window.history.go(delta)
    },

    listen(listener: HistoryListener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Create history instance based on mode
 */
export function createHistory(mode: "history" | "hash" = "history"): History {
  if (mode === "hash") {
    return createHashMode()
  }
  return createHistoryMode()
}
