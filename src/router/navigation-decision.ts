/**
 * Pure navigation decision logic
 * This module contains pure functions that compute navigation decisions
 * without executing side effects
 */

import type { RouteConfig, RouteMatch, NavigationGuard, RouteQuery } from "./types"
import { matchRouteNested } from "./route-matcher"
import { sanitizePath, parseQuery, splitPath } from "./utils"
import { executeGuards } from "./guards"

/**
 * Navigation decision result
 */
export interface NavigationDecision {
  /** Whether navigation should proceed */
  shouldNavigate: boolean
  /** New route to navigate to (null if no match) */
  newRoute: RouteMatch | null
  /** Redirect path (if guard returned redirect) */
  redirect?: string
  /** Error message (if navigation failed) */
  error?: string
}

/**
 * Parsed navigation input
 */
export interface NavigationInput {
  /** Sanitized pathname */
  pathname: string
  /** Parsed query parameters */
  query: RouteQuery
  /** Original full path */
  fullPath: string
}

/**
 * Parse navigation path into components
 * Pure function - no side effects
 */
export function parseNavigationPath(path: string): NavigationInput {
  const [pathname, search] = splitPath(path)
  const sanitizedPath = sanitizePath(pathname)
  const query = parseQuery(search)

  return {
    pathname: sanitizedPath,
    query,
    fullPath: path,
  }
}

/**
 * Find route match with fallback support
 * Pure function - no side effects
 */
export function findRouteMatch(
  pathname: string,
  query: RouteQuery,
  routes: RouteConfig[],
  fallback?: string
): RouteMatch | null {
  // Try to match the requested path
  let match = matchRouteNested(pathname, routes)

  // If no match and fallback exists, try fallback
  if (!match && fallback) {
    match = matchRouteNested(fallback, routes)
  }

  // Add query to match if found
  if (match) {
    match.query = query
  }

  return match
}

/**
 * Compute navigation decision
 * Pure function (except for guard execution which is async)
 *
 * @param path - Target path to navigate to
 * @param routes - Array of route configurations
 * @param guards - Global navigation guards
 * @param currentRoute - Current active route (null if none)
 * @param fallback - Fallback path for 404
 * @returns Navigation decision object
 */
export async function computeNavigation(
  path: string,
  routes: RouteConfig[],
  guards: NavigationGuard[],
  currentRoute: RouteMatch | null,
  fallback?: string
): Promise<NavigationDecision> {
  // Parse the path
  const input = parseNavigationPath(path)

  // Find matching route
  const match = findRouteMatch(input.pathname, input.query, routes, fallback)

  // If no match found, navigation fails
  if (!match) {
    return {
      shouldNavigate: false,
      newRoute: null,
      error: "No route match found",
    }
  }

  // Combine global guards with route-specific guards
  const routeGuards = match.route.guards || []
  const allGuards = [...guards, ...routeGuards]

  // Execute guards
  const guardResult = await executeGuards(allGuards, match, currentRoute)

  // If guard blocked navigation
  if (!guardResult.allowed) {
    // If guard returned redirect
    if (guardResult.redirect) {
      return {
        shouldNavigate: false,
        newRoute: null,
        redirect: guardResult.redirect,
      }
    }

    // Otherwise just block
    return {
      shouldNavigate: false,
      newRoute: null,
      error: "Navigation blocked by guard",
    }
  }

  // Navigation allowed
  return {
    shouldNavigate: true,
    newRoute: match,
  }
}
