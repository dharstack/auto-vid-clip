export type ToolStatus = "ok" | "error";

export interface ToolOk<T extends object = Record<string, unknown>> {
  status: "ok";
  cached?: boolean;
  output?: string;
  data?: T;
}

export interface ToolError {
  status: "error";
  code: string;
  message: string;
  log?: string;
}

export type ToolResult<T extends object = Record<string, unknown>> =
  | ToolOk<T>
  | ToolError;
