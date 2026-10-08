/**
 * Router utils tests
 */

import { describe, expect, test } from "bun:test"
import { sanitizePath, parseQuery, buildPath, splitPath } from "./utils"

describe("sanitizePath", () => {
  test("should remove duplicate slashes", () => {
    // Arrange
    const path = "//users///123//posts"

    // Act
    const result = sanitizePath(path)

    // Assert
    expect(result).toBe("/users/123/posts")
  })

  test("should remove trailing slash (except root)", () => {
    // Arrange
    const path = "/users/123/"

    // Act
    const result = sanitizePath(path)

    // Assert
    expect(result).toBe("/users/123")
  })

  test("should keep root path as /", () => {
    // Arrange
    const path = "/"

    // Act
    const result = sanitizePath(path)

    // Assert
    expect(result).toBe("/")
  })

  test("should add leading slash if missing", () => {
    // Arrange
    const path = "users/123"

    // Act
    const result = sanitizePath(path)

    // Assert
    expect(result).toBe("/users/123")
  })

  test("should handle empty string", () => {
    // Arrange
    const path = ""

    // Act
    const result = sanitizePath(path)

    // Assert
    expect(result).toBe("/")
  })

  test("should handle complex paths", () => {
    // Arrange
    const path = "//users///123//posts/456//"

    // Act
    const result = sanitizePath(path)

    // Assert
    expect(result).toBe("/users/123/posts/456")
  })
})

describe("parseQuery", () => {
  test("should parse simple query string", () => {
    // Arrange
    const search = "?a=1&b=2"

    // Act
    const result = parseQuery(search)

    // Assert
    expect(result).toEqual({ a: "1", b: "2" })
  })

  test("should parse query string without leading ?", () => {
    // Arrange
    const search = "a=1&b=2"

    // Act
    const result = parseQuery(search)

    // Assert
    expect(result).toEqual({ a: "1", b: "2" })
  })

  test("should handle empty query string", () => {
    // Arrange
    const search = ""

    // Act
    const result = parseQuery(search)

    // Assert
    expect(result).toEqual({})
  })

  test("should handle query string with only ?", () => {
    // Arrange
    const search = "?"

    // Act
    const result = parseQuery(search)

    // Assert
    expect(result).toEqual({})
  })

  test("should decode URL-encoded values", () => {
    // Arrange
    const search = "?name=John%20Doe&email=test%40example.com"

    // Act
    const result = parseQuery(search)

    // Assert
    expect(result).toEqual({ name: "John Doe", email: "test@example.com" })
  })

  test("should handle params without values", () => {
    // Arrange
    const search = "?key1&key2=value2"

    // Act
    const result = parseQuery(search)

    // Assert
    expect(result).toEqual({ key1: "", key2: "value2" })
  })

  test("should handle params with empty values", () => {
    // Arrange
    const search = "?key1=&key2=value2"

    // Act
    const result = parseQuery(search)

    // Assert
    expect(result).toEqual({ key1: "", key2: "value2" })
  })

  test("should handle special characters", () => {
    // Arrange
    const search = "?search=hello%20world&filter=%2Fusers%2F123"

    // Act
    const result = parseQuery(search)

    // Assert
    expect(result).toEqual({ search: "hello world", filter: "/users/123" })
  })
})

describe("buildPath", () => {
  test("should build path without query", () => {
    // Arrange
    const path = "/users/123"
    const query = undefined

    // Act
    const result = buildPath(path, query)

    // Assert
    expect(result).toBe("/users/123")
  })

  test("should build path with empty query", () => {
    // Arrange
    const path = "/users/123"
    const query = {}

    // Act
    const result = buildPath(path, query)

    // Assert
    expect(result).toBe("/users/123")
  })

  test("should build path with query parameters", () => {
    // Arrange
    const path = "/users"
    const query = { search: "john", page: "2" }

    // Act
    const result = buildPath(path, query)

    // Assert
    expect(result).toBe("/users?search=john&page=2")
  })

  test("should encode query parameter values", () => {
    // Arrange
    const path = "/search"
    const query = { q: "hello world", filter: "/users/123" }

    // Act
    const result = buildPath(path, query)

    // Assert
    expect(result).toBe("/search?q=hello%20world&filter=%2Fusers%2F123")
  })

  test("should sanitize path before adding query", () => {
    // Arrange
    const path = "//users///123//"
    const query = { active: "true" }

    // Act
    const result = buildPath(path, query)

    // Assert
    expect(result).toBe("/users/123?active=true")
  })

  test("should handle single query parameter", () => {
    // Arrange
    const path = "/posts"
    const query = { id: "456" }

    // Act
    const result = buildPath(path, query)

    // Assert
    expect(result).toBe("/posts?id=456")
  })
})

describe("splitPath", () => {
  test("should split path without query string", () => {
    // Arrange
    const path = "/users/123"

    // Act
    const result = splitPath(path)

    // Assert
    expect(result).toEqual(["/users/123", ""])
  })

  test("should split path with query string", () => {
    // Arrange
    const path = "/users/123?active=true&page=2"

    // Act
    const result = splitPath(path)

    // Assert
    expect(result).toEqual(["/users/123", "?active=true&page=2"])
  })

  test("should handle path with only query string", () => {
    // Arrange
    const path = "?search=test"

    // Act
    const result = splitPath(path)

    // Assert
    expect(result).toEqual(["", "?search=test"])
  })

  test("should handle empty path", () => {
    // Arrange
    const path = ""

    // Act
    const result = splitPath(path)

    // Assert
    expect(result).toEqual(["", ""])
  })

  test("should handle path with multiple question marks", () => {
    // Arrange
    const path = "/search?q=what?why"

    // Act
    const result = splitPath(path)

    // Assert
    expect(result).toEqual(["/search", "?q=what?why"])
  })
})
