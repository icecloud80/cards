const fs = require("fs");

const {
  parseHeadlessRegressionArgs,
  runHeadlessRegression,
  runMixedHeadlessRegression,
} = require("../support/headless-full-game-runner");

/**
 * 作用：
 * 校验 headless 回归摘要里已经带上决策信号聚合结构。
 *
 * 为什么这样写：
 * 里程碑 3.5 这轮新增的是“批量复盘可见性”，
 * 如果 summary 里没有稳定的 `decisionSignals` 结构，后续分析文件和自动化就会悄悄退化。
 *
 * 输入：
 * @param {object} summary - `runHeadlessRegression` 返回的聚合摘要。
 *
 * 输出：
 * @returns {void} 校验失败时直接抛错。
 *
 * 注意：
 * - 这里只校验结构存在且字段是数字/对象，不假设某一轮样本一定命中特定信号。
 * - 各难度都必须带同一套字段，否则后续汇总展示会出现断层。
 */
function validateHeadlessDecisionSignals(summary) {
  if (!summary || !summary.decisionSignals || !summary.decisionSignals.selectedSignals) {
    throw new Error("headless 回归摘要缺少 decisionSignals 总体结构");
  }

  const overallSignals = summary.decisionSignals;
  const signalKeys = [
    "turnAccessRisk",
    "pointRunRisk",
    "turnAccessHold",
    "dangerousPointLead",
    "unresolvedProbeRisk",
    "revealedFriendControlShift",
  ];
  for (const key of signalKeys) {
    if (typeof overallSignals.selectedSignals?.[key] !== "number") {
      throw new Error(`headless 回归摘要缺少 overall decisionSignals.selectedSignals.${key}`);
    }
  }
  if (typeof overallSignals.selectedByFriendState?.turnAccessRisk?.unrevealed !== "number") {
    throw new Error("headless 回归摘要缺少 overall decisionSignals.selectedByFriendState.turnAccessRisk.unrevealed");
  }
  if (typeof overallSignals.selectedByFriendState?.pointRunRisk?.unrevealed !== "number") {
    throw new Error("headless 回归摘要缺少 overall decisionSignals.selectedByFriendState.pointRunRisk.unrevealed");
  }
  if (typeof overallSignals.selectedByFriendState?.turnAccessHold?.unrevealed !== "number") {
    throw new Error("headless 回归摘要缺少 overall decisionSignals.selectedByFriendState.turnAccessHold.unrevealed");
  }

  if (typeof overallSignals.candidateAudit?.turnAccessRiskCandidates !== "number") {
    throw new Error("headless 回归摘要缺少 overall candidateAudit.turnAccessRiskCandidates");
  }
  if (typeof overallSignals.candidateAudit?.pointRunRiskCandidates !== "number") {
    throw new Error("headless 回归摘要缺少 overall candidateAudit.pointRunRiskCandidates");
  }
  if (typeof overallSignals.candidateAudit?.filteredCandidates !== "number") {
    throw new Error("headless 回归摘要缺少 overall candidateAudit.filteredCandidates");
  }
  if (!Array.isArray(overallSignals.topSignalGames)) {
    throw new Error("headless 回归摘要缺少 overall topSignalGames");
  }
  if ((summary.difficulties || []).includes("intermediate") && overallSignals.totalDecisions <= 0) {
    throw new Error("headless 回归没有采到任何中高级 AI 决策，可能是调试快照未开启");
  }

  for (const difficulty of summary.difficulties || []) {
    const detail = summary.byDifficulty?.[difficulty];
    if (!detail?.decisionSignals) {
      throw new Error(`headless 回归摘要缺少 ${difficulty} 难度的 decisionSignals`);
    }
    for (const key of signalKeys) {
      if (typeof detail.decisionSignals.selectedSignals?.[key] !== "number") {
        throw new Error(`headless 回归摘要缺少 ${difficulty} decisionSignals.selectedSignals.${key}`);
      }
    }
    if (typeof detail.decisionSignals.selectedByFriendState?.turnAccessRisk?.unrevealed !== "number") {
      throw new Error(`headless 回归摘要缺少 ${difficulty} decisionSignals.selectedByFriendState.turnAccessRisk.unrevealed`);
    }
    if (typeof detail.decisionSignals.selectedByFriendState?.pointRunRisk?.unrevealed !== "number") {
      throw new Error(`headless 回归摘要缺少 ${difficulty} decisionSignals.selectedByFriendState.pointRunRisk.unrevealed`);
    }
    if (typeof detail.decisionSignals.selectedByFriendState?.turnAccessHold?.unrevealed !== "number") {
      throw new Error(`headless 回归摘要缺少 ${difficulty} decisionSignals.selectedByFriendState.turnAccessHold.unrevealed`);
    }
  }
}

