const { chromium } = require("playwright");

const { getUiSmokeScenarios, parseUiSmokeArgs } = require("../support/ui-smoke-config");
const {
  DEFAULT_PREVIEW_ROOT,
  getMimeType,
  resolveStaticFilePath,
  startStaticServer,
} = require("../../scripts/static-preview-server");

/**
 * 作用：
 * 等待页面进入最终结算状态，并返回标题与正文。
 *
 * 为什么这样写：
 * smoke test 的核心验收是“能自动完成一整局”；
 * 用结果弹窗作为稳定锚点，比盯具体某一轮或某个阶段更抗 UI 微调。
 *
 * 输入：
 * @param {import("playwright").Page} page - 当前场景对应的 Playwright 页面。
 * @param {number} timeoutMs - 最长等待时长。
 *
 * 输出：
 * @returns {Promise<{title: string, body: string}>} 结果弹窗里的标题和正文。
 *
 * 注意：
 * - 标题必须包含 `获胜` 或 `失败`，避免只等到一个空弹层。
 * - 超时会直接抛错，让 hook 明确阻断提交。
 */
async function waitForResultOverlay(page, timeoutMs) {
  const titleHandle = await page.waitForFunction(() => {
    const titleText = document.getElementById("resultTitle")?.textContent?.trim() || "";
    return titleText.includes("获胜") || titleText.includes("失败") ? titleText : false;
  }, undefined, { timeout: timeoutMs });

  const title = await titleHandle.jsonValue();
  const body = (await page.locator("#resultBody").textContent())?.trim() || "";
  return { title, body };
}

/**
 * 作用：
 * 把当前 smoke 场景的对局节奏切到 `瞬` 档。
 *
 * 为什么这样写：
 * 现在 PC 和 mobile 的节奏入口都优先展示可见按钮组，隐藏 `select` 只保留给共享状态同步；
 * UI smoke 如果仍强依赖隐藏控件，就会在真实页面里卡住。
 * 这里优先点击可见按钮，再回退到 `select`，能同时兼容新版按钮组和历史兜底节点。
 *
 * 输入：
 * @param {import("playwright").Page} page - 当前场景对应的 Playwright 页面。
 * @param {{paceButtonSelector?: string, paceSelector: string}} scenario - 当前场景配置。
 *
 * 输出：
 * @returns {Promise<void>} 成功后页面应已切到 `瞬` 档。
 *
 * 注意：
 * - 只有按钮真实可见时才优先点击，避免误点隐藏节点。
 * - 回退到 `select` 的逻辑不能删，隐藏镜像节点仍是最后兜底。
 */
async function setScenarioPaceToInstant(page, scenario) {
  if (scenario.paceButtonSelector) {
    const paceButton = page.locator(scenario.paceButtonSelector).first();
    const buttonVisible = await paceButton.isVisible().catch(() => false);
    if (buttonVisible) {
      await paceButton.click();
      return;
    }
  }

  await page.locator(scenario.paceSelector).selectOption("instant");
}

/**
 * 作用：
 * 在页面里启用最快节奏并切换为自动托管。
 *
 * 为什么这样写：
 * 这条 smoke test 关注的是“能否进入真实游戏并完整打完”；
 * 设为 `瞬` 档并开启托管，可以在不绕过真实 UI 的前提下把耗时压到最低。
 *
 * 输入：
 * @param {import("playwright").Page} page - 当前场景对应的 Playwright 页面。
 * @param {{paceSelector: string, startSelector: string, autoSelector: string}} scenario - 当前场景配置。
 *
 * 输出：
 * @returns {Promise<void>} 执行完后页面会进入自动托管流程。
 *
 * 注意：
 * - 必须先设置节奏，再点击开始，确保整局都使用 `瞬` 档。
 * - 点击托管后要等待 `aria-pressed=true`，避免误判点击未生效。
 */
