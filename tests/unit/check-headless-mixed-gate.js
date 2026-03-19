const fs = require("fs");
const path = require("path");

const { runMixedHeadlessRegression } = require("../support/headless-full-game-runner");

/**
 * 作用：
 * 解析 mixed `20` 局长门禁脚本的命令行参数。
 *
 * 为什么这样写：
 * 这条门禁既要有稳定默认值，也要支持在排障时临时放宽或收紧阈值，
 * 因此保留轻量 CLI 入口比把数字硬编码在脚本里更利于长期维护。
 *
 * 输入：
 * @param {string[]} [argv=process.argv.slice(2)] - 传入脚本的命令行参数列表。
 *
 * 输出：
 * @returns {{
 *   games: number,
 *   baseSeed: string,
 *   outputDir: string,
 *   maxSteps: number,
 *   maxAverageDecisionTimeMs: number,
 *   maxP95DecisionTimeMs: number,
 *   maxSlowestGameAverageMs: number,
 *   maxDangerousPointLead: number,
 *   maxUnresolvedProbeRisk: number,
 *   minTurnAccessHold: number
 * }} 归一化后的 mixed 长门禁配置。
 *
 * 注意：
 * - 未识别参数会直接报错，避免把错误拼写静默吃掉。
 * - 这里默认值针对当前 mixed `20` 局守门；若以后基线变动，应同步更新文档。
 */
function parseMixedGateArgs(argv = process.argv.slice(2)) {
  const options = {
    games: 20,
    baseSeed: "headless-regression:mixed-validation",
    outputDir: path.resolve(process.cwd(), "artifacts/headless-regression/mixed-gate-latest"),
    maxSteps: 4000,
    maxAverageDecisionTimeMs: 1200,
    maxP95DecisionTimeMs: 2500,
    maxSlowestGameAverageMs: 1800,
    maxDangerousPointLead: 4,
    maxUnresolvedProbeRisk: 12,
    minTurnAccessHold: 4,
  };

  for (const argument of argv) {
    if (argument.startsWith("--games=")) {
      options.games = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--seed=")) {
      options.baseSeed = argument.split("=")[1] || options.baseSeed;
      continue;
    }
    if (argument.startsWith("--output-dir=")) {
      options.outputDir = path.resolve(process.cwd(), argument.split("=")[1] || options.outputDir);
      continue;
    }
    if (argument.startsWith("--max-steps=")) {
      options.maxSteps = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--max-average-decision-ms=")) {
      options.maxAverageDecisionTimeMs = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--max-p95-decision-ms=")) {
      options.maxP95DecisionTimeMs = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--max-slowest-game-average-ms=")) {
      options.maxSlowestGameAverageMs = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--max-dangerous-point-lead=")) {
      options.maxDangerousPointLead = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--max-unresolved-probe-risk=")) {
      options.maxUnresolvedProbeRisk = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--min-turn-access-hold=")) {
      options.minTurnAccessHold = Number(argument.split("=")[1]);
      continue;
    }
    throw new Error(`未知参数：${argument}`);
  }

  const positiveIntegerKeys = ["games", "maxSteps"];
  for (const key of positiveIntegerKeys) {
    if (!Number.isInteger(options[key]) || options[key] <= 0) {
      throw new Error(`${key} 必须是正整数，当前为 ${options[key]}`);
    }
  }

  const nonNegativeNumberKeys = [
    "maxAverageDecisionTimeMs",
    "maxP95DecisionTimeMs",
    "maxSlowestGameAverageMs",
    "maxDangerousPointLead",
    "maxUnresolvedProbeRisk",
    "minTurnAccessHold",
  ];
  for (const key of nonNegativeNumberKeys) {
    if (typeof options[key] !== "number" || !Number.isFinite(options[key]) || options[key] < 0) {
      throw new Error(`${key} 必须是非负数字，当前为 ${options[key]}`);
    }
  }

  return options;
}

/**
 * 作用：
 * 校验 mixed 长门禁产物已经完整落盘且保留可复跑 seed。
 *
 * 为什么这样写：
 * 这条脚本的价值不只是“跑 20 局”，还包括让慢局和高风险样本都能被直接复跑；
 * 如果产物没写出，或者样本 seed 脱离 baseSeed，门禁通过也没有排障价值。
 *
 * 输入：
 * @param {object} result - `runMixedHeadlessRegression(...)` 的返回结果。
 * @param {string} expectedBaseSeed - 本轮预期的基础 seed。
 *
 * 输出：
 * @returns {void} 校验失败时直接抛错。
 *
 * 注意：
 * - 这里只校验 mixed 长门禁必要字段，不重复覆盖小样本脚本里的所有结构细节。
 * - `slowestGames / slowestDecisions` 允许为空；非空时必须都能回溯到本轮 baseSeed。
 */
