---
"@smonn/ids": minor
---

Add `Codec.toJsonSchema()` for exporting a brand's IDs as a JSON Schema fragment, ready to drop into an OpenAPI `components.schemas` entry, a JSON Schema document, or any tooling that derives sample payloads. It returns `{ type: "string", pattern, description, example }`, where `pattern` is anchored and brand-specific (e.g. `"^usr_[0-9a-hjkmnp-tv-z]{26}$"`) and `example` is a freshly generated canonical ID.

The `pattern` describes the **canonical wire form only** — it matches `generate()` output and what `is()` accepts, but rejects the uppercase and Crockford-alias (`o`, `i`, `l`) input that `safeParse()` tolerates. Per ADR-0003, lenient normalisation is the codec's boundary job; artefacts that describe data at rest describe the canonical shape. The return type is exported as `JsonSchema` so consumers can type their OpenAPI builders.
