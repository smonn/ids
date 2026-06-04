import { do_not_optimize, measure } from "mitata";
import { decodeBase32, encodeBase32 } from "../src/base32.js";
import { createId } from "../src/id.js";
import type { Id } from "../src/types.js";

const usr = createId("usr");

const canonicalId = usr.parse("usr_01h7b3k9rqxn1cw3p9r8t2sgkz") as Id<"usr">;
const lenientInput = "USR_OIh7b3k9rqxnIcw3p9r8t2sgkz";
const base32Payload = canonicalId.slice("usr_".length);

const bytesPayload = new Uint8Array(16);
for (let i = 0; i < 16; i++) bytesPayload[i] = (i * 17) & 0xff;

type Case = { name: string; fn: () => unknown };

const cases: Case[] = [
  { name: "generate", fn: () => usr.generate() },
  { name: "is(canonical)", fn: () => usr.is(canonicalId) },
  { name: "parse(canonical)", fn: () => usr.parse(canonicalId) },
  { name: "safeParse(canonical)", fn: () => usr.safeParse(canonicalId) },
  { name: "safeParse(lenient)", fn: () => usr.safeParse(lenientInput) },
  { name: "extractTimestamp", fn: () => usr.extractTimestamp(canonicalId) },
  { name: "encodeBase32", fn: () => encodeBase32(bytesPayload) },
  { name: "decodeBase32", fn: () => decodeBase32(base32Payload) },
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

for (const c of cases) {
  const stats = await measure(function* () {
    const fn = c.fn;
    yield () => do_not_optimize(fn());
  });
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
