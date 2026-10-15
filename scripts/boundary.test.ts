import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { missingTermsVerdict, parseTerms, scanText } from "./boundary";

const SCRIPT = resolve(import.meta.dir, "boundary.ts");

describe("parseTerms", () => {
  test("uma entrada por linha, sem linhas em branco nem comentários", () => {
    // Arrange
    const text = "# comentário\ntermo-falso\n\n  outro-falso  \r\n#termo-ignorado\n";

    // Act
    const terms = parseTerms(text);

    // Assert
    expect(terms).toEqual(["termo-falso", "outro-falso"]);
  });

  test("texto vazio não gera termos", () => {
    // Arrange
    const text = "\n  \n# só comentário\n";

    // Act
    const terms = parseTerms(text);

    // Assert
    expect(terms).toEqual([]);
  });
});

describe("scanText", () => {
  test("acha o termo ignorando maiúsculas e informa arquivo, linha e índice (base 1)", () => {
    // Arrange
    const text = "linha limpa\nfala do TERMO-falso aqui\nlimpa";

    // Act
    const findings = scanText("a.md", text, ["outro-falso", "termo-falso"]);

    // Assert
    expect(findings).toEqual([{ file: "a.md", line: 2, term: 2 }]);
  });

  test("termos diferentes na mesma linha geram um achado cada", () => {
    // Arrange
    const text = "termo-falso e outro-falso";

    // Act
    const findings = scanText("b.ts", text, ["termo-falso", "outro-falso"]);

    // Assert
    expect(findings).toEqual([
      { file: "b.ts", line: 1, term: 1 },
      { file: "b.ts", line: 1, term: 2 },
    ]);
  });

  test("linhas CRLF contam normalmente", () => {
    // Arrange
    const text = "um\r\ntermo-falso\r\n";

    // Act
    const findings = scanText("c.txt", text, ["termo-falso"]);

    // Assert
    expect(findings).toEqual([{ file: "c.txt", line: 2, term: 1 }]);
  });

  test("sem achados devolve lista vazia", () => {
    // Arrange
    const text = "nada a ver";

    // Act
    const findings = scanText("d.txt", text, ["termo-falso"]);

    // Assert
    expect(findings).toEqual([]);
  });
});

describe("missingTermsVerdict", () => {
  test("PR vindo de fork não tem o segredo: pula", () => {
    // Arrange
    const env = {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_HEAD_REPO: "fork/repo",
      GITHUB_REPOSITORY: "dono/repo",
    };

    // Act
    const verdict = missingTermsVerdict(env);

    // Assert
    expect(verdict).toBe("skip");
  });

  test("PR do próprio repositório sem o segredo: falha", () => {
    // Arrange
    const env = {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_HEAD_REPO: "dono/repo",
      GITHUB_REPOSITORY: "dono/repo",
    };

    // Act
    const verdict = missingTermsVerdict(env);

    // Assert
    expect(verdict).toBe("fail");
  });

  test("push sem o segredo: falha", () => {
    // Arrange
    const env = { GITHUB_EVENT_NAME: "push", GITHUB_REPOSITORY: "dono/repo" };

    // Act
    const verdict = missingTermsVerdict(env);

    // Assert
    expect(verdict).toBe("fail");
  });

  test("fora do CI: falha", () => {
    // Arrange
    const env = {};

    // Act
    const verdict = missingTermsVerdict(env);

    // Assert
    expect(verdict).toBe("fail");
  });
});

function repo(files: Record<string, string | Uint8Array>): string {
  const dir = mkdtempSync(join(tmpdir(), "boundary-"));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name.split("/").slice(0, -1).join("/") || "."), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
  Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
  return dir;
}

function run(cwd: string, env: Record<string, string>, args: string[] = []) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args], {
    cwd,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
  });
  return {
    code: proc.exitCode,
    out: proc.stdout.toString(),
    err: proc.stderr.toString(),
  };
}

describe("processo", () => {
  test("achado: sai com 1, aponta arquivo:linha e nunca imprime o termo", () => {
    // Arrange
    const dir = repo({ "docs/a.md": "ok\nfala de TERMO-falso\n", "b.md": "limpo" });

    // Act
    const r = run(dir, { BOUNDARY_TERMS: "# lista\ntermo-falso\n" });

    // Assert
    expect(r.code).toBe(1);
    expect(r.out + r.err).toContain("docs/a.md:2: termo #1");
    expect((r.out + r.err).toLowerCase()).not.toContain("termo-falso");
  });

  test("sem achados: sai com 0", () => {
    // Arrange
    const dir = repo({ "a.md": "limpo" });

    // Act
    const r = run(dir, { BOUNDARY_TERMS: "termo-falso" });

    // Assert
    expect(r.code).toBe(0);
  });

  test("arquivo binário é ignorado", () => {
    // Arrange
    const bin = new Uint8Array([0, 1, 2, ...new TextEncoder().encode("termo-falso")]);
    const dir = repo({ "img.bin": bin });

    // Act
    const r = run(dir, { BOUNDARY_TERMS: "termo-falso" });

    // Assert
    expect(r.code).toBe(0);
  });

  test("--also varre diretórios fora do git (dist)", () => {
    // Arrange
    const dir = repo({ "a.md": "limpo" });
    mkdirSync(join(dir, "dist/sub"), { recursive: true });
    writeFileSync(join(dir, "dist/sub/x.js"), "const s = 'termo-falso';");

    // Act
    const r = run(dir, { BOUNDARY_TERMS: "termo-falso" }, ["--also", "dist"]);

    // Assert
    expect(r.code).toBe(1);
    expect(r.out + r.err).toContain("dist/sub/x.js:1: termo #1");
    expect((r.out + r.err).toLowerCase()).not.toContain("termo-falso");
  });

  test("sem BOUNDARY_TERMS fora do CI: avisa e sai com 1", () => {
    // Arrange
    const dir = repo({ "a.md": "limpo" });

    // Act
    const r = run(dir, {});

    // Assert
    expect(r.code).toBe(1);
    expect(r.out + r.err).toContain("BOUNDARY_TERMS ausente");
  });

  test("sem BOUNDARY_TERMS em PR de fork: aviso e sai com 0", () => {
    // Arrange
    const dir = repo({ "a.md": "limpo" });

    // Act
    const r = run(dir, {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_HEAD_REPO: "fork/repo",
      GITHUB_REPOSITORY: "dono/repo",
    });

    // Assert
    expect(r.code).toBe(0);
    expect(r.out + r.err).toContain("BOUNDARY_TERMS ausente");
  });
});
