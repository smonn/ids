import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// Guards the supply-chain policy described in issue #490: Dependabot must group
// related updates and honor a cooldown consistent with pnpm's `minimumReleaseAge`
// install cooldown. These assertions keep the two cooldowns from drifting apart.

interface DependabotGroup {
  "applies-to"?: string;
  "dependency-type"?: string;
  patterns?: string[];
  "exclude-patterns"?: string[];
}

interface DependabotUpdate {
  "package-ecosystem": string;
  directory?: string;
  schedule?: { interval?: string };
  groups?: Record<string, DependabotGroup>;
  cooldown?: {
    "default-days"?: number;
    "semver-major-days"?: number;
    "semver-minor-days"?: number;
    "semver-patch-days"?: number;
  };
}

interface DependabotConfig {
  version: number;
  updates: DependabotUpdate[];
}

interface PnpmWorkspace {
  minimumReleaseAge?: number;
}

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const config = parse(read("../.github/dependabot.yml")) as DependabotConfig;
const workspace = parse(read("../pnpm-workspace.yaml")) as PnpmWorkspace;

const npmUpdate = config.updates.find((u) => u["package-ecosystem"] === "npm");

describe("dependabot config — supply-chain policy (#490)", () => {
  it("still covers the npm and github-actions ecosystems", () => {
    const ecosystems = config.updates.map((u) => u["package-ecosystem"]);
    expect(ecosystems).toContain("npm");
    expect(ecosystems).toContain("github-actions");
  });

  it("defines at least one update group for the npm ecosystem", () => {
    expect(npmUpdate?.groups).toBeDefined();
    expect(Object.keys(npmUpdate?.groups ?? {}).length).toBeGreaterThanOrEqual(1);
  });

  it("configures an npm cooldown consistent with pnpm minimumReleaseAge", () => {
    const minutes = workspace.minimumReleaseAge;
    expect(minutes, "pnpm-workspace.yaml must set minimumReleaseAge").toBeTypeOf("number");

    const cooldownDays = npmUpdate?.cooldown?.["default-days"];
    expect(cooldownDays, "npm cooldown.default-days must be set").toBeTypeOf("number");

    // Dependabot cooldown is whole days (min 1); pnpm minimumReleaseAge is minutes.
    // The cooldown must cover at least the install-cooldown window.
    const requiredDays = Math.ceil((minutes ?? 0) / (24 * 60));
    expect(cooldownDays).toBe(requiredDays);
  });
});
