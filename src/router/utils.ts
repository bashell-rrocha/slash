/**
 * Router utility functions
 */

import type { RouteQuery } from "./types"

/**
 * Sanitize a path by removing duplicate slashes and trailing slashes
 * @param path - Path to sanitize
 * @returns Sanitized path
 */
export function sanitizePath(path: string): string {
  // Remove duplicate slashes
  let sanitized = path.replace(/\/+/g, "/")

  // Remove trailing slash (except for root path)
  if (sanitized.length > 1 && sanitized.endsWith("/")) {
    sanitized = sanitized.slice(0, -1)
  }

  // Ensure path starts with /
  if (!sanitized.startsWith("/")) {
    sanitized = "/" + sanitized
  }

  return sanitized
}

/**
 * Parse query string into object
 * @param search - Query string (with or without leading ?)
 * @returns Query object
 */
export function parseQuery(search: string): RouteQuery {
  const query: RouteQuery = {}

  // Remove leading ?
  const cleanSearch = search.startsWith("?") ? search.slice(1) : search

  if (!cleanSearch) {
    return query
  }

  // Parse key=value pairs
  const pairs = cleanSearch.split("&")
  for (const pair of pairs) {
    const [key, value] = pair.split("=")
    if (key) {
      query[decodeURIComponent(key)] = value ? decodeURIComponent(value) : ""
    }
  }

  return query
}

/**
 * Build a path with optional query parameters
 * @param path - Base path
 * @param query - Query parameters
 * @returns Full path with query string
 */
export function buildPath(path: string, query?: RouteQuery): string {
  const sanitized = sanitizePath(path)

  if (!query || Object.keys(query).length === 0) {
    return sanitized
  }

  const queryString = Object.entries(query)
    .map(([key, value]) => {
      const encodedKey = encodeURIComponent(key)
      const encodedValue = encodeURIComponent(value)
      return `${encodedKey}=${encodedValue}`
    })
    .join("&")

  return `${sanitized}?${queryString}`
}

/**
 * Split path into pathname and search
 * @param path - Full path with optional query string
 * @returns Tuple of [pathname, search]
 */
export function splitPath(path: string): [string, string] {
  const questionIndex = path.indexOf("?")

  if (questionIndex === -1) {
    return [path, ""]
  }

  return [
    path.slice(0, questionIndex),
    path.slice(questionIndex)
  ]
}