function validateMixedGateArtifacts(result, expectedBaseSeed) {
  const summary = result?.summary;
  const files = result?.files || {};
  if (!summary || summary.baseSeed !== expectedBaseSeed) {
    throw new Error(`mixed gate 摘要缺少固定 baseSeed=${expectedBaseSeed}`);
  }
  if (!files.summaryFile || !fs.existsSync(files.summaryFile)) {
    throw new Error("mixed gate 缺少 summary.json 产物");
  }
  if (!files.analysisFile || !fs.existsSync(files.analysisFile)) {
    throw new Error("mixed gate 缺少 analysis.md 产物");
  }
  if (!files.eventsFile || !fs.existsSync(files.eventsFile)) {
    throw new Error("mixed gate 缺少 events.ndjson 产物");
  }
  if (!files.gamesFile || !fs.existsSync(files.gamesFile)) {
    throw new Error("mixed gate 缺少 games.ndjson 产物");
  }

  for (const sample of summary.performance?.slowestGames || []) {
    if (typeof sample.seed !== "string" || !sample.seed.startsWith(`${expectedBaseSeed}:`)) {
      throw new Error("mixed gate slowestGames 存在无法回溯到固定 baseSeed 的样本");
    }
  }
  for (const sample of summary.performance?.slowestDecisions || []) {
    if (typeof sample.seed !== "string" || !sample.seed.startsWith(`${expectedBaseSeed}:`)) {
      throw new Error("mixed gate slowestDecisions 存在无法回溯到固定 baseSeed 的样本");
    }
  }
}

/**
 * 作用：
 * 校验 mixed `20` 局长门禁的稳定性、残余风险上限与性能阈值。
 *
 * 为什么这样写：
 * M4 基线之后，真正缺的是“大样本 mixed 会不会重新把风险和耗时拉高”。
 * 这里把完局率、阵容分布、风险上限和性能阈值集中钉住，避免后续优化回退。
 *
 * 输入：
 * @param {object} result - `runMixedHeadlessRegression(...)` 的返回结果。
 * @param {ReturnType<typeof parseMixedGateArgs>} options - 当前 mixed 门禁配置。
 *
 * 输出：
 * @returns {void} 校验失败时直接抛错。
 *
 * 注意：
 * - 这里的阈值是“守门线”，不是质量理想值；只负责尽早发现明显回退。
 * - beginner 当前不产出正式 debug 决策快照，因此性能统计主要覆盖 intermediate/mixed 决策。
 */
