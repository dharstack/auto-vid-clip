import { readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const codeRoots = ["apps", "packages", "tools", "docs"];
const rootFiles = ["package.json", "AGENTS.md"];
const ignoredDirectories = new Set(["node_modules", "dist", ".git", ".vercel", ".local", "work", "exports", "ranges"]);
const generatedMediaExtensions = new Set([".mp4", ".mkv", ".mov", ".webm", ".avi", ".wav", ".mp3", ".aac", ".flac", ".m4a"]);

export async function discoverFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  files.push(...entries.filter((entry) => entry.isFile() && rootFiles.includes(entry.name)).map((entry) => join(root, entry.name)));
  for (const directory of codeRoots.filter((name) => entries.some((entry) => entry.isDirectory() && entry.name === name))) {
    files.push(...await walk(join(root, directory)));
  }
  return files.map((file) => relative(root, file).split(sep).join("/")).sort();
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !ignoredDirectories.has(entry.name))
    .map((entry) => walk(join(directory, entry.name))));
  return [...entries.filter((entry) => entry.isFile() && !generatedMediaExtensions.has(extname(entry.name).toLowerCase())).map((entry) => join(directory, entry.name)), ...nested.flat()];
}
