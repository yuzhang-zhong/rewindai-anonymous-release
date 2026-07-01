import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appUrl = process.env.REWINDAI_APP_URL || 'http://127.0.0.1:5173';
const gameUrl = process.env.REWINDAI_GAME_URL || 'http://127.0.0.1:5174';
const apiUrl = process.env.REWINDAI_API_URL || 'http://127.0.0.1:8000';
const helpCheck = process.argv.includes('--help-check');
const quick = process.argv.slice(2).some(arg => arg === '--quick' || arg === 'quick')
  || process.env.REWINDAI_FLOW_QUICK === '1'
  || process.env.npm_config_quick === 'true';
const shotDir = join(process.env.TEMP || process.env.TMP || root, `rewindai-flow-${Date.now()}`);
mkdirSync(shotDir, { recursive: true });

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const siblingPlaywright = join(root, '..', 'Rewind-reigns', 'node_modules', 'playwright', 'index.mjs');
    try {
      return await import(pathToFileURL(siblingPlaywright).href);
    } catch (error) {
      throw new Error(
        `Playwright is required for browser flow smoke tests. Install it or run from the workspace with Rewind-reigns dependencies. ${error.message}`,
      );
    }
  }
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
  console.log(`PASS ${message}`);
}

async function waitForRegisterNavigation(page, user) {
  try {
    await page.waitForURL(url => !String(url).includes('/register'), { timeout: 90000 });
    return;
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '');
    const opening = /Opening|正在进入|加载中|Registering/i.test(body);
    if (opening) {
      await page.waitForURL(url => !String(url).includes('/register'), { timeout: 30000 });
      return;
    }
    const compactBody = body.replace(/\s+/g, ' ').slice(0, 700);
    throw new Error(`register did not leave /register for ${user}. Visible page text: ${compactBody || '<empty>'}. ${error.message}`);
  }
}

async function gotoWithRetry(page, url, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, options);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        console.warn(`WARN navigation attempt ${attempt} failed for ${url}; retrying. ${error?.message || error}`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1500));
      }
    }
  }
  throw lastError || new Error(`Navigation failed for ${url}`);
}

async function register(page, groupLabel, prefix, attempt = 1) {
  const user = `${prefix}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
  const password = 'pass1234';
  await gotoWithRetry(page, `${appUrl}/register?smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByPlaceholder('User ID').waitFor({ timeout: 60000 });
  const body = await page.locator('body').innerText();
  expect(/required group input|group input|必选研究分组|必选分组/i.test(body) && body.includes('Group 1') && body.includes('Group 2') && body.includes('Group 3'), 'register page exposes required group input');
  await page.getByText(groupLabel, { exact: true }).click();
  await page.getByPlaceholder('User ID').fill(user);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByPlaceholder('Confirm Password').fill(password);
  await page.getByRole('button', { name: /Register/i }).click();
  try {
    await waitForRegisterNavigation(page, user);
  } catch (error) {
    if (attempt < 2) {
      console.warn(`WARN register attempt ${attempt} failed for ${user}; retrying once. ${error?.message || error}`);
      return register(page, groupLabel, prefix, attempt + 1);
    }
    throw error;
  }
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  return user;
}

async function openGame(page) {
  const popupPromise = page.waitForEvent('popup', { timeout: 30000 }).catch(() => null);
  await page.getByRole('button', { name: /Launch simulation-test|启动 simulation-test/i }).first().click({ timeout: 30000 });
  const game = await popupPromise || page;
  await game.waitForURL(url => String(url).startsWith(gameUrl), { timeout: 90000 }).catch(() => {});
  await game.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
  await game.locator('input').first().waitFor({ timeout: 30000 }).catch(() => {});
  await game.waitForTimeout(1200);
  return game;
}

