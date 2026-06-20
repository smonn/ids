import { do_not_optimize, measure } from "mitata";
import { decodeBase32, encodeBase32 } from "../src/base32.js";
import { createTimestampId } from "../src/timestamp.js";
import { createOpaqueTimestampId, importOpaqueKey } from "../src/opaque.js";
import { createWrappedKeyId, importWrappingKey } from "../src/wrapped.js";
import type { Id } from "../src/types.js";

const usr = createTimestampId("usr");

const canonicalId = usr.parse("usr_01h7b3k9rqxn1cw3p9r8t2sgkz") as Id<"usr">;
const lenientInput = "USR_OIh7b3k9rqxnIcw3p9r8t2sgkz";
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
  { name: "opaque.generate", fn: () => opa.generate(), async: true },
  { name: "opaque.extractTimestamp", fn: () => opa.extractTimestamp(opaqueId), async: true },
  // wrapped.* use AES-block + HMAC on the hot path; same async-crypto variance handling as opaque.*
  { name: "wrapped.wrap", fn: () => wrp.wrap(42), async: true },
  { name: "wrapped.unwrap", fn: () => wrp.unwrap(wrappedId), async: true },
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

// Pin sample counts. Mitata batches ops under ~65µs (every op here), so each
// "sample" is the mean of 4096 individual calls. 2000 batch-means tightens the
// percentile noise on the jittery µs-scale opaque.* ops (which dominate variance)
// without the wall higher counts hit: 10k × 4096 × ~30µs ≈ 20 min for the slow
// async ops. Pair this with compare.ts's tiered thresholds; raise further only if
// the opaque.* noise floor still trips the blocking threshold.
const measureOpts = { min_samples: 2000, max_samples: 2000 } as const;

for (const c of cases) {
  const stats = await measure(function* () {
    if (c.async) {
      const fn = c.fn;
      yield async () => do_not_optimize(await fn());
    } else {
      const fn = c.fn;
      yield () => do_not_optimize(fn());
    }
  }, measureOpts);
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
