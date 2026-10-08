import { describe, test, expect } from 'bun:test'
import { createState } from './state'

describe('createState', () => {
  test('should create state with initial value', () => {
    const state = createState({ count: 0 })
    expect(state.get()).toEqual({ count: 0 })
  })

  test('should update state synchronously', () => {
    const state = createState({ count: 0 })
    state.set({ count: 5 })
    expect(state.get()).toEqual({ count: 5 }) // SÍNCRONO ✅
  })

  test('should notify watchers synchronously', () => {
    const state = createState({ count: 0 })
    let notified: number | undefined

    state.watch(s => { notified = s.count })
    state.set({ count: 10 })

    expect(notified).toBe(10) // SÍNCRONO ✅
  })

  test('should call watchers when state changes', () => {
    const state = createState({ count: 0 })
    let callCount = 0

    state.watch(() => { callCount++ })

    state.set({ count: 1 })
    expect(callCount).toBe(1)

    state.set({ count: 2 })
    expect(callCount).toBe(2)
  })
})