async function expectGameUser(game, user, label) {
  await game.waitForFunction(
    expectedUser => {
      const input = document.querySelector('input');
      return input?.value === expectedUser;
    },
    user,
    { timeout: 30000 },
  ).catch(() => {});
  const actual = await game.locator('input').first().inputValue().catch(() => '');
  if (actual !== user) {
    const url = game.url();
    throw new Error(`${label} handoff carries account to simulation-test (expected ${user}, got ${actual || '<empty>'}, url ${url})`);
  }
  expect(true, `${label} handoff carries account to simulation-test`);
}

async function returnToCockpit(page) {
  const homeButton = page.getByRole('button', { name: /^Home$/i }).first();
  if (await homeButton.isVisible().catch(() => false)) {
    await Promise.all([
      page.waitForURL(appUrl, { timeout: 45000 }).catch(() => null),
      homeButton.click({ timeout: 15000 }),
    ]);
  }
  if (page.url() !== `${appUrl}/` && page.url() !== appUrl) {
    await gotoWithRetry(page, `${appUrl}/?smokeReturn=${Date.now()}`, {
      waitUntil: 'commit',
      timeout: 45000,
    });
  }
  await page.getByRole('button', { name: /Launch simulation-test|Launch Rewind|启动|打开/i }).first().waitFor({ timeout: 60000 });
}

async function playRun(game, maxDecisions = 26) {
  const start = game.getByRole('button', { name: /Start semester|开始学期/i }).first();
  if (await start.isVisible().catch(() => false)) {
    await start.click({ timeout: 30000 });
  }
  await game.waitForTimeout(1000);
  const readDecisionCount = async () => {
    const status = await game.locator('.run-status').innerText().catch(() => '');
    const match = status.match(/(?:Decisions|决策)[^\d]*(\d+)/i);
    return match ? Number(match[1]) : 0;
  };
  let decisions = await readDecisionCount();
  for (let index = 0; index < maxDecisions; index += 1) {
    const ended = await game.getByText(/Run ended|本局结束|View run report|查看本局报告/i).first().isVisible().catch(() => false);
    if (ended) return { ended: true, decisions };
    const optionCount = await game.locator('button.hint:not([disabled])').count();
    if (!optionCount) {
      await game.waitForTimeout(600);
      continue;
    }
    const beforeDecisionCount = await readDecisionCount();
    await game.locator('button.hint:not([disabled])').nth(index % optionCount).click({ timeout: 10000 });
    await game.waitForFunction(
      previousCount => {
        const status = document.querySelector('.run-status')?.textContent || '';
        const match = status.match(/(?:Decisions|决策)[^\d]*(\d+)/i);
        const decisionCount = match ? Number(match[1]) : 0;
        const endedText = /Run ended|本局结束|View run report|查看本局报告/i.test(document.body.innerText);
        return endedText || decisionCount > previousCount;
      },
      beforeDecisionCount,
      { timeout: 15000 },
    ).catch(() => {});
    decisions = Math.max(decisions, await readDecisionCount());
    await game.waitForTimeout(180);
  }
  const status = await game.locator('.run-status').innerText().catch(() => '');
  return {
    ended: await game.getByText(/Run ended|本局结束|View run report|查看本局报告/i).first().isVisible().catch(() => false),
    decisions,
    status,
  };
}

async function verifyReport(game, label) {
  await game.getByRole('button', { name: /View run report|查看本局报告|Records|记录/i }).first().click({ timeout: 20000 });
  await game.waitForTimeout(700);
  const result = await game.evaluate(() => {
    const detail = document.querySelector('.record-detail');
    if (!detail) return { visible: false };
    const before = detail.scrollTop;
    detail.scrollTop = detail.scrollHeight;
    return {
      visible: true,
      scrollable: detail.scrollHeight > detail.clientHeight,
      scrolled: detail.scrollTop > before,
      hasTrail: /Decision trail|决策轨迹/.test(document.body.innerText),
      hasReport: /Run report|本局报告|本周报告/.test(document.body.innerText),
      hasNextStep: /continue reflection|继续反思|回到 RewindAI|return to RewindAI/i.test(document.body.innerText),
    };
  });
  await game.screenshot({ path: join(shotDir, `${label}-report.png`), fullPage: true });
  await game.getByRole('button', { name: /Close|关闭|Continue|继续/i }).first().click({ timeout: 10000 }).catch(() => {});
  expect(result.visible && result.hasTrail && result.hasReport, `${label} report opens with decision trajectory`);
  expect(result.hasNextStep, `${label} report explains next reflection/replay step`);
  expect(!result.scrollable || result.scrolled, `${label} report scrolls when content overflows`);
}

