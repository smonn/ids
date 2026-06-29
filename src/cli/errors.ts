/**
 * A recoverable CLI failure. `usage` maps to exit code 2 (bad invocation), `runtime`
 * to exit code 1 (the invocation was well-formed but the operation failed). Handlers
 * return these instead of throwing so the router can map them to exit codes uniformly.
 */
export type CliError = { readonly kind: "usage" | "runtime"; readonly message: string };

export function usageError(message: string): CliError {
  return { kind: "usage", message };
}

export function runtimeError(message: string): CliError {
  return { kind: "runtime", message };
}

export function isCliError(value: unknown): value is CliError {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (kind === "usage" || kind === "runtime") && "message" in value;
}

/** Exit code for a {@link CliError}: usage → 2, runtime → 1. */
export function exitCodeFor(error: CliError): number {
  return error.kind === "usage" ? 2 : 1;
}
