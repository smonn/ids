import type { TimestampOptions } from "../codecs/timestamp/index.js";

export type RunOpts = {
  argv: ReadonlyArray<string>;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
  now?: TimestampOptions["now"];
  rng?: TimestampOptions["rng"];
  /** Defaults to `process.env`. Injected in tests for `IDS_KEY`. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Read all of stdin as a UTF-8 string. Injected in tests; defaults to process.stdin in generate. */
  readStdin?: () => Promise<string>;
};

export type CommandHandler = (args: ReadonlyArray<string>, opts: RunOpts) => Promise<number>;
