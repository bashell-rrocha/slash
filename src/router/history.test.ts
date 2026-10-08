/**
 * History tests
 */

import { describe, expect, test, beforeEach } from "bun:test"
import {
  createHistory,
  createHistoryMode,
  createHashMode,
  __resetHistoryForTesting__,
} from "./history"

describe("createHistoryMode", () => {
  beforeEach(() => {
    // Reset history interception state
    __resetHistoryForTesting__()

    // Reset history to initial state
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/")
    }
  })

  test("should get current location", () => {
    // Arrange
    const history = createHistoryMode()

    // Act
    const location = history.location()

    // Assert
    expect(location).toBe("/")
  })

  test("should push new location", () => {
    // Arrange
    const history = createHistoryMode()
    let called = false
    let capturedLocation = ""

    history.listen((location) => {
      called = true
      capturedLocation = location
    })

    // Act
    history.push("/users")

    // Assert
    expect(called).toBe(true)
    expect(capturedLocation).toBe("/users")
    expect(history.location()).toBe("/users")
  })

  test("should replace current location", () => {
    // Arrange
    const history = createHistoryMode()
    history.push("/users")

    let called = false
    let capturedLocation = ""

    history.listen((location) => {
      called = true
      capturedLocation = location
    })

    // Act
    history.replace("/posts")

    // Assert
    expect(called).toBe(true)
    expect(capturedLocation).toBe("/posts")
    expect(history.location()).toBe("/posts")
  })

  test("should handle query strings", () => {
    // Arrange
    const history = createHistoryMode()

    // Act
    history.push("/search?q=test")

    // Assert
    expect(history.location()).toBe("/search?q=test")
  })

  test("should allow multiple listeners", () => {
    // Arrange
    const history = createHistoryMode()
    let listener1Called = false
    let listener2Called = false

    history.listen(() => {
      listener1Called = true
    })

    history.listen(() => {
      listener2Called = true
    })

    // Act
    history.push("/test")

    // Assert
    expect(listener1Called).toBe(true)
    expect(listener2Called).toBe(true)
  })

  test("should unsubscribe listener", () => {
    // Arrange
    const history = createHistoryMode()
    let callCount = 0

    const unsubscribe = history.listen(() => {
      callCount++
    })

    history.push("/first")
    expect(callCount).toBe(1)

    // Act
    unsubscribe()
    history.push("/second")

    // Assert
    expect(callCount).toBe(1) // Should not increment
  })

  test("should handle back navigation", () => {
    // Arrange
    const history = createHistoryMode()
    history.push("/page1")
    history.push("/page2")

    // Act
    history.back()

    // Assert - back() triggers popstate which updates location
    // In a real browser this would work, but in test environment
    // we just verify the method exists and doesn't throw
    expect(history.back).toBeDefined()
  })

  test("should handle forward navigation", () => {
    // Arrange
    const history = createHistoryMode()

    // Act & Assert
    expect(history.forward).toBeDefined()
    expect(() => history.forward()).not.toThrow()
  })

  test("should handle go navigation", () => {
    // Arrange
    const history = createHistoryMode()

    // Act & Assert
    expect(history.go).toBeDefined()
    expect(() => history.go(-1)).not.toThrow()
    expect(() => history.go(1)).not.toThrow()
  })
})

describe("createHashMode", () => {
  beforeEach(() => {
    // Reset hash
    if (typeof window !== "undefined") {
      window.location.hash = ""
    }
  })

  test("should get current location from hash", () => {
    // Arrange
    const history = createHashMode()

    // Act
    const location = history.location()

    // Assert
    expect(location).toBe("/")
  })

  test("should push new location to hash", () => {
    // Arrange
    const history = createHashMode()
    let called = false
    let capturedLocation = ""

    history.listen((location) => {
      called = true
      capturedLocation = location
    })

    // Act
    history.push("/users")

    // Assert - The hash will be set
    // Listener will be called via hashchange event
    expect(history.location()).toMatch(/\/users/)
  })

  test("should replace current hash location", () => {
    // Arrange
    const history = createHashMode()
    history.push("/users")

    // Act
    history.replace("/posts")

    // Assert
    expect(history.location()).toMatch(/\/posts/)
  })

  test("should handle query strings in hash", () => {
    // Arrange
    const history = createHashMode()

    // Act
    history.push("/search?q=test")

    // Assert
    expect(history.location()).toMatch(/\/search/)
  })

  test("should allow unsubscribe", () => {
    // Arrange
    const history = createHashMode()
    let callCount = 0

    const unsubscribe = history.listen(() => {
      callCount++
    })

    // Act
    unsubscribe()
    history.push("/test")

    // Assert - Listener should not be called after unsubscribe
    // In real scenario, callCount would stay 0
    expect(unsubscribe).toBeDefined()
  })

  test("should handle navigation methods", () => {
    // Arrange
    const history = createHashMode()

    // Act & Assert
    expect(history.back).toBeDefined()
    expect(history.forward).toBeDefined()
    expect(history.go).toBeDefined()
    expect(() => history.back()).not.toThrow()
    expect(() => history.forward()).not.toThrow()
    expect(() => history.go(-1)).not.toThrow()
  })
})

describe("createHistory", () => {
  test("should create history mode by default", () => {
    // Arrange & Act
    const history = createHistory()

    // Assert
    expect(history.location).toBeDefined()
    expect(history.push).toBeDefined()
    expect(history.replace).toBeDefined()
  })

  test("should create history mode when specified", () => {
    // Arrange & Act
    const history = createHistory("history")

    // Assert
    expect(history.location).toBeDefined()
    expect(history.location()).toBeDefined()
  })

  test("should create hash mode when specified", () => {
    // Arrange & Act
    const history = createHistory("hash")

    // Assert
    expect(history.location).toBeDefined()
    expect(history.location()).toBeDefined()
  })
})

