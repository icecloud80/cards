const assert = require("node:assert/strict");

const {
  DEFAULT_UI_SMOKE_PORT,
  DEFAULT_UI_SMOKE_TIMEOUT_MS,
  UI_SMOKE_SCENARIOS,
  getUiSmokeScenarios,
  parseUiSmokeArgs,
} = require("../support/ui-smoke-config");
const {
  DEFAULT_PREVIEW_ROOT,
  getMimeType,
  resolveStaticFilePath,
} = require("../../scripts/static-preview-server");

/**
 * 作用：
 * 校验 UI smoke 场景配置与命令行解析规则。
 *
 * 为什么这样写：
 * smoke 脚本本身比较重，不适合塞进常规单测；
 * 但场景选择、静态资源路径和 CLI 参数一旦被改坏，hook 就会在真正跑浏览器前失效，所以这里先锁住轻量配置层。
 *
 * 输入：
 * @param {void} - 测试数据在函数内部固定构造。
 *
 * 输出：
 * @returns {{results: string[]}} 供脚本末尾统一打印的摘要。
 *
 * 注意：
 * - 这条测试只验证配置，不直接启动浏览器。
 * - 场景名必须稳定为 `pc / mobile`，方便 hook 和本地调试复用。
 */
function runUiSmokeConfigChecks() {
  const results = [];

  assert.equal(DEFAULT_UI_SMOKE_PORT, 4173, "default ui smoke port should stay stable");
  assert.equal(DEFAULT_UI_SMOKE_TIMEOUT_MS, 120000, "default timeout should stay stable");
  assert.deepEqual(UI_SMOKE_SCENARIOS.map((scenario) => scenario.name), ["pc", "mobile"], "ui smoke should cover pc and mobile");
  assert.equal(UI_SMOKE_SCENARIOS[0].paceSelector, "#aiPaceSelect", "pc scenario should drive the shared pace select");
  assert.equal(UI_SMOKE_SCENARIOS[1].autoSelector, "#mobileAutoBtn", "mobile scenario should toggle the mobile auto button");
  results.push("scenario list keeps pc and mobile coverage");

  const defaultOptions = parseUiSmokeArgs([]);
  assert.equal(defaultOptions.headed, false, "ui smoke should default to headless mode for speed");
  assert.equal(defaultOptions.port, DEFAULT_UI_SMOKE_PORT, "default port should match exported constant");
  assert.equal(defaultOptions.timeoutMs, DEFAULT_UI_SMOKE_TIMEOUT_MS, "default timeout should match exported constant");
  assert.deepEqual(defaultOptions.scenarioNames, [], "default run should include all scenarios");
  results.push("default cli options stay stable");

  const customOptions = parseUiSmokeArgs(["--headed", "--port=4300", "--timeout=90000", "--only=mobile"]);
  assert.equal(customOptions.headed, true, "headed flag should be parsed");
  assert.equal(customOptions.port, 4300, "custom port should be parsed");
  assert.equal(customOptions.timeoutMs, 90000, "custom timeout should be parsed");
  assert.deepEqual(customOptions.scenarioNames, ["mobile"], "custom scenario filter should be parsed");
  assert.deepEqual(getUiSmokeScenarios(customOptions.scenarioNames).map((scenario) => scenario.name), ["mobile"], "scenario filtering should preserve requested order");
  results.push("custom cli options and scenario filtering work");

  assert.throws(() => parseUiSmokeArgs(["--only=tablet"]), /未知的 UI smoke 场景/, "unknown scenario names should throw");
  assert.throws(() => parseUiSmokeArgs(["--timeout=0"]), /timeout 必须是正整数毫秒/, "invalid timeout should throw");
  assert.throws(() => parseUiSmokeArgs(["--bad"]), /未知参数/, "unknown arguments should throw");
  results.push("invalid cli options fail loudly");

  assert.equal(resolveStaticFilePath("/index1.html"), `${DEFAULT_PREVIEW_ROOT}/index1.html`, "static file resolver should map normal paths under the project root");
  assert.equal(getMimeType("/tmp/test.svg"), "image/svg+xml", "mime helper should recognize svg files");
  assert.throws(() => resolveStaticFilePath("/../outside.txt"), /非法静态资源路径/, "static file resolver should block path traversal");
  results.push("static file resolution stays inside the project root");

  return { results };
}

const output = runUiSmokeConfigChecks();
for (const result of output.results) {
  console.log(`- ${result}`);
}
