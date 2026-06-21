---
"@smonn/ids": minor
---

Surface typed `Id<Brand>` in `idParam` return signature so downstream route handlers see `request.params[paramName]` as `Id<Brand>` without casting.

The return type is now `(request: FastifyRequest<{ Params: Record<string, Id<Brand>> }>, reply: FastifyReply) => Promise<void>`. Assigning the result to a Fastify `preHandler` slot remains backward-compatible. Consumers who store the return value in a locally-annotated variable typed as the bare `FastifyRequest` hook signature may see a TypeScript error under `--strictFunctionTypes` (contravariant parameter position); use `preHandler` assignment or type inference to avoid this.
