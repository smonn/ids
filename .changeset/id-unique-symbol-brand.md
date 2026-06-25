---
"@smonn/ids": major
---

**Breaking type change:** `Id<Brand>` now uses a module-private `unique symbol` for branding instead of the publicly-named `__brand` property. The runtime string representation is unchanged. Consumers that hand-constructed `Id` values via `as { __brand: "…" }` casts must switch to `as unknown as Id<"…">`.
