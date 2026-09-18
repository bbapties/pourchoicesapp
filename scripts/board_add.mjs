#!/usr/bin/env node
/**
 * Put an issue on the board and set Status / Size / Area in one go.
 *
 *   node scripts/board_add.mjs <issue#> "<Status>" ["<Size>"] ["<Area>"]
 *   node scripts/board_add.mjs 135 "Brian to test" XS "My Bar"
 *
 * Option names are the board's exact labels (docs/BOARD.md). Uses the gh CLI in .tools/gh.
 * Field and option ids are looked up every run so a renamed option never breaks it; a wrong
 * name prints the valid ones and exits 1.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const GH = path.join(process.cwd(), ".tools", "gh", "bin", "gh.exe");
const OWNER = "bbapties";
const REPO = "pourchoicesapp";
const PROJECT_NUMBER = 1;

const [issueArg, status, size, area] = process.argv.slice(2);
if (!issueArg || !status) {
  console.error('usage: node scripts/board_add.mjs <issue#> "<Status>" ["<Size>"] ["<Area>"]');
  process.exit(1);
}

function gh(args, input) {
  return execFileSync(GH, args, { encoding: "utf8", input, env: { ...process.env, GH_REPO: `${OWNER}/${REPO}` } });
}
function graphql(query, vars = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) args.push("-f", `${k}=${v}`);
  return JSON.parse(gh(args));
}

// 1. project + fields
const proj = graphql(`query { user(login:"${OWNER}"){ projectV2(number:${PROJECT_NUMBER}){ id fields(first:30){ nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }`)
  .data.user.projectV2;
const fields = Object.fromEntries(proj.fields.nodes.filter((f) => f.name).map((f) => [f.name, f]));
function optionId(fieldName, label) {
  const f = fields[fieldName];
  const o = f.options.find((x) => x.name.toLowerCase() === label.toLowerCase());
  if (!o) {
    console.error(`${fieldName}: no option "${label}". Valid: ${f.options.map((x) => x.name).join(" | ")}`);
    process.exit(1);
  }
  return o.id;
}

// 2. issue node id
const issue = JSON.parse(gh(["issue", "view", String(issueArg), "--json", "id,number,title"]));

// 3. add to the board (idempotent: returns the existing item if it is already there)
const added = graphql(`mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p, contentId:$c}){ item { id } } }`, { p: proj.id, c: issue.id });
const itemId = added.data.addProjectV2ItemById.item.id;

// 4. fields
const sets = [["Status", status], ["Size", size], ["Area", area]].filter(([, v]) => v);
for (const [name, label] of sets) {
  graphql(
    `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p, itemId:$i, fieldId:$f, value:{singleSelectOptionId:$o}}){ projectV2Item { id } } }`,
    { p: proj.id, i: itemId, f: fields[name].id, o: optionId(name, label) },
  );
}
console.log(`#${issue.number} ${issue.title} -> ${sets.map(([n, l]) => `${n}: ${l}`).join(", ")}`);
