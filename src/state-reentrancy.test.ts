import { describe, test, expect } from 'bun:test'
import { createState } from './state'
import { batch } from './batch'

describe('set reentrante em watcher: o último valor vence', () => {
  test('watcher posterior não recebe valor velho depois do novo', () => {
    const s = createState({ primary: false, cls: 'a' })
    const seen: string[] = []
    s.watch((v) => { if (v.primary && v.cls !== 'b') s.set({ ...v, cls: 'b' }) })
    s.watch((v) => seen.push(v.cls))
    s.set({ primary: true, cls: 'a' })
    expect(seen).toEqual(['b'])
    expect(s.get().cls).toBe('b')
  })

  test('watcher anterior ao que faz o set recebe velho e depois novo', () => {
    const s = createState({ n: 0 })
    const seen: number[] = []
    s.watch((v) => seen.push(v.n))
    s.watch((v) => { if (v.n === 1) s.set({ n: 2 }) })
    s.set({ n: 1 })
    expect(seen).toEqual([1, 2])
    expect(seen[seen.length - 1]).toBe(s.get().n)
  })

  test('cadeia reentrante estabiliza e todos terminam no valor final', () => {
    const s = createState({ n: 0 })
    const a: number[] = []
    const b: number[] = []
    s.watch((v) => { if (v.n < 3) s.set({ n: v.n + 1 }) })
    s.watch((v) => a.push(v.n))
    s.watch((v) => b.push(v.n))
    s.set({ n: 1 })
    expect(s.get().n).toBe(3)
    expect(a[a.length - 1]).toBe(3)
    expect(b[b.length - 1]).toBe(3)
    expect(a).toEqual([3])
  })

  test('reentrância durante o flush de batch', () => {
    const s = createState({ n: 0 })
    const seen: number[] = []
    s.watch((v) => { if (v.n === 1) s.set({ n: 2 }) })
    s.watch((v) => seen.push(v.n))
    batch(() => { s.set({ n: 1 }) })
    expect(seen).toEqual([2])
    expect(s.get().n).toBe(2)
  })

  test('erro na notificação aninhada chega a quem chamou; demais terminam no valor final', () => {
    const s = createState({ n: 0 })
    const seen: number[] = []
    let caught: unknown
    s.watch((v) => {
      if (v.n === 1) {
        try { s.set({ n: 2 }) } catch (e) { caught = e }
      }
    })
    s.watch((v) => { if (v.n === 2) throw new Error('boom') })
    s.watch((v) => seen.push(v.n))
    s.set({ n: 1 })
    expect((caught as Error).message).toBe('boom')
    expect(seen[seen.length - 1]).toBe(2)
  })

  test('watcher removido durante a notificação não recebe valor depois', () => {
    const s = createState({ n: 0 })
    const seen: number[] = []
    let unwatchLate: () => void = () => {}
    s.watch(() => unwatchLate())
    unwatchLate = s.watch((v) => seen.push(v.n))
    s.set({ n: 1 })
    expect(seen).toEqual([])
  })

  test('erro na notificação aninhada sem catch sobe pelo set mais externo', () => {
    const s = createState({ n: 0 })
    const a: number[] = []
    const b: number[] = []
    s.watch((v) => { if (v.n === 1) s.set({ n: 2 }) })
    s.watch((v) => { if (v.n === 2) throw new Error('boom') })
    s.watch((v) => a.push(v.n))
    s.watch((v) => b.push(v.n))
    expect(() => s.set({ n: 1 })).toThrow('boom')
    expect(s.get().n).toBe(2)
    expect(a).toEqual([2])
    expect(b).toEqual([2])
  })

  test('batch() reentrante no mesmo estado durante a notificação', () => {
    const s = createState({ n: 0 })
    const seen: number[] = []
    s.watch((v) => { if (v.n === 1) batch(() => s.set({ n: 2 })) })
    s.watch((v) => seen.push(v.n))
    s.set({ n: 1 })
    expect(seen).toEqual([2])
    expect(seen[seen.length - 1]).toBe(s.get().n)
  })
})