async function verifyTraceReturnedToCockpit(page, user, label) {
  await page.bringToFront().catch(() => {});
  await page.waitForFunction(
    currentUser => {
      try {
        const raw = localStorage.getItem(`rewindai.traceFallback.${currentUser}`);
        const parsed = raw ? JSON.parse(raw) : null;
        return Number(parsed?.decision_count ?? 0) > 0;
      } catch {
        return false;
      }
    },
    user,
    { timeout: 30000 },
  );
  await returnToCockpit(page);
  await page.waitForTimeout(500);
  const traceSummary = await page.evaluate(currentUser => {
    try {
      return JSON.parse(localStorage.getItem(`rewindai.traceFallback.${currentUser}`) || 'null');
    } catch {
      return null;
    }
  }, user);
  const body = await page.locator('body').innerText({ timeout: 30000 });
  expect(Number(traceSummary?.decision_count ?? 0) > 0, `${label} simulation trace returns to RewindAI local evidence`);
  expect(/trace decisions|轨迹决策|decision\(s\)|次决策|simulation-test decision/i.test(body), `${label} cockpit surfaces returned trace evidence`);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    currentUser => {
      try {
        const raw = localStorage.getItem(`rewindai.traceFallback.${currentUser}`);
        const parsed = raw ? JSON.parse(raw) : null;
        return Number(parsed?.decision_count ?? 0) > 0;
      } catch {
        return false;
      }
    },
    user,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => /trace decisions|轨迹决策|decision\(s\)|次决策|simulation-test decision|行为轨迹证据/i.test(document.body.innerText),
    null,
    { timeout: 30000 },
  );
  const refreshedBody = await page.locator('body').innerText({ timeout: 30000 });
  expect(
    /trace decisions|轨迹决策|decision\(s\)|次决策|simulation-test decision|行为轨迹证据/i.test(refreshedBody),
    `${label} cockpit still surfaces trace evidence after refresh`,
  );
}

async function flowGroup1(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const user = await register(page, 'Group 1', 'flowg1');
  const game = await openGame(page);
  await expectGameUser(game, user, 'Group 1');
  const run = await playRun(game, quick ? 64 : 80);
  expect(run.ended, `Group 1 game run reaches an ending${run.ended ? '' : ` (${run.decisions} decisions, ${run.status || 'no status'})`}`);
  await verifyReport(game, 'group1');
  await verifyTraceReturnedToCockpit(page, user, 'Group 1');
  await game.bringToFront().catch(() => {});
  await game.getByRole('button', { name: /Reflect|自我反思/i }).first().click({ timeout: 10000 });
  await game.locator('textarea.reflection-box').fill('I will protect one low resource before trying to satisfy everyone.');
  await game.getByRole('button', { name: /Start second run|开始第二轮/i }).first().click({ timeout: 10000 });
  await game.locator('.choice-card').first().waitFor({ timeout: 45000 }).catch(async () => {
    const body = await game.locator('body').innerText().catch(() => '');
    throw new Error(`Group 1 reflection starts second run (visible text: ${body.replace(/\s+/g, ' ').slice(0, 700) || '<empty>'})`);
  });
  expect(true, 'Group 1 reflection starts second run');
  await game.close().catch(() => {});
  await page.close().catch(() => {});
}

