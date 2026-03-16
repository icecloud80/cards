const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const { chromium } = require("playwright");

const { getUiSmokeScenarios, parseUiSmokeArgs } = require("../support/ui-smoke-config");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
};

/**
 * 作用：
 * 把 URL 路径安全地映射到仓库里的静态文件路径。
 *
 * 为什么这样写：
 * UI smoke 需要通过本地 HTTP 打开真实页面；
 * 这里统一做路径归一化和越界保护，避免目录穿越或根路径解析不一致。
 *
 * 输入：
 * @param {string} requestPath - HTTP 请求里的 pathname。
 *
 * 输出：
 * @returns {string} 对应到项目根目录下的绝对文件路径。
 *
 * 注意：
 * - 根路径会回落到 `index.html`，方便本地手动访问。
 * - 只允许访问仓库根目录以内的文件，越界必须抛错。
 */
function resolveStaticFilePath(requestPath) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const decodedPath = decodeURIComponent(normalizedPath);
  const absolutePath = path.resolve(PROJECT_ROOT, `.${decodedPath}`);
  if (!absolutePath.startsWith(PROJECT_ROOT)) {
    throw new Error(`非法静态资源路径：${requestPath}`);
  }
  return absolutePath;
}

/**
 * 作用：
 * 根据文件扩展名返回 HTTP 响应应使用的 MIME 类型。
 *
 * 为什么这样写：
 * HTML、JS、SVG 和图片资源都要通过同一个轻量 server 提供；
 * 明确声明 MIME 后，浏览器加载静态页时不会因为类型错误而拦截脚本或素材。
 *
 * 输入：
 * @param {string} filePath - 当前要返回的静态文件绝对路径。
 *
 * 输出：
 * @returns {string} 对应的 MIME 类型字符串。
 *
 * 注意：
 * - 未列出的扩展名统一回退到 `application/octet-stream`。
 * - 这里只服务当前仓库需要的最小文件类型集合。
 */
function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/**
 * 作用：
 * 创建一个服务当前仓库静态文件的本地 HTTP server。
 *
 * 为什么这样写：
 * Playwright 直接打开 `file://` 时，cookie 和部分浏览器行为不够稳定；
 * 用一个超轻量本地 server 承载页面，可以更贴近真实浏览器环境且无需额外依赖。
 *
 * 输入：
 * @param {number} preferredPort - 优先尝试监听的端口。
 *
 * 输出：
 * @returns {Promise<{server: import("node:http").Server, origin: string}>} 已启动的 server 与访问 origin。
 *
 * 注意：
 * - 若优先端口被占用，会自动回退到系统分配端口。
 * - 调用方负责在结束后关闭 server。
 */
async function startStaticServer(preferredPort) {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const filePath = resolveStaticFilePath(requestUrl.pathname);
      const fileBuffer = await fsp.readFile(filePath);
      response.writeHead(200, {
        "Content-Type": getMimeType(filePath),
        "Cache-Control": "no-store",
      });
      response.end(fileBuffer);
    } catch (error) {
      const statusCode = error.code === "ENOENT" ? 404 : 500;
      response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(statusCode === 404 ? "Not Found" : String(error.message || error));
    }
  });

  /**
   * 作用：
   * 以指定端口启动 server，并在端口冲突时让调用方决定是否重试。
   *
   * 为什么这样写：
   * 这样可以复用同一套监听逻辑处理“优先端口”与“系统随机端口”两条路径，
   * 同时避免把 `server.on("error")` 分支散落到外层。
   *
   * 输入：
   * @param {number} port - 当前尝试监听的端口；传 `0` 表示交给系统分配。
   *
   * 输出：
   * @returns {Promise<number>} 实际监听到的端口号。
   *
   * 注意：
   * - 这里只负责拿到监听端口，不拼接 origin。
   * - 一旦监听成功，必须移除本次注册的错误监听，避免后续重复触发。
   */
  async function listenOnPort(port) {
    return new Promise((resolve, reject) => {
      const handleError = (error) => {
        server.off("listening", handleListening);
        reject(error);
      };
      const handleListening = () => {
        server.off("error", handleError);
        resolve(server.address().port);
      };

      server.once("error", handleError);
      server.once("listening", handleListening);
      server.listen(port, "127.0.0.1");
    });
  }

  let actualPort;
  try {
    actualPort = await listenOnPort(preferredPort);
  } catch (error) {
    if (error.code !== "EADDRINUSE") {
      throw error;
    }
    actualPort = await listenOnPort(0);
  }

  return {
    server,
    origin: `http://127.0.0.1:${actualPort}`,
  };
}

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
  await page.locator(scenario.paceSelector).selectOption("instant");
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
  const { server, origin } = await startStaticServer(options.port);
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
  PROJECT_ROOT,
  resolveStaticFilePath,
  getMimeType,
  startStaticServer,
  waitForResultOverlay,
  startScenarioGame,
  runUiSmokeScenario,
  main,
};
