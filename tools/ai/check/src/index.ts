import { spawnSync } from "node:child_process";

export function summarizeFailure(log: string): { errorCode?: string; file?: string; message: string } {
  const lines = log.split(/\r?\n/).filter(Boolean);
  const diagnostic = lines.find((line) => /error TS\d+:/.test(line)) ?? lines.find((line) => /npm error|Error:/.test(line)) ?? lines.at(-1) ?? "Command failed";
  const parsed = diagnostic.match(/^(.*?)(?:\(\d+,\d+\))?: error (TS\d+): (.*)$/);
  return parsed ? { errorCode: parsed[2], file: parsed[1], message: parsed[3] } : { message: diagnostic.slice(0, 240) };
}

function run(step: string, args: string[]): boolean {
  const npmCli = process.env.npm_execpath;
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 8 * 1024 * 1024 });
  if (result.status === 0) { process.stdout.write(`${JSON.stringify({ status: "passed", step })}\n`); return true; }
  const error = summarizeFailure(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  process.stdout.write(`${JSON.stringify({ status: "failed", step, ...error })}\n`);
  return false;
}

function main(): void {
  for (const [step, args] of [["build", ["run", "build"]], ["typecheck", ["run", "typecheck"]], ["test", ["test"]]] as const) {
    if (!run(step, [...args])) { process.exitCode = 1; break; }
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/check/dist/src/index.js")) main();
