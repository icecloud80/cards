const { parseHeadlessRegressionArgs, runHeadlessRegression } = require("../support/headless-full-game-runner");

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

  console.log("Headless full-game regression passed:");
  console.log(`- completion rate: ${result.summary.totals.completionRate}%`);
  console.log(`- games: ${result.summary.totals.completedGames}/${result.summary.totals.requestedGames}`);
  console.log(`- average steps: ${result.summary.totals.averageSteps}`);
  console.log(`- average tricks: ${result.summary.totals.averageTricks}`);
  console.log(`- summary: ${result.files.summaryFile}`);
  console.log(`- analysis: ${result.files.analysisFile}`);
}

main();
