import type { TimestampOptions } from "../codecs/timestamp/index.js";

export type RunOpts = {
  argv: ReadonlyArray<string>;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
  now?: TimestampOptions["now"];
  rng?: TimestampOptions["rng"];
  /** Defaults to `process.env`. Injected in tests for key env vars. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Read all of stdin as a UTF-8 string. Injected in tests; defaults to process.stdin (batch inspect, digest material). */
  readStdin?: () => Promise<string>;
  /** Read a key file's contents. Injected in tests; defaults to node:fs/promises in key resolution. */
  readFile?: (path: string) => Promise<string>;
  /** The package version, surfaced by `ids --version`. Injected by the binary entry point. */
  version?: string;
};

/** Handles one fully-resolved command invocation (a codec verb or a top-level command). */
export type VerbHandler = (argv: ReadonlyArray<string>, opts: RunOpts) => Promise<number>;

/** A codec's CLI surface: its name and the verbs it owns. Lives here (not in router) to avoid a router↔codec import cycle. */
export type CodecModule = {
  readonly codec: string;
  readonly verbs: Readonly<Record<string, VerbHandler>>;
};