/**
 * 作用：
 * 校验 `dangerousPointLead` 样本已经按“确认后的真实风险”口径落盘。
 *
 * 为什么这样写：
 * 这轮回归把 `dangerous_point_lead` 从“只要 heuristic 命中就计数”
 * 收紧成了“需要 rollout / veto 再确认”的口径，
 * 如果样本里重新混入只有提示、没有确认的首发，summary 数字会悄悄虚高。
 *
 * 输入：
 * @param {object[]} samples - `dangerousPointLead` 的样本数组。
 * @param {string} label - 当前正在校验的摘要标签。
 *
 * 输出：
 * @returns {void} 校验失败时直接抛错。
 *
 * 注意：
 * - 允许样本为空；空样本表示这一轮没有确认过的危险带分领牌。
 * - 这里不要求样本一定来自 `riskyPointLeadVetoPenalty`，也允许由 rollout 风险 flags 单独确认。
 */
function validateConfirmedDangerousPointLeadSamples(samples, label) {
  for (const sample of Array.isArray(samples) ? samples : []) {
    const flags = Array.isArray(sample.selectedRolloutTriggerFlags)
      ? sample.selectedRolloutTriggerFlags
      : [];
    const riskyVetoPenalty = sample.selectedRiskyPointLeadVetoPenalty || 0;
    const keepsAccess = flags.includes("turn_access_hold");
    const confirmedByFlags = (
      flags.includes("turn_access_risk")
      || flags.includes("point_run_risk")
      || flags.includes("no_safe_next_lead")
    ) && !keepsAccess;
    if (riskyVetoPenalty <= 0 && !confirmedByFlags) {
      throw new Error(`${label} dangerousPointLead 样本仍包含未确认风险的 heuristic 命中`);
    }
  }
}

/**
 * 作用：
 * 校验 `pointRunRisk` 样本已经稳定保留了“连续跑分风险”的确认标记。
 *
 * 为什么这样写：
 * 里程碑 3.5 还剩一条关键线是“失先手导致对手连续跑分”的专项复盘。
 * 如果 summary 里的 `pointRunRisk` 样本没有稳定保留风险 flags，
 * 后续看到某个 seed 命中也无法判断它到底是不是这类问题。
 *
 * 输入：
 * @param {object[]} samples - `pointRunRisk` 的样本数组。
 * @param {string} label - 当前正在校验的摘要标签。
 *
 * 输出：
 * @returns {void} 校验失败时直接抛错。
 *
 * 注意：
 * - 允许样本为空；空样本表示这一轮没有采到连续跑分风险。
 * - 这里只要求样本口径稳定，不要求某一轮必定命中该信号。
 */
function validatePointRunRiskSamples(samples, label) {
  for (const sample of Array.isArray(samples) ? samples : []) {
    const flags = Array.isArray(sample.selectedRolloutTriggerFlags)
      ? sample.selectedRolloutTriggerFlags
      : [];
    if (!flags.includes("point_run_risk")) {
      throw new Error(`${label} pointRunRisk 样本缺少 point_run_risk 风险标记`);
    }
  }
}

