/**
 * Router types for the Slash framework
 */

import type { State } from "../state"

/**
 * Route parameters extracted from dynamic segments
 * Example: /users/:id → { id: "123" }
 */
export type RouteParams = Record<string, string>

/**
 * Query string parameters
 * Example: ?search=foo&page=2 → { search: "foo", page: "2" }
 */
export type RouteQuery = Record<string, string>

/**
 * Route metadata (custom data attached to routes)
 */
export type RouteMeta = Record<string, any>

/**
 * Component function that renders the route
 */
export type RouteComponent = (state: RouterState) => any

/**
 * Navigation guard function
 * - Return void or true to allow navigation
 * - Return false to block navigation
 * - Return string to redirect to that path
 */
export type NavigationGuard = (
  to: RouteMatch,
  from: RouteMatch | null
) => void | boolean | string | Promise<void | boolean | string>

/**
 * Link interception options
 */
export interface LinkInterceptionOptions {
  /** Enable automatic link interception (default: true) */
  enabled?: boolean
  /** Selector for links to intercept (default: "a[href]") */
  selector?: string
  /** Function to determine if a link should be intercepted */
  shouldIntercept?: (anchor: HTMLAnchorElement) => boolean
}

/**
 * Route configuration
 */
export interface RouteConfig {
  /** Route path pattern (e.g., "/users/:id") */
  path: string
  /** Component to render for this route */
  component: RouteComponent
  /** Route name (optional, for named routes) */
  name?: string
  /** Route metadata */
  meta?: RouteMeta
  /** Navigation guards for this route */
  guards?: NavigationGuard[]
  /** Nested/child routes */
  children?: RouteConfig[]
}

/**
 * Matched route with extracted params
 */
export interface RouteMatch {
  /** Matched route configuration */
  route: RouteConfig
  /** Extracted route parameters */
  params: RouteParams
  /** Query string parameters */
  query: RouteQuery
  /** Full matched path */
  path: string
  /** Route metadata */
  meta: RouteMeta
}

/**
 * Router state
 */
export interface RouterState {
  /** Currently active route */
  currentRoute: RouteMatch | null
  /** Route parameters */
  params: RouteParams
  /** Query parameters */
  query: RouteQuery
  /** Route metadata */
  meta: RouteMeta
  /** Navigation in progress flag */
  isNavigating: boolean
}

/**
 * Router mode
 */
export type RouterMode = "history" | "hash"

/**
 * Router configuration
 */
export interface RouterConfig {
  /** Array of route definitions */
  routes: RouteConfig[]
  /** Router mode (default: "history") */
  mode?: RouterMode
  /** Fallback path for 404 (default: null) */
  fallback?: string
  /** Global navigation guards */
  guards?: NavigationGuard[]
  /** Initial path (for SSR) */
  initialPath?: string
}

/**
 * Router instance
 */
export interface RouterInstance extends State<RouterState> {
  /** Navigate to a path */
  push(path: string): Promise<void>
  /** Replace current path */
  replace(path: string): Promise<void>
  /** Go back in history */
  back(): void
  /** Go forward in history */
  forward(): void
  /** Go to specific history entry */
  go(delta: number): void
  /** Get current route */
  currentRoute(): RouteMatch | null
}
