import type { ParseError } from "./types.js";

const BRAND = Symbol.for("@smonn/ids/IdsError");

/**
 * The stable machine-readable failure reason carried by `IdsError`.
 * Use `code` — not `message` — for programmatic branching; `message` is non-contractual.
 * Adding a new member is minor-additive; renaming or removing one is breaking.
 */
export type IdsErrorCode =
  | "invalid_brand"
  | "invalid_key_format"
  | "invalid_key_encoding"
  | "invalid_key_length"
  | "invalid_kind"
  | "empty_keyring"
  | "duplicate_keyring_entry"
  | "invalid_lookup_key"
  | "verification_failed"
  | "invalid_id"
  | "invalid_namespace"
  | "invalid_timestamp";

/**
 * The single error class thrown by caller-reachable public failures.
 * Carries a stable `readonly code: IdsErrorCode` for programmatic discrimination.
 * Recognized via `isIdsError()` — a branded guard that survives realm/dual-package duplication
 * where bare `instanceof` would silently fail.
 *
 * @example
 * ```ts
 * try {
 *   usr.parse(rawInput);
 * } catch (err) {
 *   if (isIdsError(err) && err.code === "invalid_id") return; // handle parse failure
 * }
 * ```
 */
export class IdsError extends Error {
  readonly code: IdsErrorCode;
  /**
   * Populated **only** when `code === "invalid_id"`, carrying the originating `ParseError`
   * that describes why the string failed to parse. All other codes leave `cause` undefined.
   */
  declare readonly cause?: ParseError;

  constructor(code: IdsErrorCode, message: string, options?: { cause?: ParseError }) {
    super(message, options);
    this.name = "IdsError";
    this.code = code;
    Object.defineProperty(this, BRAND, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
}

/**
 * Type guard for `IdsError`. Checks a non-enumerable brand rather than bare `instanceof`
 * so it survives realm/dual-package duplication (ESM + CJS dual package hazard).
 *
 * @example
 * ```ts
 * if (isIdsError(err)) {
 *   switch (err.code) {
 *     case "verification_failed": // ...
 *     case "invalid_id": // ...
 *   }
 * }
 * ```
 */
export function isIdsError(value: unknown): value is IdsError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
