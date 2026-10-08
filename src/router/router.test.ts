/**
 * Router tests
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { createRouter } from "./router"
import type { RouteConfig } from "./types"

// Mock routes for testing
const mockRoutes: RouteConfig[] = [
  { path: "/", component: () => "home" },
  { path: "/about", component: () => "about" },
  { path: "/users", component: () => "users" },
  { path: "/users/:id", component: () => "user-detail" },
  { path: "/admin", component: () => "admin", meta: { requiresAuth: true } },
]

describe("createRouter", () => {
  beforeEach(() => {
    // Reset history
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/")
    }
  })

  test("should create router instance", () => {
    // Arrange & Act
    const router = createRouter({ routes: mockRoutes })

    // Assert
    expect(router).toBeDefined()
    expect(router.push).toBeDefined()
    expect(router.replace).toBeDefined()
    expect(router.back).toBeDefined()
    expect(router.forward).toBeDefined()
    expect(router.go).toBeDefined()
    expect(router.get).toBeDefined()
    expect(router.set).toBeDefined()
    expect(router.watch).toBeDefined()
  })

  test("should initialize with initial path", () => {
    // Arrange & Act
    const router = createRouter({
      routes: mockRoutes,
      initialPath: "/about",
    })

    // Assert
    const state = router.get()
    expect(state.currentRoute).not.toBeNull()
    expect(state.currentRoute?.path).toBe("/about")
  })

  test("should navigate to home route", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })

    // Act
    await router.push("/")

    // Assert
    const state = router.get()
    expect(state.currentRoute).not.toBeNull()
    expect(state.currentRoute?.path).toBe("/")
  })

  test("should navigate to route with params", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })

    // Act
    await router.push("/users/123")

    // Assert
    const state = router.get()
    expect(state.currentRoute).not.toBeNull()
    expect(state.currentRoute?.path).toBe("/users/123")
    expect(state.params).toEqual({ id: "123" })
  })

  test("should parse query parameters", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })

    // Act
    await router.push("/users?search=john&page=2")

    // Assert
    const state = router.get()
    expect(state.query).toEqual({ search: "john", page: "2" })
  })

  test("should update route on push", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })
    await router.push("/")

    // Act
    await router.push("/about")

    // Assert
    const state = router.get()
    expect(state.currentRoute?.path).toBe("/about")
  })

  test("should update route on replace", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })
    await router.push("/")

    // Act
    await router.replace("/about")

    // Assert
    const state = router.get()
    expect(state.currentRoute?.path).toBe("/about")
  })

  test("should notify watchers on route change", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })
    let watcherCalled = false
    let capturedState: any = null

    router.watch((state) => {
      watcherCalled = true
      capturedState = state
    })

    // Act
    await router.push("/about")

    // Assert
    expect(watcherCalled).toBe(true)
    expect(capturedState.currentRoute?.path).toBe("/about")
  })

  test("should include route metadata", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })

    // Act
    await router.push("/admin")

    // Assert
    const state = router.get()
    expect(state.meta).toEqual({ requiresAuth: true })
  })

  test("should handle 404 with fallback", async () => {
    // Arrange
    const routes = [
      ...mockRoutes,
      { path: "/404", component: () => "not-found" },
    ]
    const router = createRouter({
      routes,
      fallback: "/404",
    })

    // Act
    await router.push("/nonexistent")

    // Assert
    const state = router.get()
    expect(state.currentRoute?.path).toBe("/404")
  })

  test("should handle 404 without fallback", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })

    // Act
    await router.push("/nonexistent")

    // Assert
    const state = router.get()
    expect(state.currentRoute).toBeNull()
  })

  test("should execute navigation guards", async () => {
    // Arrange
    let guardCalled = false
    const guard = () => {
      guardCalled = true
    }

    const router = createRouter({
      routes: mockRoutes,
      guards: [guard],
    })

    // Act
    await router.push("/about")

    // Assert
    expect(guardCalled).toBe(true)
  })

  test("should block navigation when guard returns false", async () => {
    // Arrange
    const guard = () => false

    const router = createRouter({
      routes: mockRoutes,
      guards: [guard],
      initialPath: "/",
    })

    // Act
    await router.push("/about")

    // Assert
    const state = router.get()
    expect(state.currentRoute?.path).toBe("/")
  })

  test("should redirect when guard returns path", async () => {
    // Arrange
    const guard = (to: any) => {
      if (to.route.path === "/admin") {
        return "/login"
      }
    }

    const routes = [
      ...mockRoutes,
      { path: "/login", component: () => "login" },
    ]

    const router = createRouter({
      routes,
      guards: [guard],
    })

    // Act
    await router.push("/admin")

    // Assert
    const state = router.get()
    expect(state.currentRoute?.path).toBe("/login")
  })

  test("should execute route-specific guards", async () => {
    // Arrange
    let routeGuardCalled = false
    const routeGuard = () => {
      routeGuardCalled = true
    }

    const routes = [
      {
        path: "/protected",
        component: () => "protected",
        guards: [routeGuard],
      },
    ]

    const router = createRouter({ routes })

    // Act
    await router.push("/protected")

    // Assert
    expect(routeGuardCalled).toBe(true)
  })

  test("should provide currentRoute helper method", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })
    await router.push("/users/456")

    // Act
    const currentRoute = router.currentRoute()

    // Assert
    expect(currentRoute).not.toBeNull()
    expect(currentRoute?.path).toBe("/users/456")
    expect(currentRoute?.params).toEqual({ id: "456" })
  })

  test("should handle back navigation", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })

    // Act & Assert
    expect(() => router.back()).not.toThrow()
  })

  test("should handle forward navigation", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })

    // Act & Assert
    expect(() => router.forward()).not.toThrow()
  })

  test("should handle go navigation", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes })

    // Act & Assert
    expect(() => router.go(-1)).not.toThrow()
    expect(() => router.go(1)).not.toThrow()
  })

  test("should handle hash mode", () => {
    // Arrange & Act
    const router = createRouter({
      routes: mockRoutes,
      mode: "hash",
    })

    // Assert
    expect(router).toBeDefined()
  })

  test("should set isNavigating flag during navigation", async () => {
    // Arrange
    const routes = [
      {
        path: "/slow",
        component: () => "slow",
      },
    ]

    const router = createRouter({ routes, initialPath: "/" })

    // Act
    await router.push("/slow")

    // Check after navigation
    const stateAfter = router.get()

    // Assert - isNavigating should be false after navigation completes
    expect(stateAfter.isNavigating).toBe(false)
    expect(stateAfter.currentRoute?.path).toBe("/slow")
  })
})
