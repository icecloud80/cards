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
    name: "Human declaration options regression",
    file: path.join(__dirname, "check-human-declaration-options.js"),
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
    name: "AI grade-bottom strategy regression",
    file: path.join(__dirname, "check-ai-grade-bottom-strategy.js"),
  },
  {
    name: "AI follow candidate limit regression",
    file: path.join(__dirname, "check-ai-follow-candidate-limit.js"),
  },
  {
    name: "Play announcement regression",
    file: path.join(__dirname, "check-play-announcements.js"),
  },
  {
    name: "AI pace settings regression",
    file: path.join(__dirname, "check-ai-pace-settings.js"),
  },
  {
    name: "Staged change threshold regression",
    file: path.join(__dirname, "check-staged-change-lines.js"),
  },
  {
    name: "Local preview server regression",
    file: path.join(__dirname, "check-local-preview-server.js"),
  },
  {
    name: "Preview auto-start regression",
    file: path.join(__dirname, "check-preview-auto-start.js"),
  },
  {
    name: "Start lobby regression",
    file: path.join(__dirname, "check-start-lobby.js"),
  },
  // 锁住 PC 开始页和手游开始页共用同一套主视觉插画，避免桌面端回退到旧静态图。
  {
    name: "PC start lobby hero regression",
    file: path.join(__dirname, "check-pc-start-lobby-hero.js"),
  },
  {
    name: "Round reset button regression",
    file: path.join(__dirname, "check-round-reset-button.js"),
  },
  {
    name: "UI smoke config regression",
    file: path.join(__dirname, "check-ui-smoke-config.js"),
  },
  {
    name: "Mobile UI isolation regression",
    file: path.join(__dirname, "check-mobile-ui-isolation.js"),
  },
  {
    name: "Mobile topbar layout regression",
    file: path.join(__dirname, "check-mobile-topbar-layout.js"),
  },
  {
    name: "Mobile top status card regression",
    file: path.join(__dirname, "check-mobile-top-status-card.js"),
  },
  {
    name: "Mobile hand group chip regression",
    file: path.join(__dirname, "check-mobile-hand-group-chip.js"),
  },
  {
    name: "Mobile auto-manage regression",
    file: path.join(__dirname, "check-mobile-auto-manage.js"),
  },
  // 锁住手游结算弹窗的紧凑布局，避免再次回退成高留白版本。
  {
    name: "Mobile result overlay UI regression",
    file: path.join(__dirname, "check-mobile-result-overlay-ui.js"),
  },
  // 锁住手游翻底公示层的读秒关闭胶囊和卡位渲染结构。
  {
    name: "Mobile bottom reveal UI regression",
    file: path.join(__dirname, "check-mobile-bottom-reveal-ui.js"),
  },
  {
    name: "Mobile start entry regression",
    file: path.join(__dirname, "check-mobile-start-entry.js"),
  },
  {
    name: "Mobile bootstrap fallback regression",
    file: path.join(__dirname, "check-mobile-bootstrap-fallbacks.js"),
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
    name: "PC topbar difficulty regression",
    file: path.join(__dirname, "check-pc-topbar-difficulty.js"),
  },
  {
    name: "PC friend retarget UI regression",
    file: path.join(__dirname, "check-pc-friend-retarget-ui.js"),
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
    name: "Result settlement summary regression",
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
