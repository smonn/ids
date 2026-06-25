---
"@smonn/ids": patch
---

Fix the release SBOM step to generate the CycloneDX SBOM natively from
`pnpm-lock.yaml` with cdxgen, instead of deriving a throwaway npm lockfile
(which crashed under npm 11 on pnpm's symlinked `node_modules`).
