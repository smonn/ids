---
"@smonn/ids": patch
---

Replace ASCII-delimiter framing with length-prefix framing in the Wrapped key codec HMAC message. This is a wire-breaking change for pre-1.0 consumers of the Wrapped key codec: existing wrapped IDs produced before this change will fail verification after upgrading. The new framing (`len32(brand) ‖ brand ‖ len32(kind) ‖ kind ‖ lane`) makes domain separation structural rather than regex-dependent, hardening against a latent cross-domain MAC collision that could arise if the brand grammar were ever widened.