async function flowGroup2(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const user = await register(page, 'Group 2', 'flowg2');
  const game = await openGame(page);
  await expectGameUser(game, user, 'Group 2');
  const run = await playRun(game, quick ? 64 : 80);
  expect(run.ended, `Group 2 game run reaches an ending${run.ended ? '' : ` (${run.decisions} decisions, ${run.status || 'no status'})`}`);
  await verifyReport(game, 'group2');
  await verifyTraceReturnedToCockpit(page, user, 'Group 2');
  await game.bringToFront().catch(() => {});
  await game.getByRole('button', { name: /AI Reflect|通用反思/i }).first().click({ timeout: 10000 });
  const panelText = await game.locator('.advisor-panel').innerText({ timeout: 10000 });
  expect(/game report only|不读取自传|no biography\/graph/i.test(panelText), 'Group 2 reflection states game-report-only boundary');
  if (!quick) {
    await game.getByRole('button', { name: /Generate general AI reflection|生成通用 AI 反思/i }).click({ timeout: 10000 });
    await game.waitForFunction(() => /General AI reflection saved|通用 AI 反思已保存|Unable|失败|failed/i.test(document.body.innerText), null, { timeout: 80000 }).catch(() => {});
    const after = await game.locator('.advisor-panel').innerText().catch(() => '');
    expect(/General AI reflection saved|通用 AI 反思已保存/i.test(after), 'Group 2 general AI reflection saves');
  }
  await game.close().catch(() => {});
  await page.close().catch(() => {});
}

