---
title: Drizzle adapter
description: A Drizzle custom column type bound to an @smonn/ids codec.
---

`@smonn/ids/drizzle` provides a Drizzle custom column type bound to a codec. It
requires `drizzle-orm` as an **optional peer dependency**.

```bash
pnpm add drizzle-orm
```

```ts
import { pgTable } from "drizzle-orm/pg-core";
import { idColumn } from "@smonn/ids/drizzle";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

export const users = pgTable("users", {
  id: idColumn(usr).primaryKey(),
});
// users.id is typed as Id<"usr"> end-to-end
```

`idColumn(codec)` works with any codec variant — any codec that exposes
`safeParse` satisfies the required interface (Timestamp, Opaque Timestamp,
Reverse Timestamp, Signed Timestamp, Digest, and Wrapped key codecs all qualify).

- **Write path:** `Id<Brand>` is already canonical, so it is passed to the
  driver unchanged.
- **Read path:** values are normalised via `codec.safeParse()` rather than the
  strict `is()`. Data at rest should already be canonical
  ([ADR-0003](https://github.com/smonn/ids/blob/main/docs/adr/0003-canonical-strict-is.md)),
  but `safeParse` is a safe boundary for stale non-canonical values. An
  unrecognised value throws at read time so corrupt data surfaces immediately.
