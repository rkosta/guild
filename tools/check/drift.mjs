import { existsSync } from "node:fs";
import { join } from "node:path";
import { listMd, read, tierRows } from "./lib.mjs";

const TIER_FILES = ["commands/quest.md", "commands/quest-herdr.md", "commands/quest-orca.md", "README.md", "CLAUDE.md"];

export function checkDrift(root) {
  const errors = [];

  // Tier table must be identical everywhere and never mention haiku.
  const tables = TIER_FILES.map((f) => [f, tierRows(read(root, f))]);
  const [refFile, refRows] = tables[0];
  if (refRows.length !== 3) errors.push(`${refFile}: expected 3 tier rows (light, standard, complex), found ${refRows.length}`);
  for (const [file, rows] of tables.slice(1)) {
    if (rows.join("\n") !== refRows.join("\n")) errors.push(`${file}: tier table differs from ${refFile}`);
  }
  for (const [file, rows] of tables) {
    if (rows.some((r) => /haiku/i.test(r))) errors.push(`${file}: no haiku in any tier`);
  }

  // Version: VERSION file, README title and top CHANGELOG entry must agree.
  const version = read(root, "VERSION").trim();
  const readmeVersion = read(root, "README.md").match(/^# .*?\bv(\d+\.\d+(?:\.\d+)?)/m)?.[1];
  const changelogVersion = read(root, "CHANGELOG.md").match(/^## v?(\d+\.\d+(?:\.\d+)?)/m)?.[1];
  const norm = (v) => (v && v.split(".").length === 2 ? `${v}.0` : v);
  if (norm(readmeVersion) !== version) errors.push(`README.md: title version ${readmeVersion} != VERSION ${version}`);
  if (norm(changelogVersion) !== version) errors.push(`CHANGELOG.md: top entry ${changelogVersion} != VERSION ${version}`);

  // Layout block in CLAUDE.md must list exactly the real files.
  const layout = read(root, "CLAUDE.md").match(/## Layout\s+```[^\n]*\n([\s\S]*?)```/)?.[1];
  if (!layout) {
    errors.push("CLAUDE.md: could not find the fenced block under '## Layout'");
  } else {
    const listed = new Set(
      layout.split("\n").map((l) => l.match(/^\s*([\w.-]+\.(?:md|sh))\b/)?.[1]).filter(Boolean),
    );
    const real = [
      ...listMd(root, "agents"),
      ...listMd(root, "commands"),
      "install.sh",
      "README.md",
      "CLAUDE.md",
    ];
    for (const f of real) if (!listed.has(f)) errors.push(`CLAUDE.md: layout is missing ${f}`);
    for (const f of listed) {
      const exists = ["agents", "commands", "scripts", "."].some((d) => existsSync(join(root, d, f)));
      if (!exists) errors.push(`CLAUDE.md: layout lists ${f}, which does not exist`);
    }
  }

  // install.sh deletes RETIRED agents after copying; one that still ships would be deleted on every install.
  const retired = read(root, "scripts/install.sh").match(/^RETIRED=\(([^)]*)\)/m)?.[1];
  if (retired === undefined) {
    errors.push("scripts/install.sh: could not find the RETIRED=(...) list");
  } else {
    for (const f of retired.split(/\s+/).filter(Boolean)) {
      if (existsSync(join(root, f))) errors.push(`scripts/install.sh: ${f} is listed as retired but still ships`);
    }
  }

  return errors;
}
