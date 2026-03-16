const path = require("path");

/**
 * 作用：
 * 判断当前运行是否需要跳过无 UI 全流程回归。
 *
 * 为什么这样写：
 * pre-commit 需要根据改动规模决定是否执行耗时较长的 headless full-game，而常规 `npm test` 仍应保留完整覆盖。
 *
 * 输入：
 * @param {void} - 通过环境变量读取开关。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前应跳过 headless full-game suite。
 *
 * 注意：
 * - 仅把字符串 `"1"` 视为开启，避免其他环境值误触发。
 * - 默认必须返回 `false`，保证常规测试不被静默降级。
 */
function shouldSkipHeadlessFullGameSuite() {
  return process.env.SKIP_HEADLESS_FULL_GAME === "1";
}

const UNIT_TEST_SUITES = [
  {
    name: "AI declaration strategy regression",
    file: path.join(__dirname, "check-ai-declaration-strategy.js"),
  },
  {
    name: "AI friend strategy regression",
    file: path.join(__dirname, "check-ai-friend-strategy.js"),
  },
  {
    name: "AI bury strategy regression",
    file: path.join(__dirname, "check-bury-strategy.js"),
  },
  {
    name: "Bottom scoring regression",
    file: path.join(__dirname, "check-bottom-scoring.js"),
  },
  {
    name: "Bottom reveal regression",
    file: path.join(__dirname, "check-bottom-reveal.js"),
  },
  {
    name: "AI intermediate foundation regression",
    file: path.join(__dirname, "check-ai-intermediate-foundation.js"),
  },
  {
    name: "AI intermediate search regression",
    file: path.join(__dirname, "check-ai-intermediate-search.js"),
  },
  {
    name: "AI memory strategy regression",
    file: path.join(__dirname, "check-ai-memory-strategy.js"),
  },
  {
    name: "Play announcement regression",
    file: path.join(__dirname, "check-play-announcements.js"),
  },
  {
    name: "Start lobby regression",
    file: path.join(__dirname, "check-start-lobby.js"),
  },
  {
    name: "Mobile UI isolation regression",
    file: path.join(__dirname, "check-mobile-ui-isolation.js"),
  },
  {
    name: "PC card-face sprite regression",
    file: path.join(__dirname, "check-card-face-sprite.js"),
  },
  {
    name: "PC compact UI regression",
    file: path.join(__dirname, "check-hand-panel-snapshot.js"),
  },
  {
    name: "Static template regression",
    file: path.join(__dirname, "check-static-template.js"),
  },
  {
    name: "Final-hand flow regression",
    file: path.join(__dirname, "check-final-hand-flow.js"),
  },
  {
    name: "Headless full-game regression",
    file: path.join(__dirname, "check-headless-full-game.js"),
    skip: shouldSkipHeadlessFullGameSuite(),
  },
  {
    name: "Result subinfo regression",
    file: path.join(__dirname, "check-result-subinfo.js"),
  },
  {
    name: "Throw pattern regression",
    file: path.join(__dirname, "check-throw-patterns.js"),
  },
].filter((suite) => !suite.skip);

module.exports = {
  UNIT_TEST_SUITES,
};