async function startScenarioGame(page, scenario) {
  await setScenarioPaceToInstant(page, scenario);
  await page.locator(scenario.startSelector).click();
  await page.locator(scenario.autoSelector).waitFor({ state: "visible" });
  await page.locator(scenario.autoSelector).click();
  await page.waitForFunction((selector) => {
    return document.querySelector(selector)?.getAttribute("aria-pressed") === "true";
  }, scenario.autoSelector, { timeout: 10000 });
}

/**
 * 作用：
 * 跑完单个平台的整局 UI smoke，并输出结果摘要。
 *
 * 为什么这样写：
 * PC 和 mobile 的入口、viewport、托管按钮都不同；
 * 把公共流程收敛成一个 runner 后，两端只需通过场景配置描述差异。
 *
 * 输入：
 * @param {import("playwright").Browser} browser - 已启动的 Chromium 浏览器实例。
 * @param {string} origin - 本地静态 server 的访问 origin。
 * @param {object} scenario - 当前要执行的 smoke 场景配置。
 * @param {number} timeoutMs - 当前场景允许的最大执行时长。
 *
 * 输出：
 * @returns {Promise<{name: string, title: string, body: string, durationMs: number}>} 场景执行结果摘要。
 *
 * 注意：
 * - 每个平台都使用独立 browser context，避免 cookie 和本地存档互相污染。
 * - 浏览器控制台 error 或 pageerror 都会直接视为 smoke 失败。
 */
async function runUiSmokeScenario(browser, origin, scenario, timeoutMs) {
  const context = await browser.newContext({
    viewport: scenario.viewport,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const startTime = Date.now();

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error.message || error));
  });

  try {
    await page.goto(`${origin}${scenario.pagePath}`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await startScenarioGame(page, scenario);
    const result = await waitForResultOverlay(page, timeoutMs);

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error([
        `场景 ${scenario.name} 出现浏览器错误。`,
        consoleErrors.length > 0 ? `console.error:\n${consoleErrors.join("\n")}` : "",
        pageErrors.length > 0 ? `pageerror:\n${pageErrors.join("\n")}` : "",
      ].filter(Boolean).join("\n"));
    }

    return {
      name: scenario.name,
      title: result.title,
      body: result.body,
      durationMs: Date.now() - startTime,
    };
  } finally {
    await context.close();
  }
}

/**
 * 作用：
 * 运行整套 PC + mobile UI smoke，并把结果打印到 stdout。
 *
 * 为什么这样写：
 * 这条脚本既要能被 pre-commit 调用，也要能给本地开发直接手动执行；
 * 统一从这里管理 server、browser 和场景循环，能保证两种入口拿到一致行为。
 *
 * 输入：
 * @param {string[]} [argv=process.argv.slice(2)] - 命令行参数列表。
 *
 * 输出：
 * @returns {Promise<void>} 成功时打印摘要；失败时抛错并退出非零状态。
 *
 * 注意：
 * - 默认使用 headless 追求提交速度；传 `--headed` 时才弹出可见浏览器。
 * - 这里只做 smoke，不把它接进常规 `npm test`，避免日常回归过慢。
 */
async function main(argv = process.argv.slice(2)) {
  const options = parseUiSmokeArgs(argv);
  const scenarios = getUiSmokeScenarios(options.scenarioNames);
  const { server, origin } = await startStaticServer({
    preferredPort: options.port,
  });
  const browser = await chromium.launch({
    headless: !options.headed,
  });

  try {
    const results = [];
    for (const scenario of scenarios) {
      results.push(await runUiSmokeScenario(browser, origin, scenario, options.timeoutMs));
    }

    for (const result of results) {
      console.log(`- ${result.name}: ${result.title} (${result.durationMs}ms)`);
      if (result.body) {
        console.log(`  ${result.body}`);
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  PROJECT_ROOT: DEFAULT_PREVIEW_ROOT,
  resolveStaticFilePath,
  getMimeType,
  startStaticServer,
  waitForResultOverlay,
  setScenarioPaceToInstant,
  startScenarioGame,
  runUiSmokeScenario,
  main,
};
