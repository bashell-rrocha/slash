import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { missingTermsVerdict, parseTerms, scanText } from "./boundary";

describe("parseTerms", () => {
  test("ignora linhas vazias e comentários, apara e baixa a caixa", () => {
    // Arrange
    const texto = "a\n\n# x\n B ";

    // Act
    const termos = parseTerms(texto);

    // Assert
    expect(termos).toEqual(["a", "b"]);
  });
});

describe("scanText", () => {
  test("acha o termo sem diferenciar maiúsculas e informa linha e número do termo", () => {
    // Arrange
    const texto = "um\nTermo-Falso aqui";

    // Act
    const achados = scanText("x.md", texto, ["termo-falso"]);

    // Assert
    expect(achados).toEqual([{ file: "x.md", line: 2, term: 1 }]);
  });

  test("linhas CRLF contam normalmente", () => {
    // Arrange
    const texto = "um\r\ndois termo-falso\r\n";

    // Act
    const achados = scanText("x.md", texto, ["termo-falso"]);

    // Assert
    expect(achados).toEqual([{ file: "x.md", line: 2, term: 1 }]);
  });

  test("não devolve achado quando nenhum termo aparece", () => {
    // Arrange
    const texto = "nada a ver";

    // Act
    const achados = scanText("x.md", texto, ["termo-falso"]);

    // Assert
    expect(achados).toEqual([]);
  });
});

describe("missingTermsVerdict", () => {
  test("PR vindo de fork não tem o segredo: pula", () => {
    // Arrange
    const env = {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_HEAD_REPO: "f/x",
      GITHUB_REPOSITORY: "o/x",
    };

    // Act
    const veredito = missingTermsVerdict(env);

    // Assert
    expect(veredito).toBe("skip");
  });

  test("sem contexto de fork: falha", () => {
    // Arrange
    const env = {};

    // Act
    const veredito = missingTermsVerdict(env);

    // Assert
    expect(veredito).toBe("fail");
  });

  test("PR do próprio repositório sem o segredo: falha", () => {
    // Arrange
    const env = {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_HEAD_REPO: "o/x",
      GITHUB_REPOSITORY: "o/x",
    };

    // Act
    const veredito = missingTermsVerdict(env);

    // Assert
    expect(veredito).toBe("fail");
  });
});

