import { isIdsError } from "../error.js";

/** Render any thrown value as a single CLI line: `code: message` for IdsError, else the message. */
export function formatCliError(err: unknown): string {
  return isIdsError(err)
    ? `${err.code}: ${err.message}`
    : err instanceof Error
      ? err.message
      : String(err);
}
