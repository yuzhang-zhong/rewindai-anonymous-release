import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const strict = process.argv.includes("--strict") || process.env.VERCEL === "1";

const requiredPublicUrls = [
  {
    name: "VITE_API_BASE_URL",
    value: process.env.VITE_API_BASE_URL,
    purpose: "StorySage backend API",
  },
  {
    name: "VITE_REWIND_APP_URL",
    value: process.env.VITE_REWIND_APP_URL,
    purpose: "Rewind decision simulation",
  },
];

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function collectFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (/\.(html|js|css)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isPublicHttpUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && ["http:", "https:"].includes(url.protocol) && !localHosts.has(url.hostname));
}

function isPlaceholderUrl(value) {
  const url = parseUrl(value);
  return Boolean(
    url &&
      (value.includes("<") ||
        value.includes(">") ||
        /(^|\.)example\.(com|org|net)$/i.test(url.hostname) ||
        /(^|\.)(invalid|test)$/i.test(url.hostname))
  );
}

if (!fs.existsSync(distDir)) {
  fail("StorySage postbuild check failed: dist directory does not exist.");
}

const bundle = collectFiles(distDir)
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

const failures = [];

function assertStaticHostingFile(relativePath, expectedSnippets) {
  const filePath = path.join(distDir, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`Built StorySage dist is missing ${relativePath} for portable static hosting.`);
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const snippet of expectedSnippets) {
    if (!content.includes(snippet)) {
      failures.push(`Built StorySage ${relativePath} is missing: ${snippet}`);
    }
  }
}

assertStaticHostingFile("_headers", [
  "/*",
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy: strict-origin-when-cross-origin",
  "Permissions-Policy: camera=(), microphone=(), geolocation=()",
  "X-Frame-Options: DENY",
]);
assertStaticHostingFile("_redirects", ["/* /index.html 200"]);

for (const item of requiredPublicUrls) {
  if (!item.value) {
    if (strict) {
      failures.push(`${item.name} is required after build (${item.purpose}).`);
    }
    continue;
  }

  if (!isPublicHttpUrl(item.value)) {
    failures.push(`${item.name} must be an absolute public http(s) URL. Received: ${item.value}`);
    continue;
  }

  if (isPlaceholderUrl(item.value)) {
    failures.push(`${item.name} must be a real public URL, not a placeholder. Received: ${item.value}`);
    continue;
  }

  if (!bundle.includes(item.value.replace(/\/$/, ""))) {
    failures.push(`${item.name} was not embedded in the built StorySage bundle.`);
  }
}

const forbiddenPatterns = [
  {
    label: "local StorySage API URL",
    pattern: /http:\/\/(?:localhost|127\.0\.0\.1):8000\b/i,
  },
  {
    label: "local Rewind app URL",
    pattern: /http:\/\/(?:localhost|127\.0\.0\.1):5174\b/i,
  },
  {
    label: "placeholder service URL",
    pattern: /https?:\/\/[^'"`\s)]+(?:example\.(?:com|org|net)|\.(?:invalid|test))(?:[:/]|$)/i,
  },
];

for (const item of forbiddenPatterns) {
  if (item.pattern.test(bundle)) {
    failures.push(`Built StorySage bundle still contains ${item.label}.`);
  }
}

const expectedRewind = process.env.VITE_REWIND_APP_URL?.replace(/\/$/, "");
if (expectedRewind) {
  const rewindPreviewUrls = [...bundle.matchAll(/https:\/\/mirror-reigns-[a-z0-9-]+\.vercel\.app/gi)].map(
    (match) => match[0].replace(/\/$/, "")
  );
  const staleRewindUrls = [...new Set(rewindPreviewUrls)].filter((url) => url !== expectedRewind);
  if (staleRewindUrls.length > 0) {
    failures.push(`Built StorySage bundle contains stale Rewind preview URL(s): ${staleRewindUrls.join(", ")}`);
  }
}

if (failures.length > 0) {
  fail(["StorySage postbuild bundle check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
}

console.log("PASS StorySage postbuild bundle uses verified public service URLs.");
