const DEFAULT_UI_SMOKE_PORT = 3721;
const DEFAULT_UI_SMOKE_TIMEOUT_MS = 120000;

const UI_SMOKE_SCENARIOS = Object.freeze([
  Object.freeze({
    name: "pc",
    pagePath: "/index1.html",
    viewport: { width: 1560, height: 960 },
    paceButtonSelector: "#aiPaceButtons [data-ai-pace-value='instant']",
    paceSelector: "#aiPaceSelect",
    startSelector: "#startLobbyStartBtn",
    autoSelector: "#autoManagedBtn",
  }),
  Object.freeze({
    name: "mobile",
    pagePath: "/index2.html",
    viewport: { width: 430, height: 932 },
    paceSelector: "#mobileAiPaceSelect",
    startSelector: "#mobileStartBtn",
    autoSelector: "#mobileAutoBtn",
  }),
]);

/**
 * 作用：
 * 根据名字过滤要执行的 UI smoke 场景。
 *
 * 为什么这样写：
 * 本地排查时有时只想跑 PC 或 mobile 其中一端；
 * 把过滤逻辑集中后，CLI 和单测都能共用同一套校验规则。
 *
 * 输入：
 * @param {string[]|undefined} names - 期望执行的场景名列表。
 *
 * 输出：
 * @returns {Array<object>} 过滤后的 smoke 场景配置。
 *
 * 注意：
 * - 未传或传空数组时，默认返回全部场景。
 * - 如果传入了不存在的场景名，必须直接抛错，避免误以为已覆盖。
 */
function getUiSmokeScenarios(names) {
  if (!Array.isArray(names) || names.length === 0) {
    return [...UI_SMOKE_SCENARIOS];
  }

  const scenarioMap = new Map(UI_SMOKE_SCENARIOS.map((scenario) => [scenario.name, scenario]));
  return names.map((name) => {
    const scenario = scenarioMap.get(name);
    if (!scenario) {
      throw new Error(`未知的 UI smoke 场景：${name}`);
    }
    return scenario;
  });
}

/**
 * 作用：
 * 把命令行参数解析成 UI smoke 的运行配置。
 *
 * 为什么这样写：
 * 自动门禁默认要追求速度，但本地调试时又可能想切换成 headed 或只跑单端；
 * 保留一个小型 CLI 解析器，可以兼顾 hook 和手动排障两种用法。
 *
 * 输入：
 * @param {string[]} [argv=process.argv.slice(2)] - 命令行参数列表。
 *
 * 输出：
 * @returns {{headed: boolean, port: number, timeoutMs: number, scenarioNames: string[]}} 归一化后的运行配置。
 *
 * 注意：
 * - `--headed` 只控制浏览器是否可见，不影响执行步骤。
 * - `--only=` 支持逗号分隔，但最终场景名仍会经过合法性校验。
 */
function parseUiSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    headed: false,
    port: DEFAULT_UI_SMOKE_PORT,
    timeoutMs: DEFAULT_UI_SMOKE_TIMEOUT_MS,
    scenarioNames: [],
  };

  for (const argument of argv) {
    if (argument === "--headed") {
      options.headed = true;
      continue;
    }
    if (argument.startsWith("--port=")) {
      options.port = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--timeout=")) {
      options.timeoutMs = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--only=")) {
      options.scenarioNames = argument
        .split("=")[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }
    throw new Error(`未知参数：${argument}`);
  }

  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error(`port 必须是正整数，当前为 ${options.port}`);
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error(`timeout 必须是正整数毫秒，当前为 ${options.timeoutMs}`);
  }

  getUiSmokeScenarios(options.scenarioNames);
  return options;
}

module.exports = {
  DEFAULT_UI_SMOKE_PORT,
  DEFAULT_UI_SMOKE_TIMEOUT_MS,
  UI_SMOKE_SCENARIOS,
  getUiSmokeScenarios,
  parseUiSmokeArgs,
};
