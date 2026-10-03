import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverFiles } from "@auto-clipper/ai-scanner";

const root = process.cwd();

export function rankFiles(task: string, files: string[], contents: Record<string, string> = {}): string[] {
  const words = task.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const matches = (text: string, word: string): boolean => new RegExp(`(?:^|[^a-z0-9])${word}(?:$|[^a-z0-9])`, "i").test(text);
  return files.map((file) => ({ file, score: words.reduce((score, word) => score + (matches(file, word) ? 2 : 0) + (matches(contents[file] ?? "", word) ? 1 : 0), 0) })).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file)).map(({ file }) => file);
}

async function main(): Promise<void> {
  const task = process.argv.slice(2).join(" ").replaceAll("^", "").trim();
  if (!task) throw new Error('Usage: npm run ai:context -- "task"');
  const files = await discoverFiles(root);
  const candidates = files.filter((file) => /^(apps|packages|tools)\//.test(file) && !file.includes("/test/") && /\.(ts|tsx|json)$/.test(file));
  const contents: Record<string, string> = {};
  await Promise.all(candidates.map(async (file) => { contents[file] = await readFile(join(root, file), "utf8").catch(() => ""); }));
  const matches = rankFiles(task, candidates, contents);
  const ranked = (matches.length ? matches : candidates.filter((file) => file.endsWith("/package.json"))).slice(0, 8);
  const area = task.toLowerCase().match(/youtube|twitch|worker|api|web|render|candidate|scor|pipeline/)?.[0] ?? "general";
  const owner = (file: string): string => file.startsWith("tools/ai/") ? file.split("/").slice(0, 3).join("/") : file.split("/").slice(0, 2).join("/");
  const tests = files.filter((file) => file.includes("/test/") && ranked.some((candidate) => owner(candidate) === owner(file))).slice(0, 8);
  const output = { task, area, files: [...new Set([...ranked, ...tests])].slice(0, 12) };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/context/dist/src/index.js")) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
