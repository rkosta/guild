import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export const read = (root, rel) => readFileSync(join(root, rel), "utf8");

export const listMd = (root, dir) =>
  existsSync(join(root, dir))
    ? readdirSync(join(root, dir)).filter((f) => f.endsWith(".md")).sort()
    : [];

/** Split a Markdown file into parsed YAML frontmatter and body. */
export function readFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { error: "missing or unterminated frontmatter block" };
  try {
    const data = parse(match[1]);
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { error: "frontmatter is not a YAML mapping" };
    }
    return { data, body: match[2] };
  } catch (err) {
    return { error: `invalid YAML: ${err.message.split("\n")[0]}` };
  }
}

/** Rows of the tier table (`| light | ... |`), whitespace-normalised. */
export function tierRows(text) {
  return text
    .split("\n")
    .filter((l) => /^\s*\|\s*(light|standard|complex)\s*\|/.test(l))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()).join("|"));
}