/**
 * 作用：
 * 校验 `turnAccessHold` 样本已经稳定保留了“下一拍仍可续控”的确认标记。
 *
 * 为什么这样写：
 * 里程碑 4 要把“赢轮后下一拍是否仍有牌权优势”沉成正式摘要指标。
 * 如果样本没有稳定保留 `turn_access_hold`，
 * 后续看到这类正向样本时就无法判断它到底是不是“健康续控”窗口。
 *
 * 输入：
 * @param {object[]} samples - `turnAccessHold` 的样本数组。
 * @param {string} label - 当前正在校验的摘要标签。
 *
 * 输出：
 * @returns {void} 校验失败时直接抛错。
 *
 * 注意：
 * - 允许样本为空；空样本表示这一轮没有采到明确续控优势。
 * - 这里同样只锁口径稳定性，不要求某一轮必须命中。
 */
function validateTurnAccessHoldSamples(samples, label) {
  for (const sample of Array.isArray(samples) ? samples : []) {
    const flags = Array.isArray(sample.selectedRolloutTriggerFlags)
      ? sample.selectedRolloutTriggerFlags
      : [];
    if (!flags.includes("turn_access_hold")) {
      throw new Error(`${label} turnAccessHold 样本缺少 turn_access_hold 续控标记`);
    }
  }
}

/**
 * 作用：
 * 校验 headless 摘要已经稳定输出第二阶段性能看板结构。
 *
 * 为什么这样写：
 * 这轮不只是补 mixed 长样本，还要把“平均值之外的尖峰耗时”一起写进产物。
 * 如果 `performance` 结构漂移，后续 mixed 门禁和性能复盘都会直接失效。
 *
 * 输入：
 * @param {object} summary - 当前批次的 headless 聚合摘要。
 * @param {string} label - 当前正在校验的摘要标签。
 *
 * 输出：
 * @returns {void} 校验失败时直接抛错。
 *
 * 注意：
 * - 这里只锁结构、类型和排序，不强行要求某一轮一定出现慢样本。
 * - `slowestGames / slowestDecisions` 允许为空，但非空时必须按耗时降序排列。
 */
function validateHeadlessPerformanceSummary(summary, label) {
  const performance = summary?.performance;
  if (!performance) {
    throw new Error(`${label} headless 回归摘要缺少 performance 结构`);
  }

  const numericKeys = [
    "decisionCount",
    "averageDecisionTimeMs",
    "maxDecisionTimeMs",
    "p50DecisionTimeMs",
    "p90DecisionTimeMs",
    "p95DecisionTimeMs",
  ];
  for (const key of numericKeys) {
    if (typeof performance[key] !== "number") {
      throw new Error(`${label} performance.${key} 不是数字`);
    }
  }

  for (const mode of ["lead", "follow"]) {
    const modeSummary = performance.byMode?.[mode];
    if (!modeSummary) {
      throw new Error(`${label} performance.byMode.${mode} 缺失`);
    }
    for (const key of numericKeys) {
      if (typeof modeSummary[key] !== "number") {
        throw new Error(`${label} performance.byMode.${mode}.${key} 不是数字`);
      }
    }
  }

  if (!Array.isArray(performance.slowestGames)) {
    throw new Error(`${label} performance.slowestGames 不是数组`);
  }
  if (!Array.isArray(performance.slowestDecisions)) {
    throw new Error(`${label} performance.slowestDecisions 不是数组`);
  }

  let previousSlowGameTime = Number.POSITIVE_INFINITY;
  for (const game of performance.slowestGames) {
    if (typeof game.seed !== "string" || game.seed.length === 0) {
      throw new Error(`${label} performance.slowestGames 存在缺少 seed 的样本`);
    }
    if (typeof game.averageDecisionTimeMs !== "number" || game.averageDecisionTimeMs <= 0) {
      throw new Error(`${label} performance.slowestGames 存在非法 averageDecisionTimeMs`);
    }
    if (game.averageDecisionTimeMs > previousSlowGameTime) {
      throw new Error(`${label} performance.slowestGames 未按平均耗时降序排列`);
    }
    previousSlowGameTime = game.averageDecisionTimeMs;
  }

  let previousSlowDecisionTime = Number.POSITIVE_INFINITY;
  for (const sample of performance.slowestDecisions) {
    if (typeof sample.seed !== "string" || sample.seed.length === 0) {
      throw new Error(`${label} performance.slowestDecisions 存在缺少 seed 的样本`);
    }
    if (typeof sample.decisionTimeMs !== "number" || sample.decisionTimeMs <= 0) {
      throw new Error(`${label} performance.slowestDecisions 存在非法 decisionTimeMs`);
    }
    if (!Array.isArray(sample.selectedRolloutTriggerFlags)) {
      throw new Error(`${label} performance.slowestDecisions 缺少 selectedRolloutTriggerFlags`);
    }
    if (sample.decisionTimeMs > previousSlowDecisionTime) {
      throw new Error(`${label} performance.slowestDecisions 未按决策耗时降序排列`);
    }
    previousSlowDecisionTime = sample.decisionTimeMs;
  }
}

