import type { TimestampOptions } from "../timestamp.js";

export type RunOpts = {
  argv: ReadonlyArray<string>;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
  now?: TimestampOptions["now"];
  rng?: TimestampOptions["rng"];
  /** Defaults to `process.env`. Injected in tests for `IDS_KEY`. */
  env?: Readonly<Record<string, string | undefined>>;
};

export type CommandHandler = (args: ReadonlyArray<string>, opts: RunOpts) => Promise<number>;