function validateMixedGateSummary(result, options) {
  const summary = result?.summary;
  if (!summary || summary.mode !== "mixed_lineup") {
    throw new Error("mixed gate 缺少 mode=mixed_lineup 标记");
  }
  if (summary.totals.requestedGames !== options.games) {
    throw new Error(`mixed gate 请求局数异常：期望 ${options.games}，实际 ${summary.totals.requestedGames}`);
  }
  if (summary.totals.completedGames !== options.games || summary.totals.failedGames !== 0 || summary.totals.completionRate !== 100) {
    throw new Error(
      `mixed gate 完局性不达标：completed=${summary.totals.completedGames}, failed=${summary.totals.failedGames}, rate=${summary.totals.completionRate}%`
    );
  }

  const lineupTotal = (summary.lineupBreakdown || []).reduce((sum, entry) => sum + (entry.count || 0), 0);
  if (lineupTotal !== options.games) {
    throw new Error(`mixed gate lineupBreakdown 总局数异常：期望 ${options.games}，实际 ${lineupTotal}`);
  }
  if ((summary.lineupBreakdown || []).some((entry) => typeof entry.label !== "string" || !entry.label.startsWith("mixed-"))) {
    throw new Error("mixed gate lineupBreakdown 存在非法 mixed 阵容标签");
  }

  const beginnerSeats = summary.playerDifficultyBreakdown?.beginner?.seats || 0;
  const intermediateSeats = summary.playerDifficultyBreakdown?.intermediate?.seats || 0;
  if (beginnerSeats < options.games * 2 || beginnerSeats > options.games * 3) {
    throw new Error(`mixed gate beginner 座位曝光异常：${beginnerSeats}`);
  }
  if (intermediateSeats < options.games * 2 || intermediateSeats > options.games * 3) {
    throw new Error(`mixed gate intermediate 座位曝光异常：${intermediateSeats}`);
  }
  if ((summary.playerDifficultyBreakdown?.intermediate?.decisions || 0) <= 0) {
    throw new Error("mixed gate 未采到任何 intermediate 决策");
  }

  const signals = summary.decisionSignals?.selectedSignals || {};
  if ((signals.turnAccessHold || 0) < options.minTurnAccessHold) {
    throw new Error(`mixed gate turn_access_hold 低于门槛：${signals.turnAccessHold}`);
  }
  if ((signals.dangerousPointLead || 0) > options.maxDangerousPointLead) {
    throw new Error(`mixed gate dangerous_point_lead 超过门槛：${signals.dangerousPointLead}`);
  }
  if ((signals.unresolvedProbeRisk || 0) > options.maxUnresolvedProbeRisk) {
    throw new Error(`mixed gate unresolved_probe_risk 超过门槛：${signals.unresolvedProbeRisk}`);
  }

  const performance = summary.performance || {};
  if ((summary.totals.averageDecisionTimeMs || 0) > options.maxAverageDecisionTimeMs) {
    throw new Error(
      `mixed gate 平均 AI 决策耗时超过门槛：${summary.totals.averageDecisionTimeMs}ms > ${options.maxAverageDecisionTimeMs}ms`
    );
  }
  if ((performance.p95DecisionTimeMs || 0) > options.maxP95DecisionTimeMs) {
    throw new Error(
      `mixed gate P95 AI 决策耗时超过门槛：${performance.p95DecisionTimeMs}ms > ${options.maxP95DecisionTimeMs}ms`
    );
  }
  if ((performance.slowestGames?.[0]?.averageDecisionTimeMs || 0) > options.maxSlowestGameAverageMs) {
    throw new Error(
      `mixed gate 最慢单局平均耗时超过门槛：${performance.slowestGames[0].averageDecisionTimeMs}ms > ${options.maxSlowestGameAverageMs}ms`
    );
  }
}

/**
 * 作用：
 * 运行 mixed `20` 局长门禁，并输出最关键的守门摘要。
 *
 * 为什么这样写：
 * 这条脚本主要服务“路线图下一步”的大样本门禁，
 * 控制台只打印高信号结论，详细复盘统一看 summary / analysis 产物。
 *
 * 输入：
 * @param {void} - 参数直接来自命令行。
 *
 * 输出：
 * @returns {void} 成功时打印摘要，失败时抛出异常退出非零状态。
 *
 * 注意：
 * - 这条脚本默认比小样本 headless 更慢，不应塞进所有快速回归。
 * - 若要复跑某轮失败样本，请优先保留默认 seed，方便和文档里的基线对照。
 */
function main() {
  const options = parseMixedGateArgs();
  const result = runMixedHeadlessRegression({
    games: options.games,
    baseSeed: options.baseSeed,
    outputDir: options.outputDir,
    maxSteps: options.maxSteps,
  });

  validateMixedGateArtifacts(result, options.baseSeed);
  validateMixedGateSummary(result, options);

  console.log("Headless mixed long gate passed:");
  console.log(`- games: ${result.summary.totals.completedGames}/${result.summary.totals.requestedGames}`);
  console.log(`- completion rate: ${result.summary.totals.completionRate}%`);
  console.log(`- average decision time: ${result.summary.totals.averageDecisionTimeMs} ms`);
  console.log(`- decision time p95: ${result.summary.performance.p95DecisionTimeMs} ms`);
  console.log(`- slowest game average: ${result.summary.performance.slowestGames[0]?.averageDecisionTimeMs || 0} ms`);
  console.log(`- dangerous_point_lead: ${result.summary.decisionSignals.selectedSignals.dangerousPointLead}`);
  console.log(`- unresolved_probe_risk: ${result.summary.decisionSignals.selectedSignals.unresolvedProbeRisk}`);
  console.log(`- turn_access_hold: ${result.summary.decisionSignals.selectedSignals.turnAccessHold}`);
  console.log(`- summary: ${result.files.summaryFile}`);
  console.log(`- analysis: ${result.files.analysisFile}`);
}

main();
