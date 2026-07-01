import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const appUrl = process.env.REWINDAI_APP_URL || 'http://127.0.0.1:5173';
const apiUrl = process.env.REWINDAI_API_URL || 'http://127.0.0.1:8000';

function expect(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import(pathToFileURL(join(process.cwd(), '..', 'Rewind-reigns', 'node_modules', 'playwright', 'index.mjs')).href);
  }
}

const response = await fetch(`${apiUrl}/admin/participants`);
let payload = {};
try {
  payload = await response.json();
} catch {
  payload = {};
}
const healthResponse = await fetch(`${apiUrl}/health`);
let health = {};
try {
  health = await healthResponse.json();
} catch {
  health = {};
}

expect(response.status === 403, 'admin participants endpoint is protected by configured token');
expect(payload.detail === 'Invalid admin token.', 'admin participants rejects missing token without exposing internals');

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${appUrl}/admin?smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('body').waitFor({ timeout: 30000 });
  await page.waitForFunction(
    () => document.body.innerText.includes('Ephemeral database runtime'),
    null,
    { timeout: 10000 },
  ).catch(() => {});
  const body = await page.locator('body').innerText({ timeout: 10000 });
  expect(
    body.includes('Participant records') || body.includes('研究数据收集后台') || body.includes('Study collection dashboard'),
    'admin page loads participant records dashboard'
  );
  expect(
    body.includes('Privacy boundary') || body.includes('隐私边界'),
    'admin page explains privacy boundary'
  );
  const usesEphemeralDatabase = Boolean(health?.runtime?.database?.sqlite);
  const usesLocalMiroFish = Boolean(
    health?.runtime?.mirofish?.base_url_is_local || health?.runtime?.mirofish?.graph_sync_enabled === false,
  );
  expect(
    !usesEphemeralDatabase || body.includes('Ephemeral database runtime'),
    'admin page surfaces demo-storage warning when needed'
  );
  expect(
    !usesLocalMiroFish || body.includes('MiroFish native sync is not online'),
    'admin page surfaces graph backend warning when needed'
  );
} finally {
  await browser.close();
}

console.log('\nPASS RewindAI admin smoke completed.');
