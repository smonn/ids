import { decodeBase32, encodeBase32 } from "./base32.js";
import { registerBrand, validateBrand } from "./registry.js";
import {
  base32CharClass,
  is,
  parse,
  payloadBase32Length,
  payloadByteLength,
  readTimestampMs,
  safeParse,
  standardValidate,
  timestampByteLength,
  writeTimestamp,
} from "./shared.js";
import type { Id, JsonSchema, ParseResult, Prefix, StandardSchemaProps } from "./types.js";

export type OpaqueOptions = {
  key: CryptoKey;
  now: () => number;
  rng: (target: Uint8Array) => void;
  allowDuplicateBrand?: boolean;
};

export type OpaqueCodec<Brand extends string> = {
  generate(): Promise<Id<Brand>>;
  generateAt(date: Date): Promise<Id<Brand>>;
  is(value: unknown): value is Id<Brand>;
  parse(value: unknown): Id<Brand>;
  safeParse(value: unknown): ParseResult<Brand>;
  extractTimestamp(id: Id<Brand>): Promise<Date>;
  toJsonSchema(): JsonSchema;
  readonly "~standard": StandardSchemaProps<Brand>;
};

const zeroIv = new Uint8Array(payloadByteLength);
const pkcsPad = 0x10;

function defaultRng(target: Uint8Array): void {
  crypto.getRandomValues(target as Uint8Array<ArrayBuffer>);
}

export function importOpaqueKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes as Uint8Array<ArrayBuffer>, "AES-CBC", false, [
    "encrypt",
    "decrypt",
  ]);
}

export function createOpaqueId<Brand extends string>(
  brand: Brand,
  opts: { key: CryptoKey } & Partial<Omit<OpaqueOptions, "key">>,
): OpaqueCodec<Brand> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);

  const key = opts.key;
  const now = opts.now ?? Date.now;
  const rng = opts.rng ?? defaultRng;
  const prefix: Prefix<Brand> = `${brand}_`;

  return {
    generate: () => generate(prefix, key, rng, now()),
    generateAt: (date: Date) => generate(prefix, key, rng, date.getTime()),
    is: (value: unknown) => is(prefix, value),
    parse: (value: unknown) => parse(prefix, value),
    safeParse: (value: unknown) => safeParse(prefix, value),
    extractTimestamp: (id: Id<Brand>) => extractTimestamp(prefix, key, id),
    toJsonSchema: () => toJsonSchema(brand, prefix),
    "~standard": {
      version: 1,
      vendor: "@smonn/ids",
      validate: (value: unknown) => standardValidate(prefix, value),
    },
  };
}

// Per-call buffers, unlike id.ts's codec-shared scratch. Reuse would be safe
// (subtle.encrypt/decrypt snapshot inputs synchronously, per WebCrypto step 2
// before the Promise returns) but subtle dominates this path — the allocation
// is <1% of total cost, not worth pinning the design to that spec detail.
async function generate<Brand extends string>(
  prefix: Prefix<Brand>,
  key: CryptoKey,
  rng: (target: Uint8Array) => void,
  ms: number,
): Promise<Id<Brand>> {
  const plaintext = new Uint8Array(payloadByteLength);
  writeTimestamp(ms, plaintext);
  rng(plaintext.subarray(timestampByteLength, payloadByteLength));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv: zeroIv }, key, plaintext),
  );
  return (prefix + encodeBase32(encrypted.subarray(0, payloadByteLength))) as Id<Brand>;
}

async function extractTimestamp<Brand extends string>(
  prefix: Prefix<Brand>,
  key: CryptoKey,
  id: Id<Brand>,
): Promise<Date> {
  const c1 = decodeBase32(id.slice(prefix.length));
  // Reconstruct C2 = AES_K(P2 XOR C1) where P2 is the PKCS#7 pad block (0x10×16).
  // CBC encrypt of (P2 XOR C1) with IV=0 yields AES_K(P2 XOR C1) as the first 16 bytes.
  const c2Input = new Uint8Array(payloadByteLength);
  for (let i = 0; i < payloadByteLength; i++) c2Input[i] = pkcsPad ^ c1[i]!;
  const c2Encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv: zeroIv }, key, c2Input),
  );
  const ciphertext = new Uint8Array(payloadByteLength * 2);
  ciphertext.set(c1, 0);
  ciphertext.set(c2Encrypted.subarray(0, payloadByteLength), payloadByteLength);
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-CBC", iv: zeroIv }, key, ciphertext),
  );
  return new Date(readTimestampMs(plaintext));
}

function toJsonSchema<Brand extends string>(brand: Brand, prefix: Prefix<Brand>): JsonSchema {
  return {
    type: "string",
    pattern: `^${prefix}${base32CharClass}{${payloadBase32Length}}$`,
    description: `Branded ID for '${brand}'`,
    // The Opaque codec cannot synchronously produce a real example (encrypt is
    // async). A deterministic structurally-valid placeholder satisfies the
    // JSON Schema contract without requiring the key at schema time.
    example: prefix + "0".repeat(payloadBase32Length),
  };
}
