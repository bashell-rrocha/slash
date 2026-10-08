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
  // Browsers treat "\" as "/" in http(s) URLs: normalize first, then remove duplicate slashes
  let sanitized = path.replace(/[\\/]+/g, "/")

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

/** Decodifica percent-encoding; se malformado, devolve o texto cru em vez de lançar */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * Parse query string into object
 * @param search - Query string (with or without leading ?)
 * @returns Query object
 */
export function parseQuery(search: string): RouteQuery {
  // Sem prototipo: chaves como __proto__ e constructor viram chaves proprias (SEC-11)
  const query: RouteQuery = Object.create(null)

  // Remove leading ?
  const cleanSearch = search.startsWith("?") ? search.slice(1) : search

  if (!cleanSearch) {
    return query
  }

  // Parse key=value pairs
  const pairs = cleanSearch.split("&")
  for (const pair of pairs) {
    // Divide no primeiro "=": o valor pode conter "=" (ex.: redirect=/x?y=1)
    const eq = pair.indexOf("=")
    const key = eq === -1 ? pair : pair.slice(0, eq)
    const value = eq === -1 ? "" : pair.slice(eq + 1)
    if (key) {
      Object.defineProperty(query, safeDecode(key), {
        value: safeDecode(value),
        writable: true,
        enumerable: true,
        configurable: true,
      })
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
