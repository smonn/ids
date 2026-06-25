/*
  Concurrent-throughput bench for the async crypto codecs.

  The main `bench/index.ts` suite measures single-call latency (concurrency = 1),
  which is the right shape for most callers. But the buffer-pool question is only
  visible under sustained concurrency: when many wrap/unwrap calls are in flight
  at once, the single JS thread becomes the bottleneck feeding the libuv crypto
  threadpool, so per-call main-thread allocation work starts to matter.

  This harness drives the real Wrapped key codec at concurrency 1 and 64 and
  reports ops/sec, so a pooled vs fresh-allocation build can be compared on the
  actual library rather than a synthetic model. Run the same script on the base
  branch (no pool) and the experiment branch (pool) and diff the numbers.
*/

import { createWrappedKeyId, importWrappingKey } from "../src/codecs/wrapped/index.js";
import type { Id } from "../src/types.js";

const wrappingKey = await importWrappingKey(new Uint8Array(32));
const wrp = createWrappedKeyId("wrp", { kind: "u32", keys: [wrappingKey] });

// Pre-wrap a corpus of IDs for the unwrap path so we measure unwrap, not wrap.
const CORPUS = 256;
const ids: Id<"wrp">[] = [];
for (let i = 0; i < CORPUS; i++) ids.push(await wrp.wrap(i));

type Case = { name: string; fn: (i: number) => Promise<unknown> };

const cases: Case[] = [
  { name: "wrapped.wrap", fn: (i) => wrp.wrap(i & 0x7fffffff) },
  { name: "wrapped.unwrap", fn: (i) => wrp.unwrap(ids[i % CORPUS]!) },
];

async function measure(
  fn: (i: number) => Promise<unknown>,
  n: number,
  conc: number,
): Promise<number> {
  const start = process.hrtime.bigint();
  for (let i = 0; i < n; i += conc) {
    const batch: Promise<unknown>[] = [];
    for (let j = 0; j < conc && i + j < n; j++) batch.push(fn(i + j));
    await Promise.all(batch);
  }
  return Number(process.hrtime.bigint() - start) / 1e6; // ms
}

const N = 20000;
const CONCURRENCIES = [1, 64];
const REPS = 5;

type Row = { name: string; conc: number; usPerOp: number; opsPerSec: number };
const rows: Row[] = [];

for (const c of cases) {
  // warmup
  await measure(c.fn, 4000, 64);
  for (const conc of CONCURRENCIES) {
    const times: number[] = [];
    for (let r = 0; r < REPS; r++) times.push(await measure(c.fn, N, conc));
    times.sort((a, b) => a - b);
    const medianMs = times[Math.floor(REPS / 2)]!;
    rows.push({
      name: c.name,
      conc,
      usPerOp: (medianMs / N) * 1000,
      opsPerSec: (N / medianMs) * 1000,
    });
  }
}

const output = {
  schema: 1 as const,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  threadpool: process.env.UV_THREADPOOL_SIZE ?? "4 (default)",
  rows,
};
process.stdout.write(JSON.stringify(output, null, 2) + "\n");
