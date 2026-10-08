/**
 * Route matcher tests
 */

import { describe, expect, test } from "bun:test"
import {
  parsePathPattern,
  matchPath,
  matchRoute,
  matchRouteNested,
} from "./route-matcher"
import type { RouteConfig } from "./types"

describe("parsePathPattern", () => {
  test("should parse static path", () => {
    // Arrange
    const pattern = "/users"

    // Act
    const result = parsePathPattern(pattern)

    // Assert
    expect(result.tokens).toEqual([{ type: "static", value: "users" }])
    expect(result.paramNames).toEqual([])
    expect(result.score).toBe(10)
  })

  test("should parse path with single param", () => {
    // Arrange
    const pattern = "/users/:id"

    // Act
    const result = parsePathPattern(pattern)

    // Assert
    expect(result.tokens).toEqual([
      { type: "static", value: "users" },
      { type: "param", value: "id" },
    ])
    expect(result.paramNames).toEqual(["id"])
    expect(result.score).toBe(11) // 10 for static + 1 for param
  })

  test("should parse path with multiple params", () => {
    // Arrange
    const pattern = "/users/:userId/posts/:postId"

    // Act
    const result = parsePathPattern(pattern)

    // Assert
    expect(result.tokens).toEqual([
      { type: "static", value: "users" },
      { type: "param", value: "userId" },
      { type: "static", value: "posts" },
      { type: "param", value: "postId" },
    ])
    expect(result.paramNames).toEqual(["userId", "postId"])
    expect(result.score).toBe(22) // 20 for static + 2 for params
  })

  test("should handle root path", () => {
    // Arrange
    const pattern = "/"

    // Act
    const result = parsePathPattern(pattern)

    // Assert
    expect(result.tokens).toEqual([])
    expect(result.paramNames).toEqual([])
    expect(result.score).toBe(0)
  })

  test("should sanitize path before parsing", () => {
    // Arrange
    const pattern = "//users////:id//"

    // Act
    const result = parsePathPattern(pattern)

    // Assert
    expect(result.tokens).toEqual([
      { type: "static", value: "users" },
      { type: "param", value: "id" },
    ])
  })
})

describe("matchPath", () => {
  test("should match static path", () => {
    // Arrange
    const path = "/users"
    const pattern = parsePathPattern("/users")

    // Act
    const result = matchPath(path, pattern)

    // Assert
    expect(result.match).toBe(true)
    expect(result.params).toEqual({})
  })

  test("should not match different static path", () => {
    // Arrange
    const path = "/posts"
    const pattern = parsePathPattern("/users")

    // Act
    const result = matchPath(path, pattern)

    // Assert
    expect(result.match).toBe(false)
    expect(result.params).toEqual({})
  })

  test("should match path with param", () => {
    // Arrange
    const path = "/users/123"
    const pattern = parsePathPattern("/users/:id")

    // Act
    const result = matchPath(path, pattern)

    // Assert
    expect(result.match).toBe(true)
    expect(result.params).toEqual({ id: "123" })
  })

  test("should match path with multiple params", () => {
    // Arrange
    const path = "/users/123/posts/456"
    const pattern = parsePathPattern("/users/:userId/posts/:postId")

    // Act
    const result = matchPath(path, pattern)

    // Assert
    expect(result.match).toBe(true)
    expect(result.params).toEqual({ userId: "123", postId: "456" })
  })

  test("should not match if segment count differs", () => {
    // Arrange
    const path = "/users/123/extra"
    const pattern = parsePathPattern("/users/:id")

    // Act
    const result = matchPath(path, pattern)

    // Assert
    expect(result.match).toBe(false)
  })

  test("should match root path", () => {
    // Arrange
    const path = "/"
    const pattern = parsePathPattern("/")

    // Act
    const result = matchPath(path, pattern)

    // Assert
    expect(result.match).toBe(true)
    expect(result.params).toEqual({})
  })

  test("should handle sanitized paths", () => {
    // Arrange
    const path = "//users///123//"
    const pattern = parsePathPattern("/users/:id")

    // Act
    const result = matchPath(path, pattern)

    // Assert
    expect(result.match).toBe(true)
    expect(result.params).toEqual({ id: "123" })
  })
})

