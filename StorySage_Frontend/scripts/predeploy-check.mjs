import fs from "node:fs";
import path from "node:path";

const strict = process.argv.includes("--strict") || process.env.VERCEL === "1";
const root = process.cwd();

const requiredPublicUrls = [
  {
    name: "VITE_API_BASE_URL",
    value: process.env.VITE_API_BASE_URL,
    purpose: "StorySage backend API"
  },
  {
    name: "VITE_REWIND_APP_URL",
    value: process.env.VITE_REWIND_APP_URL,
    purpose: "Rewind decision simulation"
  }
];

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return localHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isPlaceholderUrl(value) {
  try {
    const url = new URL(value);
    return (
      value.includes("<") ||
      value.includes(">") ||
      /(^|\.)example\.(com|org|net)$/i.test(url.hostname) ||
      /(^|\.)(invalid|test)$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

const failures = [];

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    failures.push(`${label} could not be parsed: ${error.message}`);
    return null;
  }
}

function assertVercelSecurityHeaders() {
  const vercelJsonPath = path.join(root, "vercel.json");
  if (!fs.existsSync(vercelJsonPath)) {
    failures.push("vercel.json is required so deployed StorySage pages receive security headers.");
    return;
  }

  const config = readJsonFile(vercelJsonPath, "vercel.json");
  if (!config) {
    return;
  }

  const expectedHeaders = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY",
  };

  const headerRoute = Array.isArray(config.headers)
    ? config.headers.find((route) => route && route.source === "/(.*)" && Array.isArray(route.headers))
    : null;

  if (!headerRoute) {
    failures.push("vercel.json must include a top-level catch-all headers entry for /(.*).");
    return;
  }

  const headerMap = new Map(
    headerRoute.headers
      .filter((header) => header && typeof header.key === "string")
      .map((header) => [header.key, header.value])
  );

  for (const [name, expectedValue] of Object.entries(expectedHeaders)) {
    if (headerMap.get(name) !== expectedValue) {
      failures.push(
        `vercel.json security header ${name} must be '${expectedValue}'. Received: '${headerMap.get(name) ?? ""}'`
      );
    }
  }

  const hasSpaFallback =
    Array.isArray(config.rewrites) &&
    config.rewrites.some((rewrite) => rewrite?.source === "/(.*)" && rewrite?.destination === "/index.html");
  if (!hasSpaFallback) {
    failures.push("vercel.json must include a top-level /(.*) -> /index.html rewrite for the SPA fallback.");
  }
}

for (const item of requiredPublicUrls) {
  if (!item.value) {
    failures.push(`${item.name} is required for deployed builds (${item.purpose}).`);
    continue;
  }

  if (!isHttpUrl(item.value)) {
    failures.push(`${item.name} must be an absolute http(s) URL. Received: ${item.value}`);
    continue;
  }

  if (isLocalUrl(item.value)) {
    failures.push(`${item.name} must not point to localhost/127.0.0.1 for deployed builds. Received: ${item.value}`);
    continue;
  }

  if (isPlaceholderUrl(item.value)) {
    failures.push(`${item.name} must be a real public URL, not a placeholder. Received: ${item.value}`);
  }
}

assertVercelSecurityHeaders();

if (failures.length > 0) {
  const message = [
    "StorySage deployment configuration is not ready:",
    ...failures.map((failure) => `- ${failure}`),
    "",
    "Set these variables on Vercel or pass them with --build-env before deploying.",
    "For local development only, use npm run build instead of the deployment build command."
  ].join("\n");

  if (strict) {
    console.error(message);
    process.exit(1);
  }

  console.warn(message);
} else {
  console.log("PASS StorySage deployment configuration uses public backend URLs and required Vercel security headers.");
}
