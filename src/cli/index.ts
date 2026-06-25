import { runGenerate } from "./commands/generate.js";
import { runInspect } from "./commands/inspect.js";
import { runKeygen } from "./commands/keygen.js";
import type { CommandHandler, RunOpts } from "./types.js";
import { formatCliError } from "./format.js";
import { usage } from "./usage.js";

export type { RunOpts } from "./types.js";

type Command = {
  names: ReadonlyArray<string>;
  run: CommandHandler;
};

const commands: ReadonlyArray<Command> = [
  { names: ["generate", "g"], run: runGenerate },
  { names: ["inspect", "i"], run: runInspect },
  { names: ["keygen", "k"], run: runKeygen },
];

export async function run(opts: RunOpts): Promise<number> {
  try {
    const [subcommand, ...rest] = opts.argv;
    const command = commands.find((candidate) => candidate.names.includes(subcommand ?? ""));
    if (command !== undefined) return await command.run(rest, opts);
    if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
      opts.stdout(usage());
      return 0;
    }
    opts.stderr(usage());
    return 2;
  } catch (err) {
    opts.stderr(formatCliError(err) + "\n");
    return 1;
  }
}
