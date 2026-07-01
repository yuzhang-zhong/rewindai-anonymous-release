import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const failures = [];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertStaticHostingFile(relativePath, expectedSnippets) {
  const filePath = path.join(distDir, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`Built Rewind dist is missing ${relativePath} for portable static hosting.`);
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const snippet of expectedSnippets) {
    if (!content.includes(snippet)) {
      failures.push(`Built Rewind ${relativePath} is missing: ${snippet}`);
    }
  }
}

if (!fs.existsSync(distDir)) {
  fail("Rewind postbuild check failed: dist directory does not exist.");
}

assertStaticHostingFile("_headers", [
  "/*",
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy: strict-origin-when-cross-origin",
  "Permissions-Policy: camera=(), microphone=(), geolocation=()",
  "X-Frame-Options: DENY",
]);
assertStaticHostingFile("_redirects", ["/* /index.html 200"]);

if (failures.length > 0) {
  fail(["Rewind postbuild static-hosting check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
}

console.log("PASS Rewind postbuild static-hosting files are present in dist.");
