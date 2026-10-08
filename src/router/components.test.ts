/**
 * Components tests
 */

import { beforeEach, describe, expect, test } from "bun:test"
import { html, render } from "../core"
import { setHydrateContext } from "../hydration/context"
import { Router, Link } from "./components"
import { createRouter } from "./router"
import type { RouteConfig } from "./types"

// Mock routes for testing
const mockRoutes: RouteConfig[] = [
  { path: "/", component: () => "home-component" },
  { path: "/about", component: () => "about-component" },
  { path: "/users/:id", component: (state) => `user-${state.params.id}` },
]

describe("Router component", () => {
  test("should create Router reactive", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes, initialPath: "/" })

    // Act
    const routerComponent = Router({ router })

    // Assert
    expect(routerComponent).toBeDefined()
    expect(routerComponent.get).toBeDefined()
    expect(routerComponent.subscribe).toBeDefined()
  })

  test("should render current route component", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes, initialPath: "/" })
    const routerComponent = Router({ router })

    // Act
    const result = routerComponent.get()

    // Assert
    expect(result).toBe("home-component")
  })

  test("should return null when no route matched", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes, initialPath: "/nonexistent" })
    const routerComponent = Router({ router })

    // Act
    const result = routerComponent.get()

    // Assert
    expect(result).toBeNull()
  })

  test("should update when route changes", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes, initialPath: "/" })
    const routerComponent = Router({ router })

    let updateCount = 0
    let lastValue: any = null

    routerComponent.subscribe((value) => {
      updateCount++
      lastValue = value
    })

    // Act
    await router.push("/about")

    // Assert
    expect(updateCount).toBeGreaterThan(0)
    expect(lastValue).toBe("about-component")
  })

  test("should render component with params", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes, initialPath: "/users/123" })
    const routerComponent = Router({ router })

    // Act
    const result = routerComponent.get()

    // Assert
    expect(result).toBe("user-123")
  })
})

describe("Link component", () => {
  test("should create link element", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes, initialPath: "/" })

    // Act
    const link = Link({ to: "/about", router, children: "About" })

    // Assert
    expect(link).toBeDefined()
    expect(link.nodeName).toBe("A")
  })

  test("should have correct href", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes, initialPath: "/" })

    // Act
    const link = Link({ to: "/about", router }) as HTMLAnchorElement

    // Assert
    expect(link.href).toContain("/about")
  })

  test("should navigate on click", async () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes, initialPath: "/" })
    const link = Link({ to: "/about", router }) as HTMLAnchorElement

    const mockEvent = {
      preventDefault: () => {},
    } as Event

    // Act
    link.click()

    // Wait for navigation
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Assert
    const state = router.get()
    expect(state.currentRoute?.path).toBe("/about")
  })

  test("should pass through additional props", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes, initialPath: "/" })

    // Act
    const link = Link({
      to: "/about",
      router,
      className: "nav-link",
      id: "about-link",
    }) as HTMLAnchorElement

    // Assert
    expect(link.className).toBe("nav-link")
    expect(link.id).toBe("about-link")
  })

  test("should render children", () => {
    // Arrange
    const router = createRouter({ routes: mockRoutes, initialPath: "/" })

    // Act
    const link = Link({ to: "/about", router, children: "Click me" }) as HTMLAnchorElement

    // Assert
    expect(link.textContent).toBe("Click me")
  })
})

describe("Router como componente", () => {
  // Outros testes podem deixar um contexto de hidratação global ativo
  beforeEach(() => setHydrateContext(null))

  test("<Router/> como componente troca de rota e atualiza a URL", async () => {
    // Arrange
    ;(window as any).happyDOM.setURL("http://localhost/")
    const router = createRouter({ routes: [
      { path: "/", component: () => html`<h1>home</h1>` },
      { path: "/about", component: () => html`<h1>about</h1>` },
    ], initialPath: "/" })
    const el = document.createElement("div")
    render(html`<${Router} router=${router}/>` as any, el)
    expect(el.innerHTML).toContain("home")

    // Act
    await router.push("/about")

    // Assert
    expect(el.innerHTML).toContain("about")
    expect(el.innerHTML).not.toContain("home")
    expect(window.location.pathname).toBe("/about")
  })
})
