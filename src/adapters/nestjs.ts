import { BadRequestException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import type { ArgumentMetadata, PipeTransform } from "@nestjs/common";
import { type IdCodec, type IdParamFailure, resolveIdParamFailure } from "./adapter-types.js";
import type { Id, ValidBrand } from "../types.js";

export type { IdParamFailure };

/**
 * Options for `ParseIdPipe`. All fields are optional.
 *
 * **`onError` constraint:** NestJS `transform()` receives only `value` and `ArgumentMetadata`
 * — there is no HTTP context object. The `onError` hook must throw (or re-throw); it cannot
 * write a response inline the way Hono/Express hooks can.
 */
export type IdParamOptions = {
  /**
   * Called instead of throwing when provided. The hook **must** throw or re-throw — it cannot
   * return a response because `PipeTransform.transform` has no HTTP context.
   */
  onError?: (failure: IdParamFailure) => never;
  /**
   * Remap the default HTTP status for a failure reason without a full handler.
   * e.g. `{ brand_mismatch: 400 }` treats both failure kinds as 400.
   */
  status?: { brand_mismatch?: number; malformed?: number };
};

/**
 * NestJS pipe that validates an untrusted route param against a codec via `safeParse`.
 *
 * Marked `@Injectable()` via `Injectable()(ParseIdPipe)` at module load time, making it
 * available for NestJS DI.
 *
 * **Default (no options):** throws `NotFoundException` (404) for brand mismatches and
 * `BadRequestException` (400) for malformed IDs.
 *
 * **`options.status`:** remaps the default HTTP status for a reason; when the resolved status
 * differs from the default, the pipe throws `HttpException(reason, status)`.
 *
 * **`options.onError`:** escape hatch for custom error handling. The hook must throw — it
 * cannot return a response because `PipeTransform.transform` has no HTTP context.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing ID → `reason: "malformed"`, default 400**
 *
 * @example
 * ```ts
 * import { ParseIdPipe } from "@smonn/ids/nestjs";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * @Controller("users")
 * class UsersController {
 *   @Get(":id")
 *   findOne(@Param("id", new ParseIdPipe(usr)) id: Id<"usr">) {
 *     return { id }; // Id<"usr">, canonical
 *   }
 * }
 * ```
 */
export class ParseIdPipe<Brand extends ValidBrand> implements PipeTransform<unknown, Id<Brand>> {
  private readonly codec: IdCodec<Brand>;
  private readonly options: IdParamOptions | undefined;

  constructor(codec: IdCodec<Brand>, options?: IdParamOptions) {
    this.codec = codec;
    this.options = options;
  }

  transform(value: unknown, _metadata: ArgumentMetadata): Id<Brand> {
    const result = this.codec.safeParse(value);
    if (!result.ok) {
      const failure = resolveIdParamFailure(result.error, this.options);
      if (this.options?.onError) {
        this.options.onError(failure);
      }
      if (failure.reason === "brand_mismatch" && failure.status === 404) {
        throw new NotFoundException();
      }
      if (failure.reason === "malformed" && failure.status === 400) {
        throw new BadRequestException();
      }
      throw new HttpException(failure.reason, failure.status);
    }
    return result.id;
  }
}

// Apply @Injectable() metadata so ParseIdPipe participates in NestJS DI when provided as a class.
// Using a call instead of the @Injectable() decorator syntax to remain compatible with
// TypeScript projects that do not enable experimentalDecorators.
Injectable()(ParseIdPipe as unknown as new (...args: unknown[]) => unknown);
