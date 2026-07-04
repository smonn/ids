import { do_not_optimize, measure } from "mitata";
import { decodeBase32, encodeBase32 } from "../src/wire/base32.js";
import { createTimestampId } from "../src/codecs/timestamp/index.js";
import { createOpaqueTimestampId, importOpaqueKey } from "../src/codecs/opaque/index.js";
import { createReverseTimestampId } from "../src/codecs/reverse/index.js";
import { createWrappedKeyId, importWrappingKey } from "../src/codecs/wrapped/index.js";
import { createSignedTimestampId, importSigningKey } from "../src/codecs/signed/index.js";
import { createDigestId, importDigestKey } from "../src/codecs/digest/index.js";
import { writeIdColumn } from "../src/adapters/adapter-types.js";
import type { Id } from "../src/types.js";

const usr = createTimestampId("usr");
const rev = createReverseTimestampId("rev");

const canonicalId = usr.parse("usr_01h7b3k9rqxn1cw3p9r8t2sgkw") as Id<"usr">;
const reverseId = rev.generate();
const lenientInput = "USR_OIh7b3k9rqxnIcw3p9r8t2sgkw";
const base32Payload = canonicalId.slice("usr_".length);

const bytesPayload = new Uint8Array(16);
for (let i = 0; i < 16; i++) bytesPayload[i] = (i * 17) & 0xff;

// Pre-import the AES key once; bench measures steady-state codec cost, not key import.
const opaqueKey = await importOpaqueKey(new Uint8Array(16));
const opa = createOpaqueTimestampId("opa", { key: opaqueKey });
const opaqueId = await opa.generate();

// Pre-import the wrapping key once; bench measures steady-state codec cost (AES + HMAC), not key import.
// u32 is the representative kind; u64/bigint is a separate integer lane but the crypto path is identical.
const wrappingKey = await importWrappingKey(new Uint8Array(32));
const wrp = createWrappedKeyId("wrp", { kind: "u32", keys: [wrappingKey] });
const wrappedId = await wrp.wrap(42);

// Non-matching wrapping keys for multi-key keyring trial scenarios (distinct raw bytes → distinct tags).
const wrappingKeyA = await importWrappingKey(new Uint8Array(32).fill(0xaa));
const wrappingKeyB = await importWrappingKey(new Uint8Array(32).fill(0xbb));
const wrappingKeyC = await importWrappingKey(new Uint8Array(32).fill(0xcc));
// 3-key wrapping keyring — matching key in last position (worst-case trial order).
const wrp3 = createWrappedKeyId("wrp", {
  kind: "u32",
  keys: [wrappingKeyA, wrappingKeyB, wrappingKey],
  allowDuplicateBrand: true,
});
// No-match wrapping keyring — all three trials fail; safeUnwrap returns failure without throwing.
const wrpNoMatch = createWrappedKeyId("wrp", {
  kind: "u32",
  keys: [wrappingKeyA, wrappingKeyB, wrappingKeyC],
  allowDuplicateBrand: true,
});

// Pre-import the signing key once; bench measures steady-state HMAC cost, not key import.
const signingKey = await importSigningKey(new Uint8Array(32));
const sgn = createSignedTimestampId("sgn", { keys: [signingKey] });
const signedId = await sgn.generate();

// Non-matching signing keys for multi-key keyring trial scenarios (distinct raw bytes → distinct tags).
const signingKeyA = await importSigningKey(new Uint8Array(32).fill(0xaa));
const signingKeyB = await importSigningKey(new Uint8Array(32).fill(0xbb));
const signingKeyC = await importSigningKey(new Uint8Array(32).fill(0xcc));
// 3-key signing keyring — matching key in last position (worst-case trial order).
const sgn3 = createSignedTimestampId("sgn", {
  keys: [signingKeyA, signingKeyB, signingKey],
  allowDuplicateBrand: true,
});
// No-match signing keyring — all three trials fail; safeVerify returns failure without throwing.
const sgnNoMatch = createSignedTimestampId("sgn", {
  keys: [signingKeyA, signingKeyB, signingKeyC],
  allowDuplicateBrand: true,
});

// Pre-import the digest key once; bench measures steady-state HMAC cost, not key import.
const digestKey = await importDigestKey(new Uint8Array(32));
const dgst = createDigestId("dgs", { ns: "bench", key: digestKey });

// Rejection-path inputs: wrong brand prefix and invalid base32 payload character.
const wrongBrandString = "org_01h7b3k9rqxn1cw3p9r8t2sgkw";
const malformedPayload = "usr_!1h7b3k9rqxn1cw3p9r8t2sgkw";

type Case =
  | { name: string; fn: () => unknown; async?: false }
  | { name: string; fn: () => Promise<unknown>; async: true };

