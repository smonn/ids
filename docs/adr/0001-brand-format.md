# Brand format: three lowercase a–z characters

Public-facing IDs need a short, fixed-width type identifier that humans can scan, that doesn't collide with the Crockford base32 payload, and that survives in URLs. We use exactly three lowercase a–z characters, validated at runtime: three gives 17,576 brands (more than any single app needs), lowercase removes case-normalisation from the brand portion, and excluding digits keeps the brand visually distinct from the payload. The brand width is part of the wire format — changing it invalidates every previously-issued ID.

## Considered Options

- **Variable width** — rejected: forces `split("_")` and a brand registry; parsing ambiguity
- **Alphanumeric brands** (e.g. `s3_…`) — rejected: visual collision with the payload
- **2 chars** — rejected: too few combinations as an app grows
- **4+ chars** — rejected: URL cost without scaling benefit
