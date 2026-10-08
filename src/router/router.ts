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
import {
  findRouteMatch,
  parseNavigationPath,
  computeNavigation,
  hasApplicableGuards,
  isRedirectLimitExceeded,
  MAX_REDIRECTS,
} from "./navigation-decision"
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

  // Token de sequência: cada navegação captura o seu e descarta o resultado
  // se uma navegação mais nova começou durante algum await
  let navSeq = 0

  /**
   * Navigate to a path using pure decision logic
   * `initial`: verificação de guards da rota inicial (bloqueio zera a rota)
   */
  function navigate(
    path: string,
    replace: boolean = false,
    fromHistory: boolean = false,
    initial: boolean = false
  ): Promise<void> {
    return run(path, replace, fromHistory, initial, ++navSeq, 0)
  }

  async function run(
    path: string,
    replace: boolean,
    fromHistory: boolean,
    initial: boolean,
    seq: number,
    depth: number
  ): Promise<void> {
    // Redirects em cadeia demais: provável loop entre guards
    if (isRedirectLimitExceeded(depth)) {
      console.error(`Navigation aborted: more than ${MAX_REDIRECTS} redirects (${path})`)
      state.set({
        currentRoute: null,
        params: {},
        query: {},
        meta: {},
        isNavigating: false,
      })
      return
    }

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

    // Navegação mais nova começou: descarta este resultado
    if (seq !== navSeq) return

    // Handle redirect
    if (decision.redirect) {
      await run(decision.redirect, replace, fromHistory, initial, seq, depth + 1)
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
      } else if (initial) {
        // Rota inicial bloqueada: não mantém a rota aplicada de forma síncrona
        state.set({
          currentRoute: null,
          params: {},
          query: {},
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
          replacingInitial = initial
          try {
            history.replace(fullPath)
          } finally {
            replacingInitial = false
          }
        } else {
          history.push(fullPath)
        }
      }
    }
  }

  // Initialize router using adapter for environment detection
  const initialPath = detectInitialPath(adapter, config.initialPath, config.mode || "history")

  // initialPath explícito ou estado do servidor: a rota é aplicada de forma síncrona
  // (sem flash, markup do SSR preservado) e os guards rodam em seguida
  const fromBrowserLocation =
    !config.initialPath && !adapter.getServerState()?.currentRoute?.path

  // Resolve quando a navegação inicial termina
  let ready: Promise<void> = Promise.resolve()
  // Ligada só ao redor do replace da navegação inicial, para ele não reentrar
  // via history.listen (eventos de histórico reais superam a inicial pelo token)
  let replacingInitial = false

  if (initialPath) {
    const input = parseNavigationPath(initialPath)
    const match = findRouteMatch(input.pathname, input.query, config.routes, config.fallback)

    if (match) {
      const guarded = !adapter.isSSR() && hasApplicableGuards(match, allGuards)

      if (guarded && fromBrowserLocation) {
        // Sem expor a rota protegida antes da decisão
        state.set({
          currentRoute: null,
          params: {},
          query: input.query,
          meta: {},
          isNavigating: true,
        })
      } else {
        state.set({
          currentRoute: match,
          params: match.params,
          query: match.query,
          meta: match.meta,
          isNavigating: guarded,
        })
      }

      if (guarded) {
        const promise = navigate(initialPath, true, false, true)
        const initialSeq = navSeq
        ready = promise.catch((err) => {
          console.error("Navigation error:", err)
          // Só encerra isNavigating se nenhuma navegação mais nova está em andamento
          if (initialSeq === navSeq) {
            state.set({ ...state.get(), isNavigating: false })
          }
        })
      }
    }
  }

  // Listen to history changes (browser only)
  if (!adapter.isSSR()) {
    history.listen((location) => {
      if (replacingInitial) return
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

    ready,
  }
}
