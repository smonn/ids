---
title: NestJS adapter
description: Validate route params against an @smonn/ids codec in a NestJS pipe.
---

`@smonn/ids/nestjs` provides `ParseIdPipe` — a `PipeTransform` that validates an
untrusted route param against a codec and returns the canonical `Id<Brand>` to the
handler. `@nestjs/common` is an **optional peer dependency**.

```bash
pnpm add @nestjs/common
```

```ts
import { ParseIdPipe } from "@smonn/ids/nestjs";
import { type Id, createTimestampId } from "@smonn/ids";
import { Controller, Get, Param } from "@nestjs/common";

const usr = createTimestampId("usr");
const thing = createTimestampId("thg");

@Controller("users")
class UsersController {
  @Get(":id")
  findOne(@Param("id", new ParseIdPipe(usr)) id: Id<"usr">) {
    return { id }; // Id<"usr">, canonical
  }
}

// Status remap without a full handler
@Controller("things")
class ThingsController {
  @Get(":id")
  findOne(@Param("id", new ParseIdPipe(thing, { status: { brand_mismatch: 400 } })) id: Id<"thg">) {
    return { id };
  }
}
```

- **Default error channel:** on failure the pipe throws `NotFoundException` (404) for brand
  mismatches or `BadRequestException` (400) for malformed IDs.
- **`options.onError`:** custom escape hatch — must throw or re-throw because `transform()` has
  no HTTP context to write a response inline.
- **`options.status`:** remaps the default HTTP status for a failure reason.

## `IdParamFailure` shape

The `onError` callback receives an `IdParamFailure` — a discriminated union on `reason`:

```ts
type IdParamFailure =
  | { readonly reason: "brand_mismatch"; readonly status: number }
  | { readonly reason: "malformed"; readonly status: number };
```

- `reason: "brand_mismatch"` — the ID has a valid structure but belongs to a different brand;
  default `status` is **404**.
- `reason: "malformed"` — the ID is syntactically invalid; default `status` is **400**.
- `status` reflects any override set via `options.status`, otherwise the default above.

`IdParamFailure` is re-exported from `@smonn/ids/nestjs` — no separate import is needed.

## `onError` escape hatch

Unlike Hono or Express, `PipeTransform.transform` receives only the raw value and
`ArgumentMetadata` — there is no HTTP context. The `onError` hook is therefore typed as
`(failure: IdParamFailure) => never`; it **must** throw or re-throw rather than writing a
response inline.

```ts
import { UnprocessableEntityException } from "@nestjs/common";

const pipe = new ParseIdPipe(usr, {
  onError: (failure) => {
    throw new UnprocessableEntityException(`ID invalid: ${failure.reason}`);
  },
});
```

## 400 vs 404 defaults

- **Brand mismatch** (`invalid_prefix`) → `reason: "brand_mismatch"`, status **404**. A `usr_`
  ID makes no sense on `/orders/:id` — the resource cannot exist under this route.
- **Malformed or missing ID** (`invalid_base32` / `not_string`) → `reason: "malformed"`, status
  **400**.

`ParseIdPipe` calls `safeParse` at the boundary (lenient: mixed case and Crockford aliases),
so the handler always receives a canonical, normalized `Id<Brand>`. Works with any codec
variant's structural `safeParse`.
