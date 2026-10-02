import process from "node:process";
import { URL } from "node:url";

let isHttps = false;
try {
  isHttps = new URL(process.env.JEVSCHEDULE_API_URL ?? "").protocol === "https:";
} catch {
  // Missing and malformed URLs are rejected by the check below.
}

if (!isHttps) {
  process.stderr.write("JEVSCHEDULE_API_URL must be an HTTPS URL for release builds\n");
  process.exitCode = 1;
}