async function flowGroup3(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const user = await register(page, 'Group 3', 'flowg3');
  await page.getByRole('button', { name: /Start interview|开始访谈/i }).first().click();
  await page.waitForURL(/user_chat/, { timeout: 60000 });
  await page.waitForFunction(
    () => /Interview progress|访谈进度|Stage 1\/3|第 1\/3 阶段/i.test(document.body.innerText),
    null,
    { timeout: 60000 },
  ).catch(async () => {
    const body = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Group 3 interview shows progress card (visible text: ${body.replace(/\s+/g, ' ').slice(0, 700) || '<empty>'})`);
  });
  expect(true, 'Group 3 interview shows progress card');
  await page.locator('textarea').last().fill('A pivotal decision was whether to set a boundary with a teammate. I wanted harmony, but the workload was becoming unfair.');
  const startTime = Date.now();
  await page.getByRole('button', { name: /Send|发送/i }).last().click();
  await page.waitForFunction(() => !/Loading|加载中/.test(document.body.innerText), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1000);
  expect(Date.now() - startTime < 90000, 'Group 3 interview response returns before timeout');
  const interviewBodyAfterAnswer = await page.locator('body').innerText();
  expect(/answers:\s*1|1 answer|已分享 1|回答轮数:\s*1|Last answer|上一条回答/i.test(interviewBodyAfterAnswer), 'Group 3 interview progress updates after answer');
  expect(/Minimum complete: you can finish now|最低条件已满足/i.test(interviewBodyAfterAnswer), 'Group 3 interview explains finish is available after one answer');
  await page.locator('.storysage-end-session button').first().click();
  await page.getByRole('button', { name: /Yes|确定|是/i }).last().click({ timeout: 10000 }).catch(async () => page.keyboard.press('Enter'));
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: /Continue to biography|继续生成自传/i }).last().click({ timeout: 30000 });
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /Generate biography|生成自传并继续/i }).last().click({ timeout: 30000 });
  await page.waitForURL(/biography/, { timeout: 180000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  expect(/Biography|自传|Interview-Based Draft|boundary|teammate|harmony/i.test(await page.locator('body').innerText()), 'Group 3 biography page opens after ending interview');
  await returnToCockpit(page);
  const game = await openGame(page);
  await expectGameUser(game, user, 'Group 3');
  const run = await playRun(game, quick ? 64 : 80);
  expect(run.ended, `Group 3 game run reaches an ending${run.ended ? '' : ` (${run.decisions} decisions, ${run.status || 'no status'})`}`);
  await verifyTraceReturnedToCockpit(page, user, 'Group 3');
  await game.bringToFront().catch(() => {});
  await game.getByRole('button', { name: /Clone/i }).first().click({ timeout: 10000 }).catch(() => {});
  await game.waitForTimeout(800);
  const cloneBody = await game.locator('body').innerText().catch(() => '');
  expect(/Clone Decision Advisor|Clone imitation protocol|Clone 模仿协议/i.test(cloneBody), 'Group 3 clone advisor opens after game');
  expect(/same-question|同题|similarity|相似度|agreement|一致/i.test(cloneBody), 'Group 3 clone advisor explains same-question similarity');
  await game.close().catch(() => {});
  await page.close().catch(() => {});
}

async function flowAnonymous(browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  await gotoWithRetry(page, `${gameUrl}/?smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  expect(await page.getByRole('button', { name: /Anonymous start|匿名开始/i }).first().isVisible().catch(() => false), 'standalone simulation-test exposes anonymous start');
  await page.getByRole('button', { name: /Anonymous start|匿名开始/i }).first().click();
  await page.waitForTimeout(1200);
  expect(await page.locator('.choice-card').first().isVisible().catch(() => false), 'anonymous simulation-test starts a playable game');
  await page.close().catch(() => {});
}

async function flowLogout(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const user = await register(page, 'Group 1', 'flowlo');
  await page.evaluate(currentUser => {
    localStorage.setItem(`rewindai.traceFallback.${currentUser}`, JSON.stringify({ available: true, trace_count: 1, decision_count: 3, summary: 'test' }));
    localStorage.setItem(`rewindai-chat-history:${currentUser}`, JSON.stringify([{ id: 'm', content: 'test', created_at: new Date().toISOString(), role: 'User' }]));
    localStorage.setItem(`rewindai-biography:${currentUser}`, JSON.stringify({ title: 'test', subsections: {} }));
  }, user);
  await page.getByRole('button', { name: /Logout|退出/i }).click({ timeout: 20000 });
  await page.waitForURL(/login/, { timeout: 60000 });
  const cleared = await page.evaluate(currentUser => ({
    trace: !localStorage.getItem(`rewindai.traceFallback.${currentUser}`),
    chat: !localStorage.getItem(`rewindai-chat-history:${currentUser}`),
    biography: !localStorage.getItem(`rewindai-biography:${currentUser}`),
    demoCredential: !JSON.parse(localStorage.getItem('rewindai-demo-credentials') || '{}')[currentUser],
  }), user);
  expect(cleared.trace && cleared.chat && cleared.biography && cleared.demoCredential, 'logout clears current-user local evidence caches');
  await page.close().catch(() => {});
}

async function verifyHealth() {
  let response = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(`${apiUrl}/health`);
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        console.warn(`WARN StorySage API health attempt ${attempt} failed; retrying. ${error?.message || error}`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1500));
      }
    }
  }
  if (!response) {
    throw lastError || new Error('StorySage API health endpoint did not respond');
  }
  expect(response.ok, 'StorySage API health endpoint responds');
  const health = await response.json();
  if (health?.runtime?.warnings?.length) {
    console.log(`WARN health warnings: ${health.runtime.warnings.join(' | ')}`);
  }
}

const { chromium } = await loadPlaywright();
if (helpCheck) {
  console.log('PASS RewindAI online user-flow smoke script loaded Playwright successfully.');
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });

try {
  await verifyHealth();
  await flowGroup1(browser);
  await flowGroup2(browser);
  await flowGroup3(browser);
  await flowAnonymous(browser);
  await flowLogout(browser);
  console.log(`\nPASS RewindAI online user-flow smoke completed. Screenshots: ${shotDir}`);
} finally {
  await browser.close();
}
