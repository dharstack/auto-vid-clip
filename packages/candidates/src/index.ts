import type { Candidate, CandidateCategory, GameplayEvent } from "@auto-clipper/contracts";

export interface CandidateBuildOptions {
  mergeWindowMs?: number;
}

export function buildCandidates(events: GameplayEvent[], options: CandidateBuildOptions = {}): Candidate[] {
  const mergeWindowMs = options.mergeWindowMs ?? 45000;
  const sorted = [...events].sort((left, right) => left.startMs - right.startMs);
  const groups: GameplayEvent[][] = [];

  for (const event of sorted) {
    const last = groups[groups.length - 1];
    const lastEnd = last ? Math.max(...last.map((item) => item.endMs)) : 0;
    if (!last || event.startMs > lastEnd + mergeWindowMs) {
      groups.push([event]);
    } else {
      last.push(event);
    }
  }

  return groups
    .map((group, index) => groupToCandidate(group, index + 1))
    .filter((candidate): candidate is Candidate => Boolean(candidate))
    .reduce<Candidate[]>((merged, candidate) => mergeDuplicate(merged, candidate), []);
}

function groupToCandidate(events: GameplayEvent[], number: number): Candidate | null {
  const types = new Set(events.map((event) => event.type));
  const category = classify(types);
  if (!category) {
    return null;
  }

  return {
    id: `cand-${String(number).padStart(3, "0")}`,
    category,
    startMs: Math.min(...events.map((event) => event.startMs)),
    endMs: Math.max(...events.map((event) => event.endMs)),
    events,
    reasons: reasonsFor(events)
  };
}

function classify(types: Set<GameplayEvent["type"]>): CandidateCategory | null {
  if (types.has("BOSS_DEFEATED") && types.has("LOW_HEALTH")) return "BOSS_CLOSE_CALL";
  if (types.has("BOSS_DEFEATED")) return "BOSS_KILL";
  if (types.has("PLAYER_DEATH") && types.has("MIC_REACTION")) return "FUNNY_DEATH";
  if (types.has("EXECUTION")) return "EXECUTION";
  if (types.has("CRITICAL_ATTACK")) return "CRITICAL_ATTACK";
  if (types.has("COMBAT_SPIKE")) return "INTENSE_COMBAT";
  if (types.has("MIC_REACTION")) return "REACTION";
  if (types.has("DISCOVERY")) return "DISCOVERY";
  return null;
}

function reasonsFor(events: GameplayEvent[]): string[] {
  const reasons = new Set<string>();
  for (const event of events) {
    if (event.type === "BOSS_PRESENT") reasons.add("Boss present");
    if (event.type === "BOSS_DEFEATED") reasons.add("Boss defeated");
    if (event.type === "LOW_HEALTH") reasons.add(lowHealthReason(event));
    if (event.type === "COMBAT_SPIKE") reasons.add("Combat spike");
    if (event.type === "CRITICAL_ATTACK") reasons.add("Critical attack");
    if (event.type === "PLAYER_DEATH") reasons.add("Player death");
    if (event.type === "MIC_REACTION") reasons.add("Mic reaction");
    if (event.type === "EXECUTION") reasons.add("Execution");
    if (event.type === "DISCOVERY") reasons.add("Discovery");
  }
  return [...reasons];
}

function lowHealthReason(event: GameplayEvent): string {
  const health = event.metadata?.estimatedHealthPercent;
  return typeof health === "number" ? `Health reached ${health}%` : "Low health";
}

function mergeDuplicate(candidates: Candidate[], candidate: Candidate): Candidate[] {
  const duplicate = candidates.find((existing) => existing.category === candidate.category && overlaps(existing, candidate));
  if (!duplicate) {
    return [...candidates, candidate];
  }

  duplicate.startMs = Math.min(duplicate.startMs, candidate.startMs);
  duplicate.endMs = Math.max(duplicate.endMs, candidate.endMs);
  duplicate.events = [...duplicate.events, ...candidate.events].sort((left, right) => left.startMs - right.startMs);
  duplicate.reasons = [...new Set([...duplicate.reasons, ...candidate.reasons])];
  return candidates;
}

function overlaps(left: Candidate, right: Candidate): boolean {
  return left.startMs <= right.endMs && right.startMs <= left.endMs;
}
