/**
 * Tests for browser adapter
 */

import { describe, it, expect } from "bun:test"
import { createMockAdapter, detectInitialPath } from "./browser-adapter"

describe("createMockAdapter", () => {
  it("should create adapter with default values", () => {
    const adapter = createMockAdapter({})

    expect(adapter.isSSR()).toBe(false)
    expect(adapter.isBrowser()).toBe(true)
    expect(adapter.getCurrentLocation()).toBe("/")
    expect(adapter.getServerState()).toBeNull()
  })

  it("should create SSR adapter", () => {
    const adapter = createMockAdapter({ isSSR: true })

    expect(adapter.isSSR()).toBe(true)
  })

  it("should create non-browser adapter", () => {
    const adapter = createMockAdapter({ isBrowser: false })

    expect(adapter.isBrowser()).toBe(false)
  })

  it("should return custom location", () => {
    const adapter = createMockAdapter({ currentLocation: "/users" })

    expect(adapter.getCurrentLocation()).toBe("/users")
  })

  it("should return custom server state", () => {
    const serverState = { currentRoute: { path: "/about" } }
    const adapter = createMockAdapter({ serverState })

    expect(adapter.getServerState()).toEqual(serverState)
  })
})

describe("detectInitialPath", () => {
  it("should use configured initial path when provided", () => {
    const adapter = createMockAdapter({})
    const path = detectInitialPath(adapter, "/custom")

    expect(path).toBe("/custom")
  })

  it("should return undefined in SSR mode without configured path", () => {
    const adapter = createMockAdapter({ isSSR: true })
    const path = detectInitialPath(adapter)

    expect(path).toBeUndefined()
  })

  it("should use server state in client mode", () => {
    const adapter = createMockAdapter({
      isSSR: false,
      isBrowser: true,
      serverState: { currentRoute: { path: "/from-server" } },
    })
    const path = detectInitialPath(adapter)

    expect(path).toBe("/from-server")
  })

  it("should fallback to current location when no server state", () => {
    const adapter = createMockAdapter({
      isSSR: false,
      isBrowser: true,
      currentLocation: "/current",
      serverState: null,
    })
    const path = detectInitialPath(adapter)

    expect(path).toBe("/current")
  })

  it("should prefer configured path over server state", () => {
    const adapter = createMockAdapter({
      serverState: { currentRoute: { path: "/from-server" } },
    })
    const path = detectInitialPath(adapter, "/configured")

    expect(path).toBe("/configured")
  })

  it("should prefer server state over current location", () => {
    const adapter = createMockAdapter({
      isSSR: false,
      isBrowser: true,
      currentLocation: "/current",
      serverState: { currentRoute: { path: "/from-server" } },
    })
    const path = detectInitialPath(adapter)

    expect(path).toBe("/from-server")
  })

  it("should return undefined when not browser and no config", () => {
    const adapter = createMockAdapter({
      isSSR: false,
      isBrowser: false,
    })
    const path = detectInitialPath(adapter)

    expect(path).toBeUndefined()
  })

  it("should handle server state without currentRoute", () => {
    const adapter = createMockAdapter({
      isSSR: false,
      isBrowser: true,
      currentLocation: "/fallback",
      serverState: { someOtherData: "value" },
    })
    const path = detectInitialPath(adapter)

    expect(path).toBe("/fallback")
  })

  it("should handle server state with currentRoute but no path", () => {
    const adapter = createMockAdapter({
      isSSR: false,
      isBrowser: true,
      currentLocation: "/fallback",
      serverState: { currentRoute: { otherField: "value" } },
    })
    const path = detectInitialPath(adapter)

    expect(path).toBe("/fallback")
  })
})