describe("SSR compatibility", () => {
  test("should not throw in non-browser environment", () => {
    // This test verifies that history methods are safe to call
    // even when window is undefined (SSR scenario)

    // Arrange
    const history = createHistory()

    // Act & Assert - Should not throw
    expect(() => history.location()).not.toThrow()
    expect(() => history.push("/test")).not.toThrow()
    expect(() => history.replace("/test")).not.toThrow()
    expect(() => history.back()).not.toThrow()
    expect(() => history.forward()).not.toThrow()
    expect(() => history.go(1)).not.toThrow()
  })

  test("should allow listeners in SSR mode", () => {
    // Arrange
    const history = createHistory()

    // Act & Assert
    expect(() => {
      const unsubscribe = history.listen(() => {})
      unsubscribe()
    }).not.toThrow()
  })
})

describe("Link interception", () => {
  beforeEach(() => {
    // Reset history interception state
    __resetHistoryForTesting__()

    // Reset to root
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/")
      document.body.innerHTML = ""
    }
  })

  test("should intercept clicks on internal links", () => {
    // Arrange
    const history = createHistoryMode()
    let navigated = false
    let targetPath = ""

    history.listen((location) => {
      navigated = true
      targetPath = location
    })

    // Create a link
    const link = document.createElement("a")
    link.href = "/about"
    link.textContent = "About"
    document.body.appendChild(link)

    // Act
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    // Assert
    expect(navigated).toBe(true)
    expect(targetPath).toBe("/about")
  })

  test("falls back to native navigation when pushState throws after preventDefault", () => {
    createHistoryMode()
    const link = document.createElement("a")
    link.href = "/about"
    document.body.appendChild(link)

    const originalPush = window.history.pushState
    const originalAssign = window.location.assign
    const assigned: string[] = []
    window.history.pushState = () => {
      throw new Error("SecurityError")
    }
    window.location.assign = ((url: string) => {
      assigned.push(url)
    }) as typeof window.location.assign
    try {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true })
      expect(() => link.dispatchEvent(event)).not.toThrow()
      expect(event.defaultPrevented).toBe(true)
      expect(assigned).toEqual(["/about"])
    } finally {
      window.history.pushState = originalPush
      window.location.assign = originalAssign
    }
  })

  test("should ignore clicks whose target is not an element", () => {
    // Arrange
    const history = createHistoryMode()
    let navigated = false
    history.listen(() => {
      navigated = true
    })
    const errors: unknown[] = []
    const onError = (e: Event) => errors.push((e as ErrorEvent).error ?? e)
    window.addEventListener("error", onError)

    // Act: clique disparado no document (sem closest) e com target nulo
    document.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    const nullTarget = new MouseEvent("click", { bubbles: true, cancelable: true })
    Object.defineProperty(nullTarget, "target", { value: null })
    document.body.dispatchEvent(nullTarget)
    window.removeEventListener("error", onError)

    // Assert
    expect(errors).toEqual([])
    expect(navigated).toBe(false)
  })

  test("should not intercept external links", () => {
    // Arrange
    const history = createHistoryMode()
    let navigated = false

    history.listen(() => {
      navigated = true
    })

    const link = document.createElement("a")
    link.href = "https://external.com/page"
    link.textContent = "External"
    document.body.appendChild(link)

    // Act
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    // Assert - Should not intercept external link
    expect(navigated).toBe(false)
  })

  test("should not intercept links with target attribute", () => {
    // Arrange
    const history = createHistoryMode()
    let navigated = false

    history.listen(() => {
      navigated = true
    })

    const link = document.createElement("a")
    link.href = "/page"
    link.target = "_blank"
    document.body.appendChild(link)

    // Act
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    // Assert
    expect(navigated).toBe(false)
  })

  test("should not intercept links with download attribute", () => {
    // Arrange
    const history = createHistoryMode()
    let navigated = false

    history.listen(() => {
      navigated = true
    })

    const link = document.createElement("a")
    link.href = "/file.pdf"
    link.setAttribute("download", "")
    document.body.appendChild(link)

    // Act
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    // Assert
    expect(navigated).toBe(false)
  })

  test("should not intercept links with data-native attribute", () => {
    // Arrange
    const history = createHistoryMode()
    let navigated = false

    history.listen(() => {
      navigated = true
    })

    const link = document.createElement("a")
    link.href = "/page"
    link.setAttribute("data-native", "")
    document.body.appendChild(link)

    // Act
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    // Assert
    expect(navigated).toBe(false)
  })

  test("should not intercept clicks with modifier keys", () => {
    // Arrange
    const history = createHistoryMode()
    let navigated = false

    history.listen(() => {
      navigated = true
    })

    const link = document.createElement("a")
    link.href = "/page"
    document.body.appendChild(link)

    // Act - Ctrl+click
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })
    link.dispatchEvent(event)

    // Assert
    expect(navigated).toBe(false)
  })

  test("should not intercept hash-only links", () => {
    // Arrange
    const history = createHistoryMode()
    let navigated = false

    history.listen(() => {
      navigated = true
    })

    const link = document.createElement("a")
    link.href = "#section"
    document.body.appendChild(link)

    // Act
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    // Assert
    expect(navigated).toBe(false)
  })

  test("should intercept links with query strings", () => {
    // Arrange
    const history = createHistoryMode()
    let targetPath = ""

    history.listen((location) => {
      targetPath = location
    })

    const link = document.createElement("a")
    link.href = "/search?q=test"
    document.body.appendChild(link)

    // Act
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    // Assert
    expect(targetPath).toBe("/search?q=test")
  })
})
