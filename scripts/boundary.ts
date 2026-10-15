// Fronteira público × privado: procura, no conteúdo dos arquivos versionados (e dos diretórios de --also), os termos
// de BOUNDARY_TERMS (um por linha). A saída nunca imprime o termo (os logs do CI público são abertos): só
// `arquivo:linha: termo #n`, com n a posição do termo na lista (base 1).
//
// Uso: bun run boundary [-- --also <dir>]...

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Finding = { file: string; line: number; term: number };

/** Uma entrada por linha; ignora linhas em branco e as que começam com `#`. */
export function parseTerms(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** Achados de `terms` (sem diferenciar maiúsculas) em `text`; `term` é o índice na lista, base 1. */
export function scanText(file: string, text: string, terms: string[]): Finding[] {
  const needles = terms.map((term) => term.toLowerCase());
  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] as string).toLowerCase();
    needles.forEach((needle, index) => {
      if (line.includes(needle)) findings.push({ file, line: i + 1, term: index + 1 });
    });
  }
  return findings;
}

/** Sem BOUNDARY_TERMS: PR de fork não recebe segredos (pula); qualquer outro caso falha. */
export function missingTermsVerdict(env: Record<string, string | undefined>): "skip" | "fail" {
  const fromFork =
    env.GITHUB_EVENT_NAME === "pull_request" &&
    Boolean(env.GITHUB_HEAD_REPO) &&
    env.GITHUB_HEAD_REPO !== env.GITHUB_REPOSITORY;
  return fromFork ? "skip" : "fail";
}

function isBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, 8000).includes(0);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
  });
}

function trackedFiles(): string[] {
  const proc = Bun.spawnSync(["git", "ls-files", "-z"]);
  if (proc.exitCode !== 0) throw new Error("git ls-files falhou");
  return proc.stdout.toString().split("\0").filter(Boolean);
}

function alsoDirs(argv: string[]): string[] {
  const dirs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--also" && argv[i + 1]) dirs.push(argv[++i] as string);
  }
  return dirs;
}

export function main(argv: string[], env: Record<string, string | undefined>): number {
  const terms = parseTerms(env.BOUNDARY_TERMS ?? "");
  if (terms.length === 0) {
    if (missingTermsVerdict(env) === "skip") {
      console.log(
        "::warning::BOUNDARY_TERMS ausente (PR de fork, sem segredos): fronteira não verificada",
      );
      return 0;
    }
    console.error("BOUNDARY_TERMS ausente");
    return 1;
  }

  const files = new Set(trackedFiles());
  for (const dir of alsoDirs(argv)) {
    if (statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      for (const file of walk(dir)) files.add(file);
    }
  }

  let total = 0;
  for (const file of [...files].sort()) {
    if (!statSync(file, { throwIfNoEntry: false })?.isFile()) continue;
    const bytes = readFileSync(file);
    if (isBinary(bytes)) continue;
    for (const f of scanText(file, bytes.toString("utf-8"), terms)) {
      console.log(`${f.file}:${f.line}: termo #${f.term}`);
      total++;
    }
  }

  if (total > 0) {
    console.error(`${total} achado(s) na fronteira`);
    return 1;
  }
  console.log(`fronteira limpa (${files.size} arquivos)`);
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2), process.env));
}
