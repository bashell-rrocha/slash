import { describe, expect, it } from "bun:test";
import { html } from "./hyper";
import { createState } from "./state";
import type { Reactive } from "./types";

// createState satisfaz Reactive: subscribe é o mesmo que watch (atributo reativo sem adaptador).

describe("createState é Reactive", () => {
  it("subscribe recebe o valor novo depois de set", () => {
    // Arrange
    const state = createState(1);
    const reactive: Reactive<number> = state;
    const seen: number[] = [];

    // Act
    const stop = reactive.subscribe((v) => seen.push(v));
    state.set(2);
    stop();
    state.set(3);

    // Assert
    expect(seen).toEqual([2]);
  });

  it("no cliente, State em atributo atualiza sem adaptador", () => {
    // Arrange
    const title = createState("a");
    const p = html`<p title=${title}>x</p>` as unknown as HTMLElement;

    // Act
    title.set("b");

    // Assert
    expect(p.getAttribute("title")).toBe("b");
  });
});