describe("processo", () => {
  const script = join(import.meta.dir, "boundary.ts");
  // Roda num repositório git vazio (ou numa pasta sem git), para o scanner não ler este próprio arquivo de teste.
  const roda = (
    env: Record<string, string>,
    args: string[] = [],
    opcoes: { git?: boolean; versionados?: Record<string, string> } = {},
  ) => {
    const repo = mkdtempSync(join(tmpdir(), "fronteira-repo-"));
    const git = (...a: string[]) =>
      Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: repo });
    if (opcoes.git !== false) git("init", "-q");
    for (const [nome, conteudo] of Object.entries(opcoes.versionados ?? {})) {
      writeFileSync(join(repo, nome), conteudo);
      git("add", nome);
    }
    if (opcoes.versionados) git("commit", "-q", "-m", "x");
    const r = Bun.spawnSync(["bun", script, ...args], {
      cwd: repo,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    });
    rmSync(repo, { recursive: true });
    return r;
  };

  test("sai com 1 e não imprime o termo achado", () => {
    // Arrange
    const dir = mkdtempSync(join(tmpdir(), "fronteira-"));
    writeFileSync(join(dir, "a.txt"), "linha 1\nvazou o Termo-Falso\n");

    // Act
    const r = roda({ BOUNDARY_TERMS: "termo-falso" }, ["--also", dir]);
    const saida = `${r.stdout}${r.stderr}`;
    rmSync(dir, { recursive: true });

    // Assert
    expect(r.exitCode).toBe(1);
    expect(saida).toContain("a.txt:2: termo #1");
    expect(saida.toLowerCase()).not.toContain("termo-falso");
  });

  test("arquivo versionado com o termo: sai com 1 e aponta arquivo:linha", () => {
    // Arrange
    const versionados = { "a.md": "ok\nvazou termo-falso aqui\n" };

    // Act
    const r = roda({ BOUNDARY_TERMS: "termo-falso" }, [], { versionados });
    const saida = `${r.stdout}${r.stderr}`;

    // Assert
    expect(r.exitCode).toBe(1);
    expect(saida).toContain("a.md:2: termo #1");
    expect(saida).not.toContain("termo-falso");
  });

  test("nome de arquivo com o termo não vaza no log", () => {
    // Arrange
    const versionados = { "zz-termo-falso.md": "termo-falso\n" };

    // Act
    const r = roda({ BOUNDARY_TERMS: "termo-falso" }, [], { versionados });
    const saida = `${r.stdout}${r.stderr}`;

    // Assert
    expect(r.exitCode).toBe(1);
    expect(saida).toContain("arquivo #1:1: termo #1");
    expect(saida).not.toContain("termo-falso");
  });

  test("nome de arquivo com o termo e conteúdo limpo também é achado, mascarado", () => {
    // Arrange
    const versionados = { "termo-falso.md": "conteúdo limpo\n" };

    // Act
    const r = roda({ BOUNDARY_TERMS: "termo-falso" }, [], { versionados });
    const saida = `${r.stdout}${r.stderr}`;

    // Assert
    expect(r.exitCode).toBe(1);
    expect(saida).toContain("arquivo #1: termo #1");
    expect(saida).not.toContain("termo-falso");
  });

  test("fora de um repositório git: erro claro e sai com 1", () => {
    // Arrange
    const opcoes = { git: false };

    // Act
    const r = roda({ BOUNDARY_TERMS: "termo-falso" }, [], opcoes);

    // Assert
    expect(r.exitCode).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("git ls-files");
  });

  test("sai com 0 quando a pasta extra está limpa e ignora binários", () => {
    // Arrange
    const dir = mkdtempSync(join(tmpdir(), "fronteira-"));
    writeFileSync(join(dir, "ok.txt"), "tudo certo\n");
    writeFileSync(join(dir, "b.bin"), Buffer.from([0, 1, 2, ...Buffer.from("termo-falso")]));

    // Act
    const r = roda({ BOUNDARY_TERMS: "termo-falso" }, ["--also", dir]);
    rmSync(dir, { recursive: true });

    // Assert
    expect(r.exitCode).toBe(0);
  });

  test("--also inexistente com o termo no nome não vaza no log", () => {
    // Arrange
    const dir = join(tmpdir(), "fronteira-termo-falso-nao-existe");

    // Act
    const r = roda({ BOUNDARY_TERMS: "termo-falso" }, ["--also", dir]);
    const saida = `${r.stdout}${r.stderr}`;

    // Assert
    expect(r.exitCode).toBe(1);
    expect(saida).toContain("pasta --also inexistente: (nome oculto)");
    expect(saida).not.toContain("termo-falso");
  });

  test("--also com pasta inexistente falha e avisa", () => {
    // Arrange
    const dir = join(tmpdir(), "fronteira-nao-existe-xyz");

    // Act
    const r = roda({ BOUNDARY_TERMS: "termo-falso" }, ["--also", dir]);

    // Assert
    expect(r.exitCode).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("pasta --also inexistente");
  });

  test("sem BOUNDARY_TERMS sai com 1 e avisa", () => {
    // Arrange
    const env = {};

    // Act
    const r = roda(env);

    // Assert
    expect(r.exitCode).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("BOUNDARY_TERMS ausente");
  });

  test("PR de fork sem o segredo avisa e sai com 0", () => {
    // Arrange
    const env = {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_HEAD_REPO: "f/x",
      GITHUB_REPOSITORY: "o/x",
    };

    // Act
    const r = roda(env);

    // Assert
    expect(r.exitCode).toBe(0);
  });
});
