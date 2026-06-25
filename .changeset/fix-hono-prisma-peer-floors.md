---
"@smonn/ids": patch
---

Correct two peerDependencies floors that did not actually type-check against the adapter code: `hono` >=4.6.15 (the `ContentfulStatusCode` type the adapter imports lands in 4.6.15) and `@prisma/client` >=5.9.1 (the `GetPayloadResult`/`ResultArgs`/`ResultFieldDefinition` runtime types the adapter relies on are exported from 5.9.1). Caught by the new peer-dependency floor CI matrix, which installs each adapter's declared minimum and type-checks/tests against it.
