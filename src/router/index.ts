/**
 * Router module exports
 */

// Router core
export { createRouter } from "./router"

// Components
export { Router, Link } from "./components"

// Types
export type {
  RouteParams,
  RouteQuery,
  RouteMeta,
  RouteComponent,
  NavigationGuard,
  RouteConfig,
  RouteMatch,
  RouterState,
  RouterMode,
  RouterConfig,
  RouterInstance,
} from "./types"

// Utilities
export { sanitizePath, parseQuery, buildPath } from "./utils"

// Navigation decision (pure functions)
export {
  computeNavigation,
  parseNavigationPath,
  findRouteMatch,
  type NavigationDecision,
  type NavigationInput,
} from "./navigation-decision"

// Browser adapter (for testing and SSR)
export {
  createBrowserAdapter,
  createMockAdapter,
  detectInitialPath,
  type EnvironmentAdapter,
} from "./browser-adapter"
