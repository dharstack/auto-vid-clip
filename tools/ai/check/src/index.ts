import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { discoverFiles } from "@auto-clipper/ai-scanner";

type Workspace = { name: string; path: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
type Check = { step: "build" | "typecheck" | "test"; workspace?: string };

export function planChecks(changedFiles: string[], workspaces: Workspace[], full = false): Check[] {
  if (full) return [{ step: "build" }, { step: "typecheck" }, { step: "test" }];
  return impactedWorkspaces(changedFiles, workspaces).flatMap(({ name, scripts }) => (["build", "typecheck", "test"] as const)
    .filter((step) => Boolean(scripts?.[step]))
    .map((step) => ({ step, workspace: name })));
}

function impactedWorkspaces(changedFiles: string[], workspaces: Workspace[]): Workspace[] {
  const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const impacted = new Set(workspaces.filter(({ path }) => changedFiles.some((file) => file === path || file.startsWith(`${path}/`))).map(({ name }) => name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const workspace of workspaces) {
      const dependencies = { ...workspace.dependencies, ...workspace.devDependencies };
      if (!impacted.has(workspace.name) && Object.keys(dependencies).some((dependency) => impacted.has(dependency))) {
        impacted.add(workspace.name);
        changed = true;
      }
    }
  }

  const ordered: Workspace[] = [];
  const visited = new Set<string>();
  const visit = (workspace: Workspace): void => {
    if (visited.has(workspace.name)) return;
    visited.add(workspace.name);
    const dependencies = { ...workspace.dependencies, ...workspace.devDependencies };
    Object.keys(dependencies).sort().forEach((name) => {
      const dependency = byName.get(name);
      if (dependency && impacted.has(name)) visit(dependency);
    });
    ordered.push(workspace);
  };
  [...impacted].sort((left, right) => (byName.get(left)?.path ?? left).localeCompare(byName.get(right)?.path ?? right))
    .forEach((name) => { const workspace = byName.get(name); if (workspace) visit(workspace); });
  return ordered;
}

export function buildPrerequisites(changedFiles: string[], workspaces: Workspace[]): string[] {
  const ownerNames = new Set(impactedWorkspaces(changedFiles, workspaces).map(({ name }) => name));
  const owners = workspaces.filter(({ name }) => ownerNames.has(name));
  const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const visited = new Set<string>();
  const result: string[] = [];
  const visit = (workspace: Workspace): void => {
    for (const dependencyName of Object.keys({ ...workspace.dependencies, ...workspace.devDependencies }).sort()) {
      const dependency = byName.get(dependencyName);
      if (!dependency || visited.has(dependencyName)) continue;
      visit(dependency);
      visited.add(dependencyName);
      if (!ownerNames.has(dependencyName) && dependency.scripts?.build) result.push(dependencyName);
    }
  };
  owners.forEach(visit);
  return result;
}

export function summarizeFailure(log: string): { errorCode?: string; file?: string; message: string } {
  const lines = log.split(/\r?\n/).filter(Boolean);
  const diagnostic = lines.find((line) => /error TS\d+:/.test(line)) ?? lines.find((line) => /npm error|Error:/.test(line)) ?? lines.at(-1) ?? "Command failed";
  const parsed = diagnostic.match(/^(.*?)(?:\(\d+,\d+\))?: error (TS\d+): (.*)$/);
  return parsed ? { errorCode: parsed[2], file: parsed[1], message: parsed[3] } : { message: diagnostic.slice(0, 240) };
}

export async function writeFailureLog(root: string, log: string, now = new Date(), pid = process.pid): Promise<string> {
  const logDirectory = join(root, ".local", "ai", "logs");
  await mkdir(logDirectory, { recursive: true });
  const stamp = now.toISOString().replace(/[.:]/g, "-");
  const filename = `check-${stamp}-${pid}.log`;
  await writeFile(join(logDirectory, filename), log);
  return `.local/ai/logs/${filename}`;
}

async function readWorkspaces(root: string, files: string[]): Promise<Workspace[]> {
  const manifests = files.filter((file) => /^(apps|packages|tools)\/.+\/package\.json$/.test(file));
  return Promise.all(manifests.map(async (file) => {
    const manifest = JSON.parse(await readFile(join(root, file), "utf8")) as Workspace;
    return { ...manifest, path: file.slice(0, -"/package.json".length) };
  }));
}

function gitFiles(root: string, args: string[]): string[] {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || "git command failed").trim());
  return result.stdout.split(/\r?\n/).filter(Boolean).map((file) => file.replaceAll("\\", "/"));
}

export function getChangedFiles(root: string): string[] {
  let base: string;
  try {
    base = gitFiles(root, ["merge-base", "HEAD", "master"])[0];
  } catch {
    base = gitFiles(root, ["merge-base", "HEAD", "origin/master"])[0];
  }
  const committed = gitFiles(root, ["diff", "--name-only", `${base}...HEAD`]);
  const working = gitFiles(root, ["diff", "--name-only", "HEAD"]);
  const untracked = gitFiles(root, ["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...committed, ...working, ...untracked])].sort();
}

async function runCheck(root: string, check: Check): Promise<Record<string, unknown> | null> {
  const args = check.workspace
    ? ["run", check.step, "-w", check.workspace]
    : check.step === "test" ? ["test"] : ["run", check.step];
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, shell: process.platform === "win32" && !npmCli });
  if (result.status === 0) return null;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const log = await writeFailureLog(root, output);
  return {
    status: "failed",
    step: check.step,
    ...(check.workspace ? { package: check.workspace } : {}),
    ...summarizeFailure(output),
    log
  };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const files = await discoverFiles(root);
  const workspaces = await readWorkspaces(root, files);
  const full = process.argv.includes("--full");
  const changes = full ? [] : getChangedFiles(root);
  const sharedConfigChanged = changes.some((file) => ["package.json", "package-lock.json", "tsconfig.base.json"].includes(file));
  const checks = planChecks(changes, workspaces, full || sharedConfigChanged);
  const completed: string[] = [];
  if (!full && !sharedConfigChanged) {
    for (const workspace of buildPrerequisites(changes, workspaces)) {
      const failure = await runCheck(root, { step: "build", workspace });
      if (failure) {
        process.stdout.write(`${JSON.stringify(failure)}\n`);
        process.exitCode = 1;
        return;
      }
      completed.push(`dependency-build:${workspace}`);
    }
  }
  for (const check of checks) {
    const failure = await runCheck(root, check);
    if (failure) {
      process.stdout.write(`${JSON.stringify(failure)}\n`);
      process.exitCode = 1;
      return;
    }
    completed.push(check.workspace ? `${check.step}:${check.workspace}` : check.step);
  }
  process.stdout.write(`${JSON.stringify({ status: "passed", mode: full || sharedConfigChanged ? "full" : "targeted", workspaces: [...new Set(checks.flatMap(({ workspace }) => workspace ? [workspace] : []))], steps: completed })}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/check/dist/src/index.js")) void main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ status: "failed", step: "discover", message: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});
