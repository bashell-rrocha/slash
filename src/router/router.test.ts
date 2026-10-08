/**
 * Router tests
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { html, render } from "../core"
import { Router } from "./components"
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
    // Arrange: o guard bloqueia só /about; a rota inicial "/" passa pelos guards
    const guard = (to: any) => to.path !== "/about"

    const router = createRouter({
      routes: mockRoutes,
      guards: [guard],
      initialPath: "/",
    })
    await router.ready

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

// happy-dom começa em about:blank; setURL define uma origem real para location
function setUrl(path: string) {
  ;(window as any).happyDOM.setURL(`http://localhost${path}`)
}

describe("navegação inicial e guards", () => {
  const routes: RouteConfig[] = [
    { path: "/", component: () => "home" },
    { path: "/about", component: () => "about" },
    { path: "/sobre", component: () => "sobre" },
    { path: "/login", component: () => "login" },
    { path: "/dashboard", component: () => "dashboard" },
    { path: "/private", component: () => "private", guards: [() => "/login"] },
  ]

  beforeEach(() => {
    setUrl("/")
    window.location.hash = ""
    delete (globalThis as any).__SLASH_SSR__
  })

  test("guard global que bloqueia a URL inicial", async () => {
    setUrl("/dashboard")
    const router = createRouter({
      routes,
      guards: [(to) => to.path !== "/dashboard"],
    })

    expect(router.get().currentRoute?.path).not.toBe("/dashboard")
    await router.ready
    expect(router.get().currentRoute).toBeNull()
    expect(router.get().isNavigating).toBe(false)
  })

  test("guard de rota com redirect na URL inicial usa replace", async () => {
    setUrl("/private")
    const router = createRouter({ routes })
    const before = window.history.length

    await router.ready
    expect(router.get().currentRoute?.path).toBe("/login")
    expect(window.location.pathname).toBe("/login")
    expect(window.history.length).toBe(before)
  })

  test("rota inicial sem guard aplicável fica disponível sincronamente", async () => {
    setUrl("/about")
    const router = createRouter({ routes, guards: [] })

    expect(router.get().currentRoute?.path).toBe("/about")
    await router.ready
    expect(router.get().currentRoute?.path).toBe("/about")
  })

  test("guard assíncrono pendente mantém currentRoute null e isNavigating true", async () => {
    setUrl("/dashboard")
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const router = createRouter({
      routes,
      guards: [async () => { await gate }],
    })

    expect(router.get().currentRoute).toBeNull()
    expect(router.get().isNavigating).toBe(true)
    release()
    await router.ready
    expect(router.get().currentRoute?.path).toBe("/dashboard")
    expect(router.get().isNavigating).toBe(false)
  })

  test("modo hash lê a rota inicial de location.hash com query", () => {
    window.location.hash = "#/sobre?x=1"
    const router = createRouter({ routes, mode: "hash" })

    expect(router.get().currentRoute?.path).toBe("/sobre")
    expect(router.get().query).toEqual({ x: "1" })
  })

  test("SSR mantém o casamento síncrono sem rodar guards", () => {
    ;(globalThis as any).__SLASH_SSR__ = true
    try {
      const router = createRouter({
        routes,
        initialPath: "/dashboard",
        guards: [() => false],
      })
      expect(router.get().currentRoute?.path).toBe("/dashboard")
    } finally {
      delete (globalThis as any).__SLASH_SSR__
    }
  })

  test("Router montado com guard pendente renderiza vazio e depois a rota", async () => {
    setUrl("/dashboard")
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const router = createRouter({ routes, guards: [async () => { await gate }] })
    const container = document.createElement("div")
    render(html`<${Router} router=${router}/>`, container)

    expect(container.textContent).toBe("")
    release()
    await router.ready
    expect(container.textContent).toBe("dashboard")
  })

  test("push antes de ready não é sobrescrito pela navegação inicial", async () => {
    setUrl("/p2")
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const r2: RouteConfig[] = [
      { path: "/p2", component: () => "p2", guards: [async () => { await gate }] },
      { path: "/a", component: () => "a" },
    ]
    const router = createRouter({ routes: r2 })

    await router.push("/a")
    release()
    await router.ready

    expect(router.get().currentRoute?.path).toBe("/a")
    expect(window.location.pathname).toBe("/a")
  })

  test("dois push concorrentes terminam no último", async () => {
    let releaseA!: () => void
    const gateA = new Promise<void>((r) => (releaseA = r))
    const r2: RouteConfig[] = [
      { path: "/", component: () => "home" },
      { path: "/a", component: () => "a", guards: [async () => { await gateA }] },
      { path: "/b", component: () => "b" },
    ]
    const router = createRouter({ routes: r2 })

    const pa = router.push("/a")
    const pb = router.push("/b")
    releaseA()
    await Promise.all([pa, pb])

    expect(router.get().currentRoute?.path).toBe("/b")
    expect(router.get().isNavigating).toBe(false)
  })

  test("loop de redirect na URL inicial é interrompido", async () => {
    setUrl("/x")
    const errors: unknown[] = []
    const orig = console.error
    console.error = (...a: unknown[]) => { errors.push(a) }
    try {
      const router = createRouter({
        routes: [
          { path: "/x", component: () => "x", guards: [() => "/y"] },
          { path: "/y", component: () => "y", guards: [() => "/x"] },
        ],
      })
      await router.ready
      expect(router.get().currentRoute).toBeNull()
      expect(router.get().isNavigating).toBe(false)
      expect(errors.length).toBeGreaterThan(0)
    } finally {
      console.error = orig
    }
  }, 2000)

  test("initialPath bloqueado por guard no browser vira currentRoute null", async () => {
    const router = createRouter({
      routes,
      initialPath: "/dashboard",
      guards: [() => false],
    })

    // Aplicada de forma síncrona (sem flash, markup do SSR preservado)
    expect(router.get().currentRoute?.path).toBe("/dashboard")
    await router.ready
    expect(router.get().currentRoute).toBeNull()
    expect(router.get().isNavigating).toBe(false)
  })

  test("initialPath com redirect de guard segue o redirect", async () => {
    const router = createRouter({ routes, initialPath: "/private" })

    expect(router.get().currentRoute?.path).toBe("/private")
    await router.ready
    expect(router.get().currentRoute?.path).toBe("/login")
  })

  test("estado do servidor bloqueado por guard vira currentRoute null", async () => {
    const el = document.createElement("script")
    el.id = "__SLASH_STATE__"
    el.setAttribute("type", "application/json")
    el.textContent = JSON.stringify({ currentRoute: { path: "/dashboard" } })
    document.body.appendChild(el)
    try {
      const router = createRouter({ routes, guards: [() => false] })
      expect(router.get().currentRoute?.path).toBe("/dashboard")
      await router.ready
      expect(router.get().currentRoute).toBeNull()
    } finally {
      el.remove()
    }
  })

  test("estado do servidor com redirect de guard segue o redirect", async () => {
    const el = document.createElement("script")
    el.id = "__SLASH_STATE__"
    el.setAttribute("type", "application/json")
    el.textContent = JSON.stringify({ currentRoute: { path: "/private" } })
    document.body.appendChild(el)
    try {
      const router = createRouter({ routes })
      await router.ready
      expect(router.get().currentRoute?.path).toBe("/login")
    } finally {
      el.remove()
    }
  })

  test("criar o router não altera history.length", () => {
    setUrl("/about")
    const before = window.history.length
    createRouter({ routes })
    expect(window.history.length).toBe(before)
  })

  test("guard que lança na URL inicial bloqueia e resolve ready", async () => {
    setUrl("/dashboard")
    const orig = console.error
    console.error = () => {}
    try {
      const router = createRouter({
        routes,
        guards: [() => { throw new Error("boom") }],
      })
      await router.ready
      expect(router.get().currentRoute).toBeNull()
      expect(router.get().isNavigating).toBe(false)
    } finally {
      console.error = orig
    }
  })

  test("modo hash ignora a query antes do # na rota inicial", () => {
    ;(window as any).happyDOM.setURL("http://localhost/?q=1#/sobre?x=1")
    const router = createRouter({ routes, mode: "hash" })

    expect(router.get().currentRoute?.path).toBe("/sobre")
    expect(router.get().query).toEqual({ x: "1" })
  })

  test("SSR sem initialPath não resolve rota e ready já está resolvido", async () => {
    ;(globalThis as any).__SLASH_SSR__ = true
    try {
      const router = createRouter({ routes })
      expect(router.get().currentRoute).toBeNull()
      await router.ready
    } finally {
      delete (globalThis as any).__SLASH_SSR__
    }
  })

  test("modo hash: redirect de guard na URL inicial", async () => {
    ;(window as any).happyDOM.setURL("http://localhost/#/private")
    const router = createRouter({ routes, mode: "hash" })

    await router.ready
    expect(router.get().currentRoute?.path).toBe("/login")
    expect(window.location.hash).toBe("#/login")
  })

  test("popstate durante a navegação inicial pendente vence e descarta a inicial", async () => {
    setUrl("/p2")
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const r2: RouteConfig[] = [
      { path: "/p2", component: () => "p2", guards: [async () => { await gate }] },
      { path: "/a", component: () => "a" },
    ]
    const router = createRouter({ routes: r2 })

    setUrl("/a")
    window.dispatchEvent(new PopStateEvent("popstate"))
    await Promise.resolve()
    release()
    await router.ready

    expect(router.get().currentRoute?.path).toBe("/a")
    expect(router.get().isNavigating).toBe(false)
    expect(window.location.pathname).toBe("/a")
  })

  test("erro da navegação inicial superada não derruba isNavigating da mais nova", async () => {
    setUrl("/p2")
    let accesses = 0
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const bad: RouteConfig = {
      path: "/p2",
      component: () => "p2",
      get guards() {
        // 1º acesso (hasApplicableGuards) ok; 2º (computeNavigation) lança
        if (++accesses > 1) throw new Error("boom")
        return [() => {}]
      },
    }
    const orig = console.error
    console.error = () => {}
    try {
      const router = createRouter({
        routes: [bad, { path: "/a", component: () => "a", guards: [async () => { await gate }] }],
      })
      const p = router.push("/a")
      await router.ready
      expect(router.get().isNavigating).toBe(true)
      release()
      await p
      expect(router.get().currentRoute?.path).toBe("/a")
    } finally {
      console.error = orig
    }
  })

  describe("hashchange em modo hash", () => {
    const tick = () => new Promise((r) => setTimeout(r, 30))
    const fireHash = (hash: string) => {
      ;(window as any).happyDOM.setURL(`http://localhost/${hash}`)
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    }

    test("guard roda uma vez na inicial e uma vez por push", async () => {
      ;(window as any).happyDOM.setURL("http://localhost/#/about")
      let calls = 0
      const router = createRouter({ routes, mode: "hash", guards: [() => { calls++ }] })
      await router.ready
      await tick()
      expect(calls).toBe(1)

      await router.push("/sobre")
      await tick()
      expect(calls).toBe(2)
      expect(router.get().currentRoute?.path).toBe("/sobre")
      expect(router.get().isNavigating).toBe(false)
    })

    test("voltar para outra rota ainda navega", async () => {
      ;(window as any).happyDOM.setURL("http://localhost/#/about")
      let calls = 0
      const router = createRouter({ routes, mode: "hash", guards: [() => { calls++ }] })
      await router.ready
      await router.push("/sobre")
      await tick()

      fireHash("#/about")
      await tick()
      expect(router.get().currentRoute?.path).toBe("/about")
      expect(calls).toBe(3)
    })

    test("URL inicial bloqueada: evento para a mesma URL não reexecuta o guard", async () => {
      ;(window as any).happyDOM.setURL("http://localhost/#/dashboard")
      let calls = 0
      const router = createRouter({ routes, mode: "hash", guards: [() => { calls++; return false }] })
      await router.ready
      expect(router.get().currentRoute).toBeNull()

      fireHash("#/dashboard")
      await tick()
      expect(calls).toBe(1)
    })
  })
})
