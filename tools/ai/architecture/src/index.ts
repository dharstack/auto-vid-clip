import { readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { discoverFiles } from "@auto-clipper/ai-scanner";
import { PIPELINE_PROGRESS_STAGES } from "@auto-clipper/contracts";

const root = process.cwd();

export function collectTables(schema: string): string[] {
  return [...new Set([...schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w]+)/gi)].map((match) => match[1].toLowerCase()))].sort();
}

export async function buildArchitectureIndex(rootDirectory: string) {
  const files = (await discoverFiles(rootDirectory)).map((file) => join(rootDirectory, file));
  const workspaces = [];
  for (const file of files.filter((path) => path.endsWith(`${sep}package.json`) && /[\\/](apps|packages|tools)[\\/]/.test(path))) {
    const manifest = JSON.parse(await readFile(file, "utf8")) as { name?: string; dependencies?: Record<string, string> };
    const directory = relative(rootDirectory, file).split(sep).slice(0, -1).join("/");
    const tests = files.filter((path) => path.startsWith(join(rootDirectory, directory, "test") + sep)).map((path) => relative(rootDirectory, path).split(sep).join("/")).sort();
    workspaces.push({ name: manifest.name ?? directory, path: directory, dependencies: Object.keys(manifest.dependencies ?? {}).filter((name) => name.startsWith("@auto-clipper/")).sort(), tests });
  }
  workspaces.sort((a, b) => a.path.localeCompare(b.path));
  const schema = await readFile(join(rootDirectory, "apps/api/schema.sql"), "utf8");
  const api = await readFile(join(rootDirectory, "apps/api/src/index.ts"), "utf8");
  const output = {
    schemaVersion: 1,
    generated: "deterministic",
    workspaces,
    routes: [...new Set([...api.matchAll(/url\.pathname\s*===\s*["']([^"']+)/gi)].map((match) => match[1]))].sort(),
    tables: collectTables(schema),
    pipelineStages: [...PIPELINE_PROGRESS_STAGES],
    tools: workspaces.filter(({ path }) => path.startsWith("tools/")).map(({ name, path }) => ({ name, path })),
    tests: workspaces.flatMap(({ tests }) => tests)
  };
  return output;
}

async function main(): Promise<void> {
  const output = await buildArchitectureIndex(root);
  const destination = join(root, "architecture.json");
  await writeFile(destination, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: "generated", file: "architecture.json", workspaces: output.workspaces.length })}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/architecture/dist/src/index.js")) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
