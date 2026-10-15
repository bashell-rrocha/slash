/**
 * Fronteira público/privado: falha se algum termo de BOUNDARY_TERMS (um por linha, `#` comenta, sem diferenciar
 * maiúsculas) aparecer no conteúdo dos arquivos versionados ou das pastas `--also`. O termo nunca é impresso:
 * a saída traz só `<arquivo>:<linha>: termo #<n>`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Finding = { file: string; line: number; term: number };

export function parseTerms(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

export function scanText(file: string, text: string, terms: string[]): Finding[] {
  const found: Finding[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.toLowerCase();
    terms.forEach((t, n) => {
      if (line.includes(t)) found.push({ file, line: i + 1, term: n + 1 });
    });
  });
  return found;
}

export function missingTermsVerdict(env: Record<string, string | undefined>): "skip" | "fail" {
  const fork =
    env.GITHUB_EVENT_NAME === "pull_request" &&
    !!env.GITHUB_HEAD_REPO &&
    env.GITHUB_HEAD_REPO !== env.GITHUB_REPOSITORY;
  return fork ? "skip" : "fail";
}

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === ".git") return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function trackedFiles(): string[] | null {
  const r = Bun.spawnSync(["git", "ls-files", "-z"]);
  if (r.exitCode !== 0) return null;
  return r.stdout.toString().split("\0").filter(Boolean);
}

/** O nome do arquivo também pode conter um termo: nesse caso o log mostra só a posição na lista. */
function label(file: string, index: number, terms: string[]): string {
  return scanText(file, file, terms).length > 0 ? `arquivo #${index + 1}` : file;
}

/** Nome (de pasta) que contém um termo nunca vai ao log. */
function maskName(name: string, terms: string[]): string {
  return scanText(name, name, terms).length > 0 ? "(nome oculto)" : name;
}

function alsoDirs(argv: string[]): string[] {
  return argv.flatMap((a, i) => (a === "--also" && argv[i + 1] ? [argv[i + 1] as string] : []));
}

export function main(argv: string[], env: Record<string, string | undefined>): number {
  const raw = env.BOUNDARY_TERMS;
  if (raw === undefined || parseTerms(raw).length === 0) {
    if (missingTermsVerdict(env) === "skip") {
      console.log(
        "::warning::BOUNDARY_TERMS ausente (PR de fork, sem segredos): fronteira não verificada",
      );
      return 0;
    }
    console.error("BOUNDARY_TERMS ausente");
    return 1;
  }
  const terms = parseTerms(raw);
  const tracked = trackedFiles();
  if (tracked === null) {
    console.error(
      "falha ao listar os arquivos versionados (git ls-files): rode dentro de um repositório git",
    );
    return 1;
  }
  const files = new Set(tracked);
  for (const dir of alsoDirs(argv)) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      console.error(`pasta --also inexistente: ${maskName(dir, terms)}`);
      return 1;
    }
    for (const file of walk(dir)) files.add(file);
  }
  let total = 0;
  for (const [index, file] of [...files].sort().entries()) {
    for (const f of scanText(file, file, terms)) {
      console.log(`arquivo #${index + 1}: termo #${f.term}`);
      total++;
    }
    let buf: Buffer;
    try {
      if (!statSync(file).isFile()) continue;
      buf = readFileSync(file);
    } catch {
      continue;
    }
    if (isBinary(buf)) continue;
    for (const f of scanText(file, buf.toString("utf8"), terms)) {
      console.log(`${label(file, index, terms)}:${f.line}: termo #${f.term}`);
      total++;
    }
  }
  if (total > 0) {
    console.error(`Fronteira violada: ${total} achado(s).`);
    return 1;
  }
  console.log("Fronteira ok.");
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2), process.env));
