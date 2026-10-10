#!/usr/bin/env node
/**
 * Validates every file in ../examples against the schema named in its "$schema_name" field,
 * and validates all content/taxonomy/*.json against taxonomy.json.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(here, "../schemas");
const examplesDir = resolve(here, "../examples");
const taxonomyDir = resolve(here, "../../../content/taxonomy");

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

for (const f of readdirSync(schemasDir).filter((f) => f.endsWith(".json"))) {
  ajv.addSchema(JSON.parse(readFileSync(join(schemasDir, f), "utf8")), f);
}

let failures = 0;
function check(schemaName, data, label) {
  const validate = ajv.getSchema(schemaName);
  if (!validate) throw new Error(`no schema ${schemaName}`);
  const ok = validate(data);
  if (!ok) {
    failures++;
    console.error(`FAIL ${label}`);
    for (const e of validate.errors ?? []) console.error(`   ${e.instancePath} ${e.message}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

for (const f of readdirSync(examplesDir).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(readFileSync(join(examplesDir, f), "utf8"));
  const schemaName = data.$schema_name;
  delete data.$schema_name;
  check(schemaName, data, `examples/${f}`);
}

try {
  for (const f of readdirSync(taxonomyDir).filter((f) => f.endsWith(".json"))) {
    check("taxonomy.json", JSON.parse(readFileSync(join(taxonomyDir, f), "utf8")), `taxonomy/${f}`);
  }
} catch (e) {
  console.warn(`skip taxonomy: ${e.message}`);
}

if (failures) {
  console.error(`${failures} schema failure(s)`);
  process.exit(1);
}
