import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Candidate, CandidateScore } from "@auto-clipper/contracts";

export const DEFAULT_OPENCODE_MODEL = "opencode/mimo-v2.5-free";

export interface OpenCodeSelection {
  model: string;
  invoked: boolean;
  selected: Array<{ candidateId: string; reason: string }>;
}

export function parseOpenCodeSelection(output: string, candidates: Candidate[], model: string): OpenCodeSelection {
  const errors: string[] = [];
  const parts: string[] = [];
  for (const line of output.trim().split(/\r?\n/)) {
    if (!line) continue;
    const event = JSON.parse(line) as { type?: string; part?: { text?: string }; error?: { message?: string } };
    if (event.type === "error") errors.push(event.error?.message ?? "Unknown OpenCode error");
    if (event.type === "text" && typeof event.part?.text === "string") parts.push(event.part.text);
  }
  if (errors.length) throw new Error(`OPENCODE_FAILED: ${errors.join("; ")}`);
  const answer = parts.join("").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!answer) throw new Error("OPENCODE_EMPTY_RESPONSE: no selection was returned");
  const parsed = JSON.parse(answer) as { selected?: unknown };
  if (!Array.isArray(parsed.selected)) throw new Error("OPENCODE_INVALID_RESPONSE: selected must be an array");
  const allowed = new Set(candidates.map((candidate) => candidate.id));
  const seen = new Set<string>();
  const selected = parsed.selected.map((item: unknown) => {
    const value = item as { candidateId?: unknown; reason?: unknown };
    if (typeof value?.candidateId !== "string" || !allowed.has(value.candidateId) || seen.has(value.candidateId)) {
      throw new Error("OPENCODE_INVALID_RESPONSE: unknown or repeated candidate ID");
    }
    if (typeof value.reason !== "string" || !value.reason.trim()) throw new Error("OPENCODE_INVALID_RESPONSE: reason is required");
    seen.add(value.candidateId);
    return { candidateId: value.candidateId, reason: value.reason.trim().slice(0, 240) };
  });
  if (selected.length > 8) throw new Error("OPENCODE_INVALID_RESPONSE: too many clips selected");
  return { model, invoked: true, selected };
}

export function applyOpenCodeSelection(scores: CandidateScore[], selection: OpenCodeSelection): CandidateScore[] {
  const reasons = new Map(selection.selected.map((item) => [item.candidateId, item.reason]));
  return scores.map((score) => {
    const reason = reasons.get(score.candidateId);
    return reason
      ? { ...score, score: Math.max(score.score, 0.75), decision: "REVIEW", reasons: [...score.reasons, `OpenCode: ${reason}`] }
      : { ...score, decision: "IGNORE" };
  });
}

export async function ensureOpenCodeReady(jobDir: string): Promise<void> {
  const model = freeModel();
  await writeOpenCodeConfig(jobDir, model);
  const output = await runOpenCode(resolveOpenCodeCommand(), ["models", "--standalone"], jobDir);
  if (!output.split(/\r?\n/).some((line) => line.trim() === model)) {
    throw new Error(`OPENCODE_FREE_MODEL_UNAVAILABLE: connect a free provider with opencode auth login, then check opencode models for ${model}`);
  }
}

export async function selectWithOpenCode(jobDir: string, candidates: Candidate[], scores: CandidateScore[]): Promise<OpenCodeSelection> {
  const model = freeModel();
  if (!candidates.length) return { model, invoked: false, selected: [] };
  const byId = new Map(scores.map((score) => [score.candidateId, score]));
  const shortlist = [...candidates].sort((left, right) => (byId.get(right.id)?.score ?? 0) - (byId.get(left.id)?.score ?? 0)).slice(0, 40);
  const evidence = shortlist.map((candidate) => ({
    id: candidate.id,
    category: candidate.category,
    startMs: candidate.startMs,
    endMs: candidate.endMs,
    deterministicScore: byId.get(candidate.id)?.score ?? 0,
    reasons: candidate.reasons,
    eventCounts: candidate.events.reduce<Record<string, number>>((counts, event) => {
      counts[event.type] = (counts[event.type] ?? 0) + 1;
      return counts;
    }, {}),
    events: [...candidate.events].sort((left, right) => right.confidence - left.confidence).slice(0, 20)
      .sort((left, right) => left.startMs - right.startMs)
      .map((event) => ({ type: event.type, startMs: event.startMs, endMs: event.endMs, confidence: Number(event.confidence.toFixed(3)) }))
  }));
  const prompt = `Select up to 8 likely highlight clips from this JSON evidence. Signals are estimates, not proof of gameplay. Prefer short, well-supported moments. Return ONLY a JSON object: {"selected":[{"candidateId":"cand-001","reason":"brief reason"}]}. Use only supplied IDs; an empty array is valid. Do not use tools.\n${JSON.stringify(evidence)}`;
  await writeOpenCodeConfig(jobDir, model);
  const command = resolveOpenCodeCommand();
  const output = await runOpenCode(command, ["run", "--standalone", "--model", model, "--format", "json", prompt], jobDir);
  return parseOpenCodeSelection(output, shortlist, model);
}

function freeModel(): string {
  const model = process.env.OPENCODE_MODEL ?? DEFAULT_OPENCODE_MODEL;
  if (!/^opencode\/[a-z0-9.-]+-free$/i.test(model)) throw new Error("OPENCODE_FREE_MODEL_REQUIRED: OPENCODE_MODEL must name an OpenCode free model");
  return model;
}

async function writeOpenCodeConfig(jobDir: string, model: string): Promise<void> {
  await writeFile(join(jobDir, "opencode.json"), JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    model,
    permissions: [{ action: "*", resource: "*", effect: "deny" }]
  }));
}

function resolveOpenCodeCommand(): string[] {
  const configured = process.env.OPENCODE_PATH;
  if (configured) return /\.m?js$/i.test(configured) ? [process.execPath, configured] : [configured];
  if (process.platform === "win32") {
    const executable = join(process.env.APPDATA ?? "", "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe");
    if (existsSync(executable)) return [executable];
  }
  return ["opencode"];
}

function runOpenCode(command: string[], args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], [...command.slice(1), ...args], { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(stdout);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error("OPENCODE_TIMEOUT: selection exceeded 120 seconds")); }, 120_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 1_000_000) { child.kill(); finish(new Error("OPENCODE_OUTPUT_TOO_LARGE")); }
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-2000); });
    child.on("error", (error) => finish(new Error(`OPENCODE_UNAVAILABLE: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) return finish();
      const message = extractErrorMessage(stdout) ?? (stderr.trim() || `exit ${code}`);
      const setup = /model unavailable|no.route|authentication|unauthorized/i.test(message)
        ? "OPENCODE_FREE_MODEL_UNAVAILABLE: connect a free provider with opencode auth login, then check opencode models. "
        : "OPENCODE_FAILED: ";
      finish(new Error(`${setup}${message}`));
    });
  });
}

function extractErrorMessage(output: string): string | undefined {
  for (const line of output.trim().split(/\r?\n/).reverse()) {
    try {
      const event = JSON.parse(line) as { type?: string; error?: { message?: string } };
      if (event.type === "error") return event.error?.message;
    } catch { /* Ignore non-JSON diagnostics. */ }
  }
  return undefined;
}
