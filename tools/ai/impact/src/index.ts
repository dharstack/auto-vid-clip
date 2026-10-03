import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { discoverFiles } from "@auto-clipper/ai-scanner";

const root = process.cwd();
type Source = { file: string; text: string };

export function findImporters(packageName: string, sources: Source[]): string[] {
  return sources.filter(({ text }) => text.includes(`"${packageName}"`) || text.includes(`'${packageName}'`)).map(({ file }) => file).sort();
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: npm run ai:impact -- <file>");
  const target = relative(root, join(root, input)).split(sep).join("/");
  const parts = target.split("/");
  let owner = parts.slice(0, 2).join("/");
  let targetPackage: { name: string; dependencies?: Record<string, string>; scripts?: Record<string, string> } | undefined;
  for (let length = parts.length - 1; length >= 2 && !targetPackage; length -= 1) {
    const candidate = parts.slice(0, length).join("/");
    targetPackage = await readFile(join(root, candidate, "package.json"), "utf8").then((text) => JSON.parse(text) as typeof targetPackage).catch(() => undefined);
    if (targetPackage) owner = candidate;
  }
  const files = (await discoverFiles(root)).map((file) => join(root, file));
  const sources: Source[] = await Promise.all(files.filter((file) => file.endsWith(".ts") && file.includes(`${sep}src${sep}`)).map(async (file) => ({ file: relative(root, file).split(sep).join("/"), text: await readFile(file, "utf8") })));
  const manifest = targetPackage;
  const tests = files.map((file) => relative(root, file).split(sep).join("/")).filter((file) => file.startsWith(`${owner}/test/`));
  const packageName = manifest?.name;
  const output = {
    file: target,
    workspace: owner,
    importers: packageName ? findImporters(packageName, sources).filter((file) => file !== target) : [],
    dependencies: Object.keys(manifest?.dependencies ?? {}).sort(),
    tests,
    commands: { build: `npm run build -w ${packageName ?? owner}`, test: tests.length ? `npm test -w ${packageName ?? owner}` : "none" }
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/impact/dist/src/index.js")) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