/**
 * 作用：
 * 校验固定 seed 的 headless 产物已经具备“可复盘、可复跑”的稳定标识。
 *
 * 为什么这样写：
 * 里程碑 3.5 的最后一项不是单纯写出文件，而是要保证异常样本能被 seed 直接复跑。
 * 这里把 `summary / analysis / events / topSignalGames / samples` 的 seed 口径一起锁住，
 * 防止后续重构时产物还在，但已经失去复盘定位价值。
 *
 * 输入：
 * @param {object} result - `runHeadlessRegression(...)` 或 `runMixedHeadlessRegression(...)` 的返回值。
 * @param {string} expectedBaseSeed - 预期的基础 seed。
 * @param {string} label - 当前正在校验的批次标签。
 *
 * 输出：
 * @returns {void} 校验失败时直接抛错。
 *
 * 注意：
 * - 这里只校验“稳定可复盘”必需的字段，不要求样本数量固定。
 * - `topSignalGames` 和样本可能为空；非空时必须都能追溯回本轮 base seed。
 */
function validateFixedSeedRegressionArtifacts(result, expectedBaseSeed, label) {
  const summary = result?.summary;
  const files = result?.files || {};
  if (!summary || summary.baseSeed !== expectedBaseSeed) {
    throw new Error(`${label} headless 摘要缺少固定 baseSeed=${expectedBaseSeed}`);
  }
  if (!files.summaryFile || !fs.existsSync(files.summaryFile)) {
    throw new Error(`${label} headless 缺少 summary.json 产物`);
  }
  if (!files.analysisFile || !fs.existsSync(files.analysisFile)) {
    throw new Error(`${label} headless 缺少 analysis.md 产物`);
  }
  if (!files.eventsFile || !fs.existsSync(files.eventsFile)) {
    throw new Error(`${label} headless 缺少 events.ndjson 产物`);
  }
  if (!files.gamesFile || !fs.existsSync(files.gamesFile)) {
    throw new Error(`${label} headless 缺少 games.ndjson 产物`);
  }

  const analysisText = fs.readFileSync(files.analysisFile, "utf8");
  if (!analysisText.includes(expectedBaseSeed)) {
    throw new Error(`${label} analysis.md 未记录固定 baseSeed`);
  }

  const overallSignals = summary.decisionSignals || {};
  for (const entry of overallSignals.topSignalGames || []) {
    if (typeof entry.seed !== "string" || !entry.seed.startsWith(`${expectedBaseSeed}:`)) {
      throw new Error(`${label} topSignalGames 包含无法回溯到固定 baseSeed 的 seed`);
    }
  }

  const sampleGroups = overallSignals.samples || {};
  for (const samples of Object.values(sampleGroups)) {
    for (const sample of Array.isArray(samples) ? samples : []) {
      if (typeof sample.seed !== "string" || !sample.seed.startsWith(`${expectedBaseSeed}:`)) {
        throw new Error(`${label} 决策信号样本包含无法回溯到固定 baseSeed 的 seed`);
      }
    }
  }

  for (const game of summary.performance?.slowestGames || []) {
    if (typeof game.seed !== "string" || !game.seed.startsWith(`${expectedBaseSeed}:`)) {
      throw new Error(`${label} slowestGames 包含无法回溯到固定 baseSeed 的 seed`);
    }
  }
  for (const sample of summary.performance?.slowestDecisions || []) {
    if (typeof sample.seed !== "string" || !sample.seed.startsWith(`${expectedBaseSeed}:`)) {
      throw new Error(`${label} slowestDecisions 包含无法回溯到固定 baseSeed 的 seed`);
    }
  }
}

