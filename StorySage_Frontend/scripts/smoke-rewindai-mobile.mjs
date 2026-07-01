import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const appUrl = process.env.REWINDAI_APP_URL || 'http://127.0.0.1:5173';
const gameUrl = process.env.REWINDAI_GAME_URL || 'http://127.0.0.1:5174';
const shotDir = process.env.TEMP || process.env.TMP || process.cwd();

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import(pathToFileURL(join(process.cwd(), '..', 'Rewind-reigns', 'node_modules', 'playwright', 'index.mjs')).href);
  }
}

function expect(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

async function register(page, groupLabel, prefix) {
  const username = `${prefix}${Date.now().toString().slice(-7)}${Math.random().toString(36).slice(2, 4)}`;
  await page.goto(`${appUrl}/register?mobile=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText('Group 1', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByText(groupLabel, { exact: true }).click({ timeout: 30000 });
  await page.getByPlaceholder('User ID').fill(username);
  await page.getByPlaceholder('Password', { exact: true }).fill('password123');
  await page.getByPlaceholder('Confirm Password', { exact: true }).fill('password123');
  await Promise.all([
    page.waitForURL(url => !String(url).includes('/register'), { timeout: 60000 }),
    page.getByRole('button', { name: /^Register$/i }).click(),
  ]);
  return username;
}

async function openGame(page) {
  await page.getByRole('button', { name: /Launch simulation-test|启动 simulation-test/i }).first().waitFor({ timeout: 60000 });
  const popupPromise = page.waitForEvent('popup', { timeout: 30000 }).catch(() => null);
  await page.getByRole('button', { name: /Launch simulation-test|启动 simulation-test/i }).first().click({ timeout: 30000 });
  const game = await popupPromise || page;
  await game.waitForURL(url => String(url).startsWith(gameUrl), { timeout: 90000 }).catch(() => {});
  await game.locator('body').waitFor({ timeout: 30000 }).catch(() => {});
  await game.waitForTimeout(1200);
  return game;
}

async function playUntilRunEnds(game, maxDecisions = 100) {
  const start = game.getByRole('button', { name: /Start semester|开始学期/i }).first();
  if (await start.isVisible().catch(() => false)) await start.click({ timeout: 30000 });
  await game.waitForTimeout(800);

  let lastText = await game.locator('body').innerText({ timeout: 10000 }).catch(() => '');
  for (let index = 0; index < maxDecisions; index += 1) {
    if (await game.getByRole('button', { name: /View run report|查看本局报告/i }).first().isVisible().catch(() => false)) break;
    const choices = game.locator('button.hint:not([disabled])');
    const count = await choices.count().catch(() => 0);
    if (count < 1) {
      await game.waitForTimeout(700);
      continue;
    }
    const choice = choices.nth(index % Math.min(count, 3));
    await choice.scrollIntoViewIfNeeded().catch(() => {});
    await choice.click({ timeout: 15000 }).catch(() => {});
    await game.waitForFunction(
      previous => document.body.innerText !== previous || /View run report|查看本局报告|Run ended|本局结束/i.test(document.body.innerText),
      lastText,
      { timeout: 5000 },
    ).catch(() => {});
    await game.waitForTimeout(350);
    lastText = await game.locator('body').innerText({ timeout: 10000 }).catch(() => lastText);
  }

  const ended = await game.getByRole('button', { name: /View run report|查看本局报告/i }).first().isVisible().catch(() => false);
  if (!ended) {
    const screenshot = join(shotDir, `rewindai-mobile-failed-ending-${Date.now()}.png`);
    await game.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    const body = await game.locator('body').innerText({ timeout: 10000 }).catch(() => '');
    console.error(`Mobile game did not reach an ending. Screenshot: ${screenshot}`);
    console.error(body.slice(0, 1000));
  }
  expect(ended, 'mobile game run reaches an ending');
}

async function mobileReflectionFlow(browser, groupLabel, prefix, reflectionButton, panelPattern) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const user = await register(page, groupLabel, prefix);
  const game = await openGame(page);
  const gameUser = await game.locator('input').first().inputValue().catch(() => '');
  expect(gameUser === user, `${groupLabel} mobile handoff carries account`);

  await playUntilRunEnds(game);
  await game.getByRole('button', { name: reflectionButton }).first().click({ timeout: 15000 }).catch(() => {});
  await game.waitForTimeout(900);
  const body = await game.locator('body').innerText({ timeout: 10000 }).catch(() => '');
  expect(panelPattern.test(body), `${groupLabel} mobile reflection panel opens after first run`);

  const screenshot = join(shotDir, `rewindai-mobile-${prefix}-${Date.now()}.png`);
  await game.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  await game.close().catch(() => {});
  await page.close().catch(() => {});
}

async function mobileChineseHandoff(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const user = await register(page, 'Group 3', 'mzh');
  await page.getByText('中', { exact: true }).click({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const game = await openGame(page);
  const gameUser = await game.locator('input').first().inputValue().catch(() => '');
  const body = await game.locator('body').innerText({ timeout: 10000 }).catch(() => '');
  expect(gameUser === user, 'Group 3 Chinese mobile handoff carries account');
  expect(body.includes('校园决策模拟') && body.includes('已连接 RewindAI 账号'), 'Group 3 Chinese mobile handoff opens simulation-test in Chinese');
  await game.close().catch(() => {});
  await page.close().catch(() => {});
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
try {
  await mobileReflectionFlow(browser, 'Group 1', 'm1', /Reflect|自我反思/i, /Self Reflection|自我反思|Write your own summary|写下自己的总结/i);
  await mobileReflectionFlow(browser, 'Group 2', 'm2', /AI Reflect|通用反思/i, /General AI Reflection|通用 AI 反思|Generate general AI reflection|通用 AI 总结/i);
  await mobileChineseHandoff(browser);
  console.log('\nPASS RewindAI mobile user-flow smoke completed.');
} finally {
  await browser.close();
}
