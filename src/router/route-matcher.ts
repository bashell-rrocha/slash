/**
 * Route matching logic
 */

import type { RouteConfig, RouteMatch, RouteParams } from "./types"
import { sanitizePath } from "./utils"

/**
 * Path pattern token types
 */
type TokenType = "static" | "param"

interface PathToken {
  type: TokenType
  value: string
}

/**
 * Parsed path pattern
 */
export interface PathPattern {
  tokens: PathToken[]
  paramNames: string[]
  score: number // For ranking routes (higher = more specific)
}

/**
 * Parse a route path pattern into tokens
 * Example: "/users/:id/posts/:postId" → tokens for matching
 */
export function parsePathPattern(pattern: string): PathPattern {
  const sanitized = sanitizePath(pattern)
  const segments = sanitized.split("/").filter(Boolean)

  const tokens: PathToken[] = []
  const paramNames: string[] = []
  let score = 0

  for (const segment of segments) {
    if (segment.startsWith(":")) {
      // Dynamic parameter
      const paramName = segment.slice(1)
      tokens.push({ type: "param", value: paramName })
      paramNames.push(paramName)
      score += 1 // params are less specific
    } else {
      // Static segment
      tokens.push({ type: "static", value: segment })
      score += 10 // static segments are more specific
    }
  }

  return { tokens, paramNames, score }
}

/**
 * Match a path against a pattern
 * Returns match result with extracted params
 */
export function matchPath(
  path: string,
  pattern: PathPattern
): { match: boolean; params: RouteParams } {
  const sanitized = sanitizePath(path)
  const segments = sanitized.split("/").filter(Boolean)

  // Must have same number of segments
  if (segments.length !== pattern.tokens.length) {
    return { match: false, params: {} }
  }

  const params: RouteParams = {}

  for (let i = 0; i < pattern.tokens.length; i++) {
    const token = pattern.tokens[i]
    const segment = segments[i]

    if (token.type === "static") {
      // Static segment must match exactly
      if (token.value !== segment) {
        return { match: false, params: {} }
      }
    } else if (token.type === "param") {
      // Dynamic param - capture the value
      params[token.value] = segment
    }
  }

  return { match: true, params }
}

/**
 * Find matching route from array of route configs
 * Returns the first matching route with highest score (most specific)
 */
export function matchRoute(
  path: string,
  routes: RouteConfig[]
): RouteMatch | null {
  const sanitized = sanitizePath(path)

  // Parse and score all routes
  const routesWithPatterns = routes.map((route) => ({
    route,
    pattern: parsePathPattern(route.path),
  }))

  // Sort by score (highest first) for proper ranking
  routesWithPatterns.sort((a, b) => b.pattern.score - a.pattern.score)

  // Find first match
  for (const { route, pattern } of routesWithPatterns) {
    const result = matchPath(sanitized, pattern)
    if (result.match) {
      return {
        route,
        params: result.params,
        query: {}, // Query will be added by router
        path: sanitized,
        meta: route.meta || {},
      }
    }
  }

  return null
}

/**
 * Match route with support for nested/child routes
 * Recursively searches through children
 */
export function matchRouteNested(
  path: string,
  routes: RouteConfig[],
  parentPath = ""
): RouteMatch | null {
  const sanitized = sanitizePath(path)

  for (const route of routes) {
    const fullPath = sanitizePath(`${parentPath}${route.path}`)
    const pattern = parsePathPattern(fullPath)
    const result = matchPath(sanitized, pattern)

    if (result.match) {
      return {
        route,
        params: result.params,
        query: {},
        path: sanitized,
        meta: route.meta || {},
      }
    }

    // Try nested routes
    if (route.children && route.children.length > 0) {
      const childMatch = matchRouteNested(sanitized, route.children, fullPath)
      if (childMatch) {
        return childMatch
      }
    }
  }

  return null
}