/**
 * 作用：
 * 校验混编 headless 回归已经把座位难度和阵容统计落到摘要里。
 *
 * 为什么这样写：
 * 这轮新增能力的重点不是“再多跑几局”，而是让 `2-3 中级 + 2-3 初级` 的随机混编可复盘；
 * 如果 summary 里拿不到阵容标签和玩家难度映射，后续分析就没法真正定位中级 AI 的问题。
 *
 * 输入：
 * @param {object} result - `runMixedHeadlessRegression` 的返回值。
 *
 * 输出：
 * @returns {void} 校验失败时直接抛错。
 *
 * 注意：
 * - 这里只校验结构和约束，不要求某一轮样本一定出现某种胜负比例。
 * - 每局必须恰好是 `2/3` 或 `3/2` 的初中级分布。
 */
function validateMixedHeadlessSummary(result) {
  const summary = result?.summary;
  if (!summary || summary.mode !== "mixed_lineup") {
    throw new Error("混编 headless 回归缺少 mode=mixed_lineup 标记");
  }
  if (!Array.isArray(summary.lineupBreakdown) || summary.lineupBreakdown.length === 0) {
    throw new Error("混编 headless 回归缺少 lineupBreakdown");
  }
  if (!summary.playerDifficultyBreakdown?.beginner || !summary.playerDifficultyBreakdown?.intermediate) {
    throw new Error("混编 headless 回归缺少初级 / 中级 playerDifficultyBreakdown");
  }
  for (const game of result.games || []) {
    if (!game.summary.completed) {
      continue;
    }
    const entries = Object.values(game.summary.playerDifficulties || {});
    if (entries.length !== 5) {
      throw new Error(`混编对局 ${game.summary.seed} 的 playerDifficulties 数量不是 5`);
    }
    const intermediateCount = entries.filter((difficulty) => difficulty === "intermediate").length;
    const beginnerCount = entries.filter((difficulty) => difficulty === "beginner").length;
    if (!((intermediateCount === 2 && beginnerCount === 3) || (intermediateCount === 3 && beginnerCount === 2))) {
      throw new Error(`混编对局 ${game.summary.seed} 的阵容不是 2/3 或 3/2：${JSON.stringify(game.summary.playerDifficulties)}`);
    }
    if (typeof game.summary.lineupLabel !== "string" || !game.summary.lineupLabel.startsWith("mixed-")) {
      throw new Error(`混编对局 ${game.summary.seed} 缺少 mixed 阵容标签`);
    }
  }
}

/**
 * 作用：
 * 以脚本方式执行 headless 全游戏回归，并向测试框架输出简要结果。
 *
 * 为什么这样写：
 * 现有单测基建是“每个 suite 独立跑一个 Node 脚本”，这里保持同样形式最容易接入当前 `regressions.test.js`。
 *
 * 输入：
 * @param {void} - 参数直接来自命令行。
 *
 * 输出：
 * @returns {void} 成功时打印摘要，失败时抛出异常退出非零状态。
 *
 * 注意：
 * - 默认会写出日志与分析文件，不要把输出目录设到临时不可见位置。
 * - 若要批量采样，可通过 `--games-per-difficulty` 和 `--seed` 覆盖默认值。
 */