describe("matchRoute", () => {
  test("should match simple route", () => {
    // Arrange
    const routes: RouteConfig[] = [
      { path: "/users", component: () => "users" },
      { path: "/posts", component: () => "posts" },
    ]
    const path = "/users"

    // Act
    const result = matchRoute(path, routes)

    // Assert
    expect(result).not.toBeNull()
    expect(result?.route.path).toBe("/users")
    expect(result?.params).toEqual({})
  })

  test("should match route with params", () => {
    // Arrange
    const routes: RouteConfig[] = [
      { path: "/users/:id", component: () => "user" },
    ]
    const path = "/users/123"

    // Act
    const result = matchRoute(path, routes)

    // Assert
    expect(result).not.toBeNull()
    expect(result?.params).toEqual({ id: "123" })
  })

  test("should return null if no match", () => {
    // Arrange
    const routes: RouteConfig[] = [
      { path: "/users", component: () => "users" },
    ]
    const path = "/posts"

    // Act
    const result = matchRoute(path, routes)

    // Assert
    expect(result).toBeNull()
  })

  test("should rank more specific routes first", () => {
    // Arrange
    const routes: RouteConfig[] = [
      { path: "/tasks/:id", component: () => "task-detail" },
      { path: "/tasks/new", component: () => "task-new" },
    ]
    const path = "/tasks/new"

    // Act
    const result = matchRoute(path, routes)

    // Assert
    expect(result).not.toBeNull()
    expect(result?.route.component({} as any)).toBe("task-new")
  })

  test("should include route metadata", () => {
    // Arrange
    const routes: RouteConfig[] = [
      {
        path: "/admin",
        component: () => "admin",
        meta: { requiresAuth: true },
      },
    ]
    const path = "/admin"

    // Act
    const result = matchRoute(path, routes)

    // Assert
    expect(result).not.toBeNull()
    expect(result?.meta).toEqual({ requiresAuth: true })
  })

  test("should handle empty metadata", () => {
    // Arrange
    const routes: RouteConfig[] = [
      { path: "/home", component: () => "home" },
    ]
    const path = "/home"

    // Act
    const result = matchRoute(path, routes)

    // Assert
    expect(result).not.toBeNull()
    expect(result?.meta).toEqual({})
  })
})

describe("matchRouteNested", () => {
  test("should match parent route", () => {
    // Arrange
    const routes: RouteConfig[] = [
      { path: "/users", component: () => "users" },
    ]
    const path = "/users"

    // Act
    const result = matchRouteNested(path, routes)

    // Assert
    expect(result).not.toBeNull()
    expect(result?.route.path).toBe("/users")
  })

  test("should match nested route", () => {
    // Arrange
    const routes: RouteConfig[] = [
      {
        path: "/users",
        component: () => "users",
        children: [
          { path: "/:id", component: () => "user-detail" },
        ],
      },
    ]
    const path = "/users/123"

    // Act
    const result = matchRouteNested(path, routes)

    // Assert
    expect(result).not.toBeNull()
    expect(result?.params).toEqual({ id: "123" })
  })

  test("should match deeply nested routes", () => {
    // Arrange
    const routes: RouteConfig[] = [
      {
        path: "/users",
        component: () => "users",
        children: [
          {
            path: "/:userId",
            component: () => "user",
            children: [
              { path: "/posts/:postId", component: () => "post" },
            ],
          },
        ],
      },
    ]
    const path = "/users/123/posts/456"

    // Act
    const result = matchRouteNested(path, routes)

    // Assert
    expect(result).not.toBeNull()
    expect(result?.params).toEqual({ userId: "123", postId: "456" })
  })

  test("should return null if nested route not found", () => {
    // Arrange
    const routes: RouteConfig[] = [
      {
        path: "/users",
        component: () => "users",
        children: [
          { path: "/:id", component: () => "user" },
        ],
      },
    ]
    const path = "/posts/123"

    // Act
    const result = matchRouteNested(path, routes)

    // Assert
    expect(result).toBeNull()
  })

  test("should handle routes without children", () => {
    // Arrange
    const routes: RouteConfig[] = [
      { path: "/about", component: () => "about" },
    ]
    const path = "/about"

    // Act
    const result = matchRouteNested(path, routes)

    // Assert
    expect(result).not.toBeNull()
    expect(result?.route.path).toBe("/about")
  })
})
