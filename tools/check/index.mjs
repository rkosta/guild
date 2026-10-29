import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkFrontmatter } from "./frontmatter.mjs";
import { checkDrift } from "./drift.mjs";
import { checkContract } from "./contract.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const checks = [
  ["frontmatter", checkFrontmatter],
  ["drift", checkDrift],
  ["contract", checkContract],
];

let failed = 0;
for (const [name, run] of checks) {
  const errors = run(root);
  if (errors.length === 0) {
    console.log(`ok   ${name}`);
  } else {
    failed += errors.length;
    console.log(`FAIL ${name}`);
    for (const e of errors) console.log(`  - ${e}`);
  }
}
process.exit(failed ? 1 : 0);
