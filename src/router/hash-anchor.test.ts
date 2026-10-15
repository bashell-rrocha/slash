import { describe, expect, it } from "bun:test";
import { createHashMode } from "./history";

// Modo hash (app aberto de file://, Capacitor/Tauri): só hash que começa com "/" é rota. `#ancora` (link para um
// campo, o topo da página) continua âncora nativa e não troca a tela.

const setHash = (hash: string) => {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

describe("createHashMode: âncora × rota", () => {
  it("hash com / avisa a rota; #ancora não avisa e a rota atual continua", () => {
    // Arrange
    const history = createHashMode();
    const seen: string[] = [];
    const stop = history.listen((path) => seen.push(path));

    // Act
    setHash("#/app/novo/");
    setHash("#novo-titulo");
    const location = history.location();
    stop();

    // Assert
    expect(seen).toEqual(["/app/novo/"]);
    expect(location).toBe("/app/novo/");
  });
});
