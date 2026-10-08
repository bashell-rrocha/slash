/**
 * Guards tests
 */

import { describe, expect, test } from "bun:test"
import { executeGuards } from "./guards"
import type { RouteMatch, NavigationGuard } from "./types"

// Helper to create a mock route
function createMockRoute(path: string): RouteMatch {
  return {
    route: { path, component: () => null },
    params: {},
    query: {},
    path,
    meta: {},
  }
}

describe("executeGuards", () => {
  test("should allow navigation when no guards", async () => {
    // Arrange
    const to = createMockRoute("/dashboard")
    const from = null
    const guards: NavigationGuard[] = []

    // Act
    const result = await executeGuards(guards, to, from)

    // Assert
    expect(result.allowed).toBe(true)
    expect(result.redirect).toBeUndefined()
  })

  test("should allow navigation when guard returns void", async () => {
    // Arrange
    const to = createMockRoute("/dashboard")
    const from = null
    const guard: NavigationGuard = () => {
      // No return (void)
    }

    // Act
    const result = await executeGuards([guard], to, from)

    // Assert
    expect(result.allowed).toBe(true)
  })

  test("should allow navigation when guard returns true", async () => {
    // Arrange
    const to = createMockRoute("/dashboard")
    const from = null
    const guard: NavigationGuard = () => true

    // Act
    const result = await executeGuards([guard], to, from)

    // Assert
    expect(result.allowed).toBe(true)
  })

  test("should block navigation when guard returns false", async () => {
    // Arrange
    const to = createMockRoute("/admin")
    const from = null
    const guard: NavigationGuard = () => false

    // Act
    const result = await executeGuards([guard], to, from)

    // Assert
    expect(result.allowed).toBe(false)
    expect(result.redirect).toBeUndefined()
  })

  test("should redirect when guard returns string", async () => {
    // Arrange
    const to = createMockRoute("/admin")
    const from = null
    const guard: NavigationGuard = () => "/login"

    // Act
    const result = await executeGuards([guard], to, from)

    // Assert
    expect(result.allowed).toBe(false)
    expect(result.redirect).toBe("/login")
  })

  test("should execute multiple guards in order", async () => {
    // Arrange
    const to = createMockRoute("/dashboard")
    const from = null
    const executionOrder: number[] = []

    const guard1: NavigationGuard = () => {
      executionOrder.push(1)
    }

    const guard2: NavigationGuard = () => {
      executionOrder.push(2)
    }

    const guard3: NavigationGuard = () => {
      executionOrder.push(3)
    }

    // Act
    const result = await executeGuards([guard1, guard2, guard3], to, from)

    // Assert
    expect(result.allowed).toBe(true)
    expect(executionOrder).toEqual([1, 2, 3])
  })

  test("should stop at first guard that returns false", async () => {
    // Arrange
    const to = createMockRoute("/admin")
    const from = null
    const executionOrder: number[] = []

    const guard1: NavigationGuard = () => {
      executionOrder.push(1)
    }

    const guard2: NavigationGuard = () => {
      executionOrder.push(2)
      return false
    }

    const guard3: NavigationGuard = () => {
      executionOrder.push(3)
    }

    // Act
    const result = await executeGuards([guard1, guard2, guard3], to, from)

    // Assert
    expect(result.allowed).toBe(false)
    expect(executionOrder).toEqual([1, 2]) // guard3 not executed
  })

  test("should stop at first guard that returns redirect", async () => {
    // Arrange
    const to = createMockRoute("/admin")
    const from = null
    const executionOrder: number[] = []

    const guard1: NavigationGuard = () => {
      executionOrder.push(1)
    }

    const guard2: NavigationGuard = () => {
      executionOrder.push(2)
      return "/login"
    }

    const guard3: NavigationGuard = () => {
      executionOrder.push(3)
    }

    // Act
    const result = await executeGuards([guard1, guard2, guard3], to, from)

    // Assert
    expect(result.allowed).toBe(false)
    expect(result.redirect).toBe("/login")
    expect(executionOrder).toEqual([1, 2]) // guard3 not executed
  })

  test("should handle async guards", async () => {
    // Arrange
    const to = createMockRoute("/dashboard")
    const from = null

    const asyncGuard: NavigationGuard = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return true
    }

    // Act
    const result = await executeGuards([asyncGuard], to, from)

    // Assert
    expect(result.allowed).toBe(true)
  })

  test("should block navigation when async guard returns false", async () => {
    // Arrange
    const to = createMockRoute("/admin")
    const from = null

    const asyncGuard: NavigationGuard = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return false
    }

    // Act
    const result = await executeGuards([asyncGuard], to, from)

    // Assert
    expect(result.allowed).toBe(false)
  })

  test("should redirect when async guard returns string", async () => {
    // Arrange
    const to = createMockRoute("/admin")
    const from = null

    const asyncGuard: NavigationGuard = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return "/login"
    }

    // Act
    const result = await executeGuards([asyncGuard], to, from)

    // Assert
    expect(result.allowed).toBe(false)
    expect(result.redirect).toBe("/login")
  })

  test("should block navigation when guard throws error", async () => {
    // Arrange
    const to = createMockRoute("/dashboard")
    const from = null

    const errorGuard: NavigationGuard = () => {
      throw new Error("Guard error")
    }

    // Suppress console.error for this test
    const originalError = console.error
    console.error = () => {}

    // Act
    const result = await executeGuards([errorGuard], to, from)

    // Restore console.error
    console.error = originalError

    // Assert
    expect(result.allowed).toBe(false)
  })

  test("should block navigation when async guard throws error", async () => {
    // Arrange
    const to = createMockRoute("/dashboard")
    const from = null

    const asyncErrorGuard: NavigationGuard = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      throw new Error("Async guard error")
    }

    // Suppress console.error for this test
    const originalError = console.error
    console.error = () => {}

    // Act
    const result = await executeGuards([asyncErrorGuard], to, from)

    // Restore console.error
    console.error = originalError

    // Assert
    expect(result.allowed).toBe(false)
  })

  test("should pass correct to and from parameters to guard", async () => {
    // Arrange
    const to = createMockRoute("/dashboard")
    const from = createMockRoute("/home")

    let capturedTo: RouteMatch | null = null
    let capturedFrom: RouteMatch | null = null

    const guard: NavigationGuard = (toRoute, fromRoute) => {
      capturedTo = toRoute
      capturedFrom = fromRoute
    }

    // Act
    await executeGuards([guard], to, from)

    // Assert
    expect(capturedTo).toEqual(to)
    expect(capturedFrom).toEqual(from)
  })

  test("should handle null from parameter", async () => {
    // Arrange
    const to = createMockRoute("/dashboard")
    const from = null

    let capturedFrom: RouteMatch | null = null

    const guard: NavigationGuard = (_, fromRoute) => {
      capturedFrom = fromRoute
    }

    // Act
    await executeGuards([guard], to, from)

    // Assert
    expect(capturedFrom).toBeNull()
  })
})
