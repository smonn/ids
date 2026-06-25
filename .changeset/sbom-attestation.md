---
"@smonn/ids": patch
---

Publish the release SBOM as a signed CycloneDX attestation
(`actions/attest-sbom`) bound to the published package, instead of
uploading it as a GitHub release asset — release assets are rejected now
that the repo uses immutable releases.
