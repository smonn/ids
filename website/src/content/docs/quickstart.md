---
title: Quickstart
description: Install @smonn/ids and mint your first branded, type-safe, time-sortable ID.
---

## Install

```bash
pnpm add @smonn/ids
```

## Mint an ID

```ts
import { createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");
const id = users.generate(); // "usr_06f80z92d2dbsqqg28t5cy4tqg"
```

Each ID is a three-letter brand, an underscore, then 26 Crockford base32
characters of payload. The brand tells you what kind of thing the ID refers to
without an out-of-band lookup — no leaking row counts via sequential PKs, no
"is this a user or an org?" ambiguity in a stack trace.

## Get type safety for free

`Id<Brand>` is nominally tagged. `Id<"usr">` and `Id<"org">` are not
interchangeable — even though both are strings at runtime, the type system
treats them as distinct.

```ts
import { type Id, createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");
const orgs = createTimestampId("org");

function loadUser(id: Id<"usr">) {
  /* ... */
}

loadUser(orgs.generate()); // ❌ Type 'Id<"org">' is not assignable to 'Id<"usr">'.
```

## Validate input at the boundary

`safeParse` accepts mixed case and the Crockford visual aliases (`o → 0`,
`i → 1`, `l → 1`), and always returns the **canonical form**:

```ts
const r = users.safeParse(input);

if (!r.ok) {
  switch (r.error) {
    case "not_string":
      return 400; // wasn't a string at all
    case "invalid_prefix":
      return 404; // wrong kind of ID (or not an ID)
    case "invalid_base32":
      return 400; // prefix matched but payload is malformed
  }
}

const userId = r.id; // Id<"usr">, canonical
```

## Next steps

- **[Choosing a codec](/codecs/choosing/)** — pick the right variant for your use case.
- **[Timestamp codec](/codecs/timestamp/)** — the full default-codec surface: sorting, backfills, validation, JSON Schema, and error handling.
- **[Playground](/playground/)** — try every codec live in your browser.