const cases: Case[] = [
  { name: "generate", fn: () => usr.generate() },
  { name: "is(canonical)", fn: () => usr.is(canonicalId) },
  { name: "parse(canonical)", fn: () => usr.parse(canonicalId) },
  { name: "safeParse(canonical)", fn: () => usr.safeParse(canonicalId) },
  { name: "safeParse(lenient)", fn: () => usr.safeParse(lenientInput) },
  { name: "extractTimestamp", fn: () => usr.extractTimestamp(canonicalId) },
  { name: "encodeBase32", fn: () => encodeBase32(bytesPayload) },
  { name: "decodeBase32", fn: () => decodeBase32(base32Payload) },
  { name: "writeIdColumn", fn: () => writeIdColumn(usr, canonicalId) },
  { name: "reverse.generate", fn: () => rev.generate() },
  { name: "reverse.extractTimestamp", fn: () => rev.extractTimestamp(reverseId) },
  { name: "opaque.generate", fn: () => opa.generate(), async: true },
  { name: "opaque.extractTimestamp", fn: () => opa.extractTimestamp(opaqueId), async: true },
  // wrapped.* use AES-block + HMAC on the hot path; same async-crypto variance handling as opaque.*
  { name: "wrapped.wrap", fn: () => wrp.wrap(42), async: true },
  { name: "wrapped.unwrap", fn: () => wrp.unwrap(wrappedId), async: true },
  // signed.* use HMAC-SHA-256 on the hot path; same async-crypto variance handling as opaque.* / wrapped.*
  { name: "signed.generate", fn: () => sgn.generate(), async: true },
  { name: "signed.verify", fn: () => sgn.verify(signedId), async: true },
  { name: "signed.safeVerify(success)", fn: () => sgn.safeVerify(signedId), async: true },
  // digest.* uses HMAC-SHA-256 async crypto; same async-bench variance handling as opaque.* / wrapped.* / signed.*
  { name: "digest.digest", fn: () => dgst.digest("bench-material"), async: true },
  // Multi-key trial: wrapped.* — 3-key keyring last-match and no-match (measures linear trial cost)
  { name: "wrapped.unwrap(3-key-last)", fn: () => wrp3.unwrap(wrappedId), async: true },
  { name: "wrapped.unwrap(no-match)", fn: () => wrpNoMatch.safeUnwrap(wrappedId), async: true },
  // Multi-key trial: signed.* — 3-key keyring last-match and no-match (measures linear trial cost)
  { name: "signed.verify(3-key-last)", fn: () => sgn3.verify(signedId), async: true },
  { name: "signed.verify(no-match)", fn: () => sgnNoMatch.safeVerify(signedId), async: true },
  // Rejection-path: is()/safeParse() on wrong-brand and invalid-base32 input
  { name: "is(non-matching)", fn: () => usr.is(wrongBrandString) },
  { name: "safeParse(invalid-prefix)", fn: () => usr.safeParse(wrongBrandString) },
  { name: "safeParse(invalid-base32)", fn: () => usr.safeParse(malformedPayload) },
];

type Bench = {
  name: string;
  avg_ns: number;
  min_ns: number;
  p50_ns: number;
  p75_ns: number;
  p99_ns: number;
  samples: number;
};

const results: Bench[] = [];

// Pin sample counts per op class. The two classes batch differently under mitata,
// so a single count can't serve both:
//
//   - Sync ns-scale ops (generate, parse, base32, reverse.*) are batched: every
//     "sample" is already the mean of 4096 individual calls. A few hundred such
//     batch-means pin the p50 to well within compare.ts's 15% warn threshold
//     (measured run-to-run drift <1%), so SYNC_SAMPLES stays low — each extra
//     sample is 4096 real calls, and these ops are the entire wall-clock cost.
//   - Async crypto ops (opaque.* / wrapped.* / signed.*) are NOT batched: mitata
//     runs one real call per sample (~70–250µs each). On a shared CI runner,
//     OS scheduler and thermal jitter (~0.8 ms/sample floor even for a no-op)
//     dominate variance — not statistical accuracy — so a high sample count buys
//     nothing except wall-clock time. 300–500 samples are sufficient given
//     compare.ts's 30% (default) and 50% (async crypto ops) fail thresholds;
//     beyond that, more samples measure the machine, not the code.
const SYNC_SAMPLES = 256;
const ASYNC_SAMPLES = 500;
const syncOpts = { min_samples: SYNC_SAMPLES, max_samples: SYNC_SAMPLES } as const;
const asyncOpts = { min_samples: ASYNC_SAMPLES, max_samples: ASYNC_SAMPLES } as const;

for (const c of cases) {
  const stats = await measure(
    function* () {
      if (c.async) {
        const fn = c.fn;
        yield async () => do_not_optimize(await fn());
      } else {
        const fn = c.fn;
        yield () => do_not_optimize(fn());
      }
    },
    c.async ? asyncOpts : syncOpts,
  );
  results.push({
    name: c.name,
    avg_ns: stats.avg,
    min_ns: stats.min,
    p50_ns: stats.p50,
    p75_ns: stats.p75,
    p99_ns: stats.p99,
    samples: stats.samples?.length ?? stats.ticks ?? 0,
  });
}

const output = {
  schema: 1,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  benches: results,
};

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
