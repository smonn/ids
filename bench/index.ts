import { do_not_optimize, measure } from "mitata";
import { decodeBase32, encodeBase32 } from "../src/base32.js";
import { createTimestampId } from "../src/timestamp.js";
import { createOpaqueTimestampId, importOpaqueKey } from "../src/opaque.js";
import { createReverseTimestampId } from "../src/reverse.js";
import { createWrappedKeyId, importWrappingKey } from "../src/wrapped.js";
import { createSignedTimestampId, importSigningKey } from "../src/signed.js";
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

// Pre-import the signing key once; bench measures steady-state HMAC cost, not key import.
const signingKey = await importSigningKey(new Uint8Array(32));
const sgn = createSignedTimestampId("sgn", { keys: [signingKey] });
const signedId = await sgn.generate();

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
//     compare.ts's 30% (default) and 50% (async-crypto) fail thresholds; beyond that, more samples measure
//     the machine, not the code. Lowered from 2000 to 500.
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
