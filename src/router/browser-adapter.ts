/**
 * Browser adapter for isolating browser-specific side effects
 * This module provides a clean interface for browser APIs, making testing easier
 */

/**
 * Environment detection
 */
export interface EnvironmentAdapter {
  /** Check if running in SSR mode */
  isSSR(): boolean
  /** Check if running in browser */
  isBrowser(): boolean
  /** Get current location */
  getCurrentLocation(): string
  /** Get serialized server state (for hydration) */
  getServerState(): any | null
}

/**
 * Browser environment adapter implementation
 */
export function createBrowserAdapter(): EnvironmentAdapter {
  return {
    isSSR(): boolean {
      return typeof globalThis !== "undefined" && (globalThis as any).__SLASH_SSR__
    },

    isBrowser(): boolean {
      return typeof window !== "undefined" && typeof window.history !== "undefined"
    },

    getCurrentLocation(): string {
      if (typeof window === "undefined") {
        return "/"
      }
      return window.location.pathname + window.location.search
    },

    getServerState(): any | null {
      if (typeof document === "undefined") {
        return null
      }

      try {
        const stateEl = document.getElementById("__SLASH_STATE__")
        if (stateEl && stateEl.textContent) {
          return JSON.parse(stateEl.textContent)
        }
      } catch {
        // Ignore parse errors
      }

      return null
    },
  }
}

/**
 * Mock environment adapter for testing
 */
export function createMockAdapter(config: {
  isSSR?: boolean
  isBrowser?: boolean
  currentLocation?: string
  serverState?: any
}): EnvironmentAdapter {
  return {
    isSSR: () => config.isSSR ?? false,
    isBrowser: () => config.isBrowser ?? true,
    getCurrentLocation: () => config.currentLocation ?? "/",
    getServerState: () => config.serverState ?? null,
  }
}

/**
 * Initial path detection logic
 * Separated from router initialization for clarity and testability
 */
export function detectInitialPath(
  adapter: EnvironmentAdapter,
  configuredInitialPath?: string
): string | undefined {
  // If explicitly configured, use it
  if (configuredInitialPath) {
    return configuredInitialPath
  }

  // SSR mode - no detection needed
  if (adapter.isSSR()) {
    return undefined
  }

  // Client-side - try to get from server state first
  const serverState = adapter.getServerState()
  if (serverState?.currentRoute?.path) {
    return serverState.currentRoute.path
  }

  // Fallback to current browser location
  if (adapter.isBrowser()) {
    return adapter.getCurrentLocation()
  }

  return undefined
}
