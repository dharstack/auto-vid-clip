const args = process.argv.slice(2);
if (args[0] === "models") {
  if (!process.env.FAKE_OPENCODE_NO_MODELS) process.stdout.write("opencode/mimo-v2.6-flash-free\n");
  process.exit(0);
}
if (!args.includes("--format") || !args.includes("--model") || !args.at(-1)?.includes("cand-001")) process.exit(2);
process.stdout.write(`${JSON.stringify({ type: "text", part: { text: JSON.stringify({ selected: [{ candidateId: "cand-001", reason: "Corroborated fixture events" }] }) } })}\n`);
