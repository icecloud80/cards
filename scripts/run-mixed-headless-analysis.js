const path = require("path");

const { runMixedHeadlessRegression } = require("../tests/support/headless-full-game-runner");

/**
 * 作用：
 * 解析混编 headless 批跑脚本的命令行参数。
 *
 * 为什么这样写：
 * 这个脚本主要给手动分析和复跑异常 seed 用，保留轻量 CLI 入口后，
 * 可以直接从终端指定局数、seed 和输出目录，而不用每次改代码。
 *
 * 输入：
 * @param {string[]} [argv=process.argv.slice(2)] - 传入脚本的参数列表。
 *
 * 输出：
 * @returns {{games: number, baseSeed: string, outputDir: string, maxSteps: number}} 归一化后的脚本参数。
 *
 * 注意：
 * - 未识别参数会直接抛错，避免静默拼写错误。
 * - 输出目录统一解析成绝对路径，方便日志直接打开。
 */
function parseMixedHeadlessArgs(argv = process.argv.slice(2)) {
  const options = {
    games: 20,
    baseSeed: "headless-mixed-regression",
    outputDir: path.resolve(process.cwd(), "artifacts/headless-regression/mixed-latest"),
    maxSteps: 4000,
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
    throw new Error(`未知参数：${argument}`);
  }

  if (!Number.isInteger(options.games) || options.games <= 0) {
    throw new Error(`games 必须是正整数，当前为 ${options.games}`);
  }
  if (!Number.isInteger(options.maxSteps) || options.maxSteps <= 0) {
    throw new Error(`max-steps 必须是正整数，当前为 ${options.maxSteps}`);
  }

  return options;
}

/**
 * 作用：
 * 以脚本形式执行混编 headless 批跑，并打印最关键的结果入口。
 *
 * 为什么这样写：
 * 这次需求的核心交付不是单纯跑测试，而是拿到“20 局混编胜负 + 可复盘日志 + 分析报告”；
 * 控制台只输出高信号摘要，详细内容统一落到 artifacts。
 *
 * 输入：
 * @param {void} - 参数直接来自命令行。
 *
 * 输出：
 * @returns {void} 成功时打印摘要，失败时抛错并以非零状态退出。
 *
 * 注意：
 * - 详细逐局内容不在 stdout 展开，避免把终端刷满。
 * - 如果失败，也会先产出日志目录和 summary，便于直接排障。
 */
function main() {
  const options = parseMixedHeadlessArgs();
  const result = runMixedHeadlessRegression(options);

  console.log("Headless mixed-lineup regression passed:");
  console.log(`- games: ${result.summary.totals.completedGames}/${result.summary.totals.requestedGames}`);
  console.log(`- completion rate: ${result.summary.totals.completionRate}%`);
  console.log(`- average steps: ${result.summary.totals.averageSteps}`);
  console.log(`- average tricks: ${result.summary.totals.averageTricks}`);
  console.log(`- banker wins: ${result.summary.winnerBreakdown.banker}`);
  console.log(`- defender wins: ${result.summary.winnerBreakdown.defender}`);
  console.log(
    `- lineups: ${result.summary.lineupBreakdown.map((entry) => `${entry.label}=${entry.count}`).join(", ")}`
  );
  console.log(`- intermediate decisions: ${result.summary.playerDifficultyBreakdown.intermediate.decisions}`);
  console.log(`- summary: ${result.files.summaryFile}`);
  console.log(`- analysis: ${result.files.analysisFile}`);
}

main();
