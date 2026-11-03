import { listMd, read, readFrontmatter } from "./lib.mjs";

const FORBIDDEN_TOOLS = [/herdr/i, /artifact/i];

export function checkFrontmatter(root) {
  const errors = [];
  const fail = (file, msg) => errors.push(`${file}: ${msg}`);

  for (const file of listMd(root, "agents")) {
    const path = `agents/${file}`;
    const fm = readFrontmatter(read(root, path));
    if (fm.error) {
      fail(path, fm.error);
      continue;
    }
    const { name, description, tools, model } = fm.data;
    if (name !== file.replace(/\.md$/, "")) fail(path, `name must equal the file name (got ${JSON.stringify(name)})`);
    if (typeof description !== "string" || !description.trim()) fail(path, "description must be a non-empty string");
    if (model !== "inherit") fail(path, `model must be "inherit" (got ${JSON.stringify(model)})`);
    if (typeof tools !== "string" || !tools.trim()) {
      fail(path, "tools must be a comma-separated string");
      continue;
    }
    const list = tools.split(",").map((t) => t.trim());
    for (const tool of list) {
      if (FORBIDDEN_TOOLS.some((re) => re.test(tool))) fail(path, `tool not allowed by design: ${tool}`);
    }
    if (["reviewer", "pr-reviewer"].includes(name) && list.includes("Edit")) fail(path, `${name} must stay read-only on code (no Edit)`);
  }

  for (const file of listMd(root, "commands")) {
    const path = `commands/${file}`;
    const fm = readFrontmatter(read(root, path));
    if (fm.error) {
      fail(path, fm.error);
      continue;
    }
    const { description } = fm.data;
    const hint = fm.data["argument-hint"];
    if (typeof description !== "string" || !description.trim()) fail(path, "description must be a non-empty string");
    if (typeof hint !== "string") fail(path, "argument-hint must be a quoted string (an unquoted `[` parses as a YAML list)");
  }

  return errors;
}
