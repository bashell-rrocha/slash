/**
 * Router core implementation
 */

import { createState } from "../state"
import type {
  RouterConfig,
  RouterInstance,
  RouterState,
  RouteMatch,
} from "./types"
import { createHistory, type History } from "./history"
import { findRouteMatch, parseNavigationPath, computeNavigation } from "./navigation-decision"
import { createBrowserAdapter, detectInitialPath } from "./browser-adapter"
import { splitPath } from "./utils"

/**
 * Create router instance
 */
export function createRouter(config: RouterConfig): RouterInstance {
  // Create environment adapter
  const adapter = createBrowserAdapter()

  // Create state manager for router state
  const state = createState<RouterState>({
    currentRoute: null,
    params: {},
    query: {},
    meta: {},
    isNavigating: false,
  })

  // Create history instance (no-op in SSR)
  const history: History = createHistory(config.mode || "history")

  // Global guards
  const allGuards = config.guards || []

  /**
   * Navigate to a path using pure decision logic
   */
  async function navigate(
    path: string,
    replace: boolean = false,
    fromHistory: boolean = false
  ): Promise<void> {
    // Set navigating flag
    const currentState = state.get()
    state.set({
      ...currentState,
      isNavigating: true,
    })

    // Compute navigation decision (pure function)
    const decision = await computeNavigation(
      path,
      config.routes,
      allGuards,
      currentState.currentRoute,
      config.fallback
    )

    // Handle redirect
    if (decision.redirect) {
      await navigate(decision.redirect, replace, fromHistory)
      return
    }

    // Handle navigation decision
    if (!decision.shouldNavigate) {
      // Check if it's a "no match" error vs guard block
      if (decision.error === "No route match found") {
        // No route match - set null route
        const input = parseNavigationPath(path)
        state.set({
          currentRoute: null,
          params: {},
          query: input.query,
          meta: {},
          isNavigating: false,
        })
      } else {
        // Guard blocked - keep current state
        state.set({
          ...currentState,
          isNavigating: false,
        })
      }
      return
    }

    // Handle successful navigation
    if (decision.newRoute) {
      state.set({
        currentRoute: decision.newRoute,
        params: decision.newRoute.params,
        query: decision.newRoute.query,
        meta: decision.newRoute.meta,
        isNavigating: false,
      })

      // Update browser history (skip in SSR and history-triggered navigations)
      if (!adapter.isSSR() && !fromHistory) {
        const input = parseNavigationPath(path)
        const [, search] = splitPath(path)
        const fullPath = search ? `${input.pathname}${search}` : input.pathname

        if (replace) {
          history.replace(fullPath)
        } else {
          history.push(fullPath)
        }
      }
    }
  }

  // Initialize router using adapter for environment detection
  const initialPath = detectInitialPath(adapter, config.initialPath)

  if (initialPath) {
    // Parse and match initial path synchronously (SSR or hydration)
    const input = parseNavigationPath(initialPath)
    const match = findRouteMatch(input.pathname, input.query, config.routes, config.fallback)

    if (match) {
      state.set({
        currentRoute: match,
        params: match.params,
        query: match.query,
        meta: match.meta,
        isNavigating: false,
      })
    }
  }

  // Listen to history changes (browser only)
  if (!adapter.isSSR()) {
    history.listen((location) => {
      navigate(location, true, true).catch((err) => {
        console.error("Navigation error:", err)
      })
    })
  }

  // Return router instance
  return {
    ...state,

    async push(path: string): Promise<void> {
      await navigate(path, false)
    },

    async replace(path: string): Promise<void> {
      await navigate(path, true)
    },

    back(): void {
      history.back()
    },

    forward(): void {
      history.forward()
    },

    go(delta: number): void {
      history.go(delta)
    },

    currentRoute(): RouteMatch | null {
      return state.get().currentRoute
    },
  }
}
