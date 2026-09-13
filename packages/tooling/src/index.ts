import type { ToolError, ToolResult } from "@auto-clipper/contracts";

export function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

export function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

export function requireFlagValue(argv: string[], flag: string): string {
  const value = flagValue(argv, flag);
  if (!value || value.startsWith("--")) {
    throw new Error(`ARG_REQUIRED: ${flag}`);
  }
  return value;
}

export function positionalArg(argv: string[], index: number): string | undefined {
  return argv.filter((arg) => !arg.startsWith("--"))[index];
}

export function printToolResult<T extends object>(result: ToolResult<T>): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export function toToolError(error: unknown, code: string): ToolError {
  return {
    status: "error",
    code,
    message: error instanceof Error ? error.message : String(error)
  };
}
