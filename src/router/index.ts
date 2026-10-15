/**
 * Router module exports
 */

// Browser adapter (for testing and SSR)
export {
  createBrowserAdapter,
  createMockAdapter,
  detectInitialPath,
  type EnvironmentAdapter,
} from "./browser-adapter";

// Components
export { Link, Router } from "./components";
// Navigation decision (pure functions)
export {
  computeNavigation,
  findRouteMatch,
  type NavigationDecision,
  type NavigationInput,
  parseNavigationPath,
} from "./navigation-decision";
// Router core
export { createRouter } from "./router";
// Types
export type {
  NavigationGuard,
  RouteComponent,
  RouteConfig,
  RouteMatch,
  RouteMeta,
  RouteParams,
  RouteQuery,
  RouterConfig,
  RouterInstance,
  RouterMode,
  RouterState,
} from "./types";
// Utilities
export { buildPath, parseQuery, sanitizePath } from "./utils";
