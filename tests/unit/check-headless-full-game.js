const { parseHeadlessRegressionArgs, runHeadlessRegression } = require("../support/headless-full-game-runner");

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
    "dangerousPointLead",
    "revealedFriendControlShift",
  ];
  for (const key of signalKeys) {
    if (typeof overallSignals.selectedSignals?.[key] !== "number") {
      throw new Error(`headless 回归摘要缺少 overall decisionSignals.selectedSignals.${key}`);
    }
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

  console.log("Headless full-game regression passed:");
  console.log(`- completion rate: ${result.summary.totals.completionRate}%`);
  console.log(`- games: ${result.summary.totals.completedGames}/${result.summary.totals.requestedGames}`);
  console.log(`- average steps: ${result.summary.totals.averageSteps}`);
  console.log(`- average tricks: ${result.summary.totals.averageTricks}`);
  console.log(`- selected turn_access_risk: ${result.summary.decisionSignals.selectedSignals.turnAccessRisk}`);
  console.log(`- selected point_run_risk: ${result.summary.decisionSignals.selectedSignals.pointRunRisk}`);
  console.log(`- summary: ${result.files.summaryFile}`);
  console.log(`- analysis: ${result.files.analysisFile}`);
}

main();
