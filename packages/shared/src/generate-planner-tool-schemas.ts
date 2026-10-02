import { writeFileSync } from "node:fs";
import { getPlannerToolDefinitions } from "./planner-tool-definitions.js";

const output = new URL("./planner-tool-schemas.json", import.meta.url);
writeFileSync(output, `${JSON.stringify(getPlannerToolDefinitions(), null, 2)}\n`);
