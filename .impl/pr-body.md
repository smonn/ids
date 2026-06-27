## Summary

- Add `makeFailingSpyCodec` to `src/adapters/test-helpers.ts` — a companion to `makeSpyCodec` whose `safeParse` returns `{ ok: false, error }` (configurable `ParseError`) and `is()` returns `false`, enabling failure-mapping contract tests for every adapter.
- Replace hand-rolled mock harnesses with real framework instances in the four web adapter test files: Express (real `express()` server via Node.js native `fetch`), Fastify (real `fastify()` via `app.inject()`), NestJS (`Test.createTestingModule` from `@nestjs/testing`), and GraphQL (minimal `GraphQLSchema` executed through `graphql()`).
- Add `@nestjs/testing` as a devDependency (also pulls in `@nestjs/core` and `rxjs`).

## Linked issue

Closes #725

## Test plan

- [x] `pnpm test` — 1546 tests, all passing
- [x] `pnpm typecheck` — no errors
- [x] `pnpm lint` — no violations
- [x] `pnpm fmt:check` — all files formatted (ran `pnpm fmt` to fix)
- [x] `pnpm depcruise` — no dependency violations (128 modules, 430 dependencies)
- [x] `pnpm test:coverage` — 100% statements / branches / functions / lines
- [x] `pnpm build` — clean build, 89 output files

## Impact checklist

- Public API: N/A — only test files and the internal `test-helpers.ts` changed; no production code modified.
- Wire format or Byte layout: N/A
- CLI behavior: N/A
- README or other docs: N/A
- Website docs: N/A
- CONTEXT.md domain vocabulary: N/A
- ADR needed or updated: N/A

## Closed design decisions

None.

---

## What each adapter test does now

**Express** — `describe("real express() app (integration)")` mounts `idParam` and `idQuery` on a real `express()` server, starts it on a random port, and drives it with Node.js native `fetch`. Tests cover: happy-path 200 with canonical Id, wrong-brand 404, malformed-ID 400 for both `idParam` and `idQuery`, and a spy-codec route that confirms the failure-mapping path returns 400 via real HTTP.

**Fastify** — `describe("real fastify() app (integration)")` registers routes on a real `fastify()` instance with `setErrorHandler` and exercises them via `app.inject()`. Covers: happy-path 200 for `idParam` and `idQuery`, wrong-brand 404, malformed-ID 400, and a failing-spy route confirming 400.

**NestJS** — `describe("ParseIdPipe — NestJS testing module (integration)")` uses `Test.createTestingModule({ controllers: [TestController], providers: [...] }).compile()` to stand up a real NestJS DI container. The `ParseIdPipe` instance is resolved via `moduleRef.get()` and tested for: happy-path canonical Id, wrong-brand `NotFoundException`, malformed-ID `BadRequestException`, and two `makeFailingSpyCodec` failure-mapping assertions. The `TestController` class has `Controller("users")` applied via function call (no decorator syntax, compatible with `erasableSyntaxOnly: true`).

**GraphQL** — `describe("idScalar — graphql() execution engine (integration)")` builds a minimal `GraphQLSchema` with an `echo` field typed as the `UserId` scalar and executes queries through the `graphql()` function. Covers: variable path (exercises `parseValue`), inline-literal path (exercises `parseLiteral`), wrong-brand error, and two `makeFailingSpyCodec` paths (one that triggers a `parseValue` error in variable coercion, one that triggers a `serialize` error in result serialisation).
