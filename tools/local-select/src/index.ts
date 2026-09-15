#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCandidates } from "@auto-clipper/candidates";
import { scoreCandidates } from "@auto-clipper/scoring";
import { buildRenderPlan } from "@auto-clipper/render-plan";

const argv = process.argv.slice(2);
const value = (flag: string) => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : undefined; };
const jobId = value("--job");
if (!jobId) throw new Error("ARG_REQUIRED: --job <job-id>");
const root = value("--work-root") ?? "work";
const dir = join(root, jobId);
const events = JSON.parse(await readFile(join(dir, "events.json"), "utf8"));
const candidates = buildCandidates(events);
const scores = scoreCandidates(candidates);
const media = JSON.parse(await readFile(join(dir, "media.json"), "utf8").catch(() => "{}"));
const plan = buildRenderPlan(candidates, scores, { sourceDurationMs: media.durationMs });
await writeFile(join(dir, "candidates.json"), JSON.stringify(candidates, null, 2));
await writeFile(join(dir, "scores.json"), JSON.stringify(scores, null, 2));
await writeFile(join(dir, "render-plan.json"), JSON.stringify(plan, null, 2));
process.stdout.write(JSON.stringify({ status: "ok", jobId, candidates: candidates.length, clips: plan.clips.length, render: argv.includes("--render") }) + "\n");
