/**
 * Tests for navigation decision logic
 */

import { describe, it, expect } from "bun:test"
import {
  parseNavigationPath,
  findRouteMatch,
  computeNavigation,
  type NavigationDecision,
} from "./navigation-decision"
import type { RouteConfig, RouteMatch, NavigationGuard } from "./types"

describe("parseNavigationPath", () => {
  it("should parse path without query", () => {
    const result = parseNavigationPath("/users")

    expect(result).toEqual({
      pathname: "/users",
      query: {},
      fullPath: "/users",
    })
  })

  it("should parse path with query", () => {
    const result = parseNavigationPath("/users?page=2&sort=name")

    expect(result).toEqual({
      pathname: "/users",
      query: { page: "2", sort: "name" },
      fullPath: "/users?page=2&sort=name",
    })
  })

  it("should sanitize path", () => {
    const result = parseNavigationPath("//users//")

    expect(result.pathname).toBe("/users")
  })
})

describe("findRouteMatch", () => {
  const routes: RouteConfig[] = [
    {
      path: "/",
      component: () => "Home",
    },
    {
      path: "/users",
      component: () => "Users",
    },
    {
      path: "/users/:id",
      component: () => "User",
      meta: { auth: true },
    },
    {
      path: "/404",
      component: () => "NotFound",
    },
  ]

  it("should match static route", () => {
    const match = findRouteMatch("/users", {}, routes)

    expect(match).not.toBeNull()
    expect(match?.route.path).toBe("/users")
    expect(match?.params).toEqual({})
  })

  it("should match dynamic route", () => {
    const match = findRouteMatch("/users/123", {}, routes)

    expect(match).not.toBeNull()
    expect(match?.route.path).toBe("/users/:id")
    expect(match?.params).toEqual({ id: "123" })
  })

  it("should include query in match", () => {
    const match = findRouteMatch("/users", { page: "2" }, routes)

    expect(match).not.toBeNull()
    expect(match?.query).toEqual({ page: "2" })
  })

  it("should include meta in match", () => {
    const match = findRouteMatch("/users/123", {}, routes)

    expect(match).not.toBeNull()
    expect(match?.meta).toEqual({ auth: true })
  })

  it("should return null for no match", () => {
    const match = findRouteMatch("/nonexistent", {}, routes)

    expect(match).toBeNull()
  })

  it("should use fallback when no match", () => {
    const match = findRouteMatch("/nonexistent", {}, routes, "/404")

    expect(match).not.toBeNull()
    expect(match?.route.path).toBe("/404")
  })

  it("should prefer exact match over fallback", () => {
    const match = findRouteMatch("/users", {}, routes, "/404")

    expect(match).not.toBeNull()
    expect(match?.route.path).toBe("/users")
  })
})

describe("computeNavigation", () => {
  const routes: RouteConfig[] = [
    {
      path: "/",
      component: () => "Home",
    },
    {
      path: "/users",
      component: () => "Users",
    },
    {
      path: "/admin",
      component: () => "Admin",
      meta: { requiresAuth: true },
    },
    {
      path: "/404",
      component: () => "NotFound",
    },
  ]

  it("should allow navigation to valid route", async () => {
    const decision = await computeNavigation("/users", routes, [], null)

    expect(decision.shouldNavigate).toBe(true)
    expect(decision.newRoute).not.toBeNull()
    expect(decision.newRoute?.route.path).toBe("/users")
  })

  it("should block navigation for no match", async () => {
    const decision = await computeNavigation("/nonexistent", routes, [], null)

    expect(decision.shouldNavigate).toBe(false)
    expect(decision.newRoute).toBeNull()
    expect(decision.error).toBe("No route match found")
  })

  it("should use fallback for no match", async () => {
    const decision = await computeNavigation("/nonexistent", routes, [], null, "/404")

    expect(decision.shouldNavigate).toBe(true)
    expect(decision.newRoute?.route.path).toBe("/404")
  })

  it("should block navigation when guard returns false", async () => {
    const guard: NavigationGuard = () => false
    const decision = await computeNavigation("/users", routes, [guard], null)

    expect(decision.shouldNavigate).toBe(false)
    expect(decision.newRoute).toBeNull()
    expect(decision.error).toBe("Navigation blocked by guard")
  })

  it("should redirect when guard returns string", async () => {
    const guard: NavigationGuard = () => "/login"
    const decision = await computeNavigation("/admin", routes, [guard], null)

    expect(decision.shouldNavigate).toBe(false)
    expect(decision.redirect).toBe("/login")
  })

  it("should allow navigation when guard returns true", async () => {
    const guard: NavigationGuard = () => true
    const decision = await computeNavigation("/users", routes, [guard], null)

    expect(decision.shouldNavigate).toBe(true)
    expect(decision.newRoute?.route.path).toBe("/users")
  })

  it("should execute multiple guards in sequence", async () => {
    const executionOrder: number[] = []
    const guard1: NavigationGuard = () => {
      executionOrder.push(1)
      return true
    }
    const guard2: NavigationGuard = () => {
      executionOrder.push(2)
      return true
    }

    const decision = await computeNavigation("/users", routes, [guard1, guard2], null)

    expect(decision.shouldNavigate).toBe(true)
    expect(executionOrder).toEqual([1, 2])
  })

  it("should stop at first guard that blocks", async () => {
    const executionOrder: number[] = []
    const guard1: NavigationGuard = () => {
      executionOrder.push(1)
      return true
    }
    const guard2: NavigationGuard = () => {
      executionOrder.push(2)
      return false
    }
    const guard3: NavigationGuard = () => {
      executionOrder.push(3)
      return true
    }

    const decision = await computeNavigation("/users", routes, [guard1, guard2, guard3], null)

    expect(decision.shouldNavigate).toBe(false)
    expect(executionOrder).toEqual([1, 2]) // guard3 should not execute
  })

  it("should combine global and route-specific guards", async () => {
    const executionOrder: string[] = []
    const globalGuard: NavigationGuard = () => {
      executionOrder.push("global")
      return true
    }
    const routeGuard: NavigationGuard = () => {
      executionOrder.push("route")
      return true
    }

    const routesWithGuards: RouteConfig[] = [
      {
        path: "/protected",
        component: () => "Protected",
        guards: [routeGuard],
      },
    ]

    const decision = await computeNavigation("/protected", routesWithGuards, [globalGuard], null)

    expect(decision.shouldNavigate).toBe(true)
    expect(executionOrder).toEqual(["global", "route"])
  })

  it("should pass correct to and from routes to guards", async () => {
    let guardTo: RouteMatch | null = null
    let guardFrom: RouteMatch | null = null

    const guard: NavigationGuard = (to, from) => {
      guardTo = to
      guardFrom = from
      return true
    }

    const currentRoute: RouteMatch = {
      route: routes[0],
      params: {},
      query: {},
      path: "/",
      meta: {},
    }

    await computeNavigation("/users", routes, [guard], currentRoute)

    expect(guardTo?.route.path).toBe("/users")
    expect(guardFrom?.route.path).toBe("/")
  })
})
