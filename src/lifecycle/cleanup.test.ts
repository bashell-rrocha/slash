import { describe, it, expect, mock } from "bun:test";
import { addCleanup, destroyNode, hasCleanups } from "./cleanup";

describe("lifecycle/cleanup", () => {
  describe("addCleanup", () => {
    it("adiciona cleanup ao nó", () => {
      const node = document.createElement("div");
      const cleanup = mock(() => {});

      addCleanup(node, cleanup);

      expect(hasCleanups(node)).toBe(true);
    });

    it("adiciona múltiplos cleanups ao mesmo nó", () => {
      const node = document.createElement("div");
      const cleanup1 = mock(() => {});
      const cleanup2 = mock(() => {});

      addCleanup(node, cleanup1);
      addCleanup(node, cleanup2);

      expect(hasCleanups(node)).toBe(true);
    });
  });

  describe("destroyNode", () => {
    it("executa todos os cleanups do nó", () => {
      const node = document.createElement("div");
      const cleanup1 = mock(() => {});
      const cleanup2 = mock(() => {});

      addCleanup(node, cleanup1);
      addCleanup(node, cleanup2);

      destroyNode(node);

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(hasCleanups(node)).toBe(false);
    });

    it("executa cleanups dos children recursivamente", () => {
      const parent = document.createElement("div");
      const child1 = document.createElement("span");
      const child2 = document.createElement("span");

      parent.appendChild(child1);
      parent.appendChild(child2);

      const parentCleanup = mock(() => {});
      const child1Cleanup = mock(() => {});
      const child2Cleanup = mock(() => {});

      addCleanup(parent, parentCleanup);
      addCleanup(child1, child1Cleanup);
      addCleanup(child2, child2Cleanup);

      destroyNode(parent);

      expect(parentCleanup).toHaveBeenCalledTimes(1);
      expect(child1Cleanup).toHaveBeenCalledTimes(1);
      expect(child2Cleanup).toHaveBeenCalledTimes(1);
    });

    it("não falha se cleanup lançar erro", () => {
      const node = document.createElement("div");
      const badCleanup = mock(() => {
        throw new Error("cleanup failed");
      });
      const goodCleanup = mock(() => {});

      addCleanup(node, badCleanup);
      addCleanup(node, goodCleanup);

      expect(() => destroyNode(node)).not.toThrow();
      expect(badCleanup).toHaveBeenCalledTimes(1);
      expect(goodCleanup).toHaveBeenCalledTimes(1);
    });

    it("não falha para nó sem cleanups", () => {
      const node = document.createElement("div");
      expect(() => destroyNode(node)).not.toThrow();
    });
  });

  describe("hasCleanups", () => {
    it("retorna false para nó sem cleanups", () => {
      const node = document.createElement("div");
      expect(hasCleanups(node)).toBe(false);
    });

    it("retorna true para nó com cleanups", () => {
      const node = document.createElement("div");
      addCleanup(node, () => {});
      expect(hasCleanups(node)).toBe(true);
    });

    it("retorna false após destroyNode", () => {
      const node = document.createElement("div");
      addCleanup(node, () => {});
      destroyNode(node);
      expect(hasCleanups(node)).toBe(false);
    });
  });
});
