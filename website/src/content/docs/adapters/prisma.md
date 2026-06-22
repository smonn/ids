---
title: Prisma adapter
description: Read/write transforms for integrating Id<Brand> with Prisma's $extends model.
---

`@smonn/ids/prisma` provides a read/write transform pair for integrating
`Id<Brand>` with Prisma's `$extends` extension model. It requires
`@prisma/client` as an **optional peer dependency**.

```bash
pnpm add @prisma/client
```

```ts
import { idField } from "@smonn/ids/prisma";
import { createTimestampId } from "@smonn/ids";
import type { Id } from "@smonn/ids";

const usr = createTimestampId("usr");
const userIdField = idField(usr);

const xprisma = prisma.$extends({
  result: {
    user: {
      id: {
        needs: { id: true },
        compute(user) {
          return userIdField.read(user.id) as Id<"usr">; // cast required — see below
        },
      },
    },
  },
});

// Write path: Id<Brand> is already canonical — pass it directly
await xprisma.user.create({ data: { id: userIdField.write(usr.generate()), name: "Alice" } });
```

`idField(codec)` works with any codec variant.

- **Write path:** `write` is an identity function — `Id<Brand>` is already
  canonical.
- **Read path:** values are normalised via `codec.safeParse()`. An unrecognised
  value throws at read time so corrupt data surfaces immediately.

:::caution[Prisma casting caveat]
Prisma's `$extends` result component can add typed computed accessors but cannot
retroactively re-type an existing schema field at the Prisma Client level. The
`read` function asserts `Id<Brand>` at the TypeScript level, but Prisma's
generated types won't reflect this branding — callers need an explicit
`as Id<"brand">` cast at consumption sites. This is a Prisma type-system
constraint, not a library limitation.
:::
