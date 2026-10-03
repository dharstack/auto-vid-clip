import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const ignored = new Set(["node_modules", "dist", ".git", ".vercel"]);

export function collectTables(schema: string): string[] {
  return [...new Set([...schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w]+)/gi)].map((match) => match[1].toLowerCase()))].sort();
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter((entry) => entry.isDirectory() && !ignored.has(entry.name)).map((entry) => listFiles(join(directory, entry.name))));
  return [...entries.filter((entry) => entry.isFile()).map((entry) => join(directory, entry.name)), ...nested.flat()];
}

async function main(): Promise<void> {
  const files = await listFiles(root);
  const workspaces = [];
  for (const file of files.filter((path) => path.endsWith(`${sep}package.json`) && /[\\/](apps|packages|tools)[\\/]/.test(path))) {
    const manifest = JSON.parse(await readFile(file, "utf8")) as { name?: string; dependencies?: Record<string, string> };
    const directory = relative(root, file).split(sep).slice(0, -1).join("/");
    const tests = files.filter((path) => path.startsWith(join(root, directory, "test") + sep)).map((path) => relative(root, path).split(sep).join("/")).sort();
    workspaces.push({ name: manifest.name ?? directory, path: directory, dependencies: Object.keys(manifest.dependencies ?? {}).filter((name) => name.startsWith("@auto-clipper/")).sort(), tests });
  }
  workspaces.sort((a, b) => a.path.localeCompare(b.path));
  const schema = await readFile(join(root, "apps/api/schema.sql"), "utf8");
  const api = await readFile(join(root, "apps/api/src/index.ts"), "utf8");
  const pipeline = await readFile(join(root, "tools/pipeline-run/src/index.ts"), "utf8");
  const output = {
    generated: "deterministic",
    workspaces,
    routes: [...new Set([...api.matchAll(/url\.pathname\s*===\s*["']([^"']+)/gi)].map((match) => match[1]))].sort(),
    tables: collectTables(schema),
    pipelineStages: [...new Set([...pipeline.matchAll(/stage:\s*["']([A-Z_]+)["']/g)].map((match) => match[1]))],
    tools: workspaces.filter(({ path }) => path.startsWith("tools/")).map(({ name, path }) => ({ name, path })),
    tests: workspaces.flatMap(({ tests }) => tests)
  };
  const destination = join(root, "architecture.json");
  await writeFile(destination, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: "generated", file: "architecture.json", workspaces: workspaces.length })}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/architecture/dist/src/index.js")) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