function main() {
  const options = parseHeadlessRegressionArgs();
  const result = runHeadlessRegression(options);
  validateHeadlessDecisionSignals(result.summary);
  validateHeadlessPerformanceSummary(result.summary, "overall");
  validateFixedSeedRegressionArtifacts(result, options.baseSeed, "overall");
  validatePointRunRiskSamples(
    result.summary.decisionSignals?.samples?.pointRunRisk,
    "overall"
  );
  validateTurnAccessHoldSamples(
    result.summary.decisionSignals?.samples?.turnAccessHold,
    "overall"
  );
  validateConfirmedDangerousPointLeadSamples(
    result.summary.decisionSignals?.samples?.dangerousPointLead,
    "overall"
  );
  for (const difficulty of result.summary.difficulties || []) {
    validatePointRunRiskSamples(
      result.summary.byDifficulty?.[difficulty]?.decisionSignals?.samples?.pointRunRisk,
      difficulty
    );
    validateTurnAccessHoldSamples(
      result.summary.byDifficulty?.[difficulty]?.decisionSignals?.samples?.turnAccessHold,
      difficulty
    );
    validateConfirmedDangerousPointLeadSamples(
      result.summary.byDifficulty?.[difficulty]?.decisionSignals?.samples?.dangerousPointLead,
      difficulty
    );
  }
  const mixedResult = runMixedHeadlessRegression({
    games: 2,
    baseSeed: `${options.baseSeed}:mixed-validation`,
    outputDir: `${options.outputDir}/mixed-validation`,
    maxSteps: options.maxSteps,
  });
  validateHeadlessDecisionSignals(mixedResult.summary);
  validateHeadlessPerformanceSummary(mixedResult.summary, "mixed-overall");
  validateFixedSeedRegressionArtifacts(mixedResult, `${options.baseSeed}:mixed-validation`, "mixed-overall");
  validatePointRunRiskSamples(
    mixedResult.summary.decisionSignals?.samples?.pointRunRisk,
    "mixed-overall"
  );
  validateTurnAccessHoldSamples(
    mixedResult.summary.decisionSignals?.samples?.turnAccessHold,
    "mixed-overall"
  );
  validateConfirmedDangerousPointLeadSamples(
    mixedResult.summary.decisionSignals?.samples?.dangerousPointLead,
    "mixed-overall"
  );
  validateMixedHeadlessSummary(mixedResult);

  console.log("Headless full-game regression passed:");
  console.log(`- completion rate: ${result.summary.totals.completionRate}%`);
  console.log(`- games: ${result.summary.totals.completedGames}/${result.summary.totals.requestedGames}`);
  console.log(`- average steps: ${result.summary.totals.averageSteps}`);
  console.log(`- average tricks: ${result.summary.totals.averageTricks}`);
  console.log(`- selected turn_access_risk: ${result.summary.decisionSignals.selectedSignals.turnAccessRisk}`);
  console.log(`- selected point_run_risk: ${result.summary.decisionSignals.selectedSignals.pointRunRisk}`);
  console.log(`- selected turn_access_hold: ${result.summary.decisionSignals.selectedSignals.turnAccessHold}`);
  console.log(`- decision time p95: ${result.summary.performance.p95DecisionTimeMs} ms`);
  console.log(`- summary: ${result.files.summaryFile}`);
  console.log(`- analysis: ${result.files.analysisFile}`);
  console.log("Headless mixed-lineup validation passed:");
  console.log(`- lineups: ${mixedResult.summary.lineupBreakdown.map((entry) => `${entry.label}=${entry.count}`).join(", ")}`);
  console.log(`- mixed summary: ${mixedResult.files.summaryFile}`);
  console.log(`- mixed analysis: ${mixedResult.files.analysisFile}`);
}

main();
