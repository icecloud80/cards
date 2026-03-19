const assert = require("node:assert/strict");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

const STUCK_REGRESSION_SEED = "ZSO1hGI883r:beginner:game-11";

/**
 * 作用：
 * 把当前 headless 场景里的 5 个座位都切成托管初级 AI。
 *
 * 为什么这样写：
 * 这条回归要复现的是“全托管批跑”里发牌收口卡死的问题，
 * 因此必须显式关闭 1 号位的人类身份，避免又走回正式 UI 的人工补亮分支。
 *
 * 输入：
 * @param {object} context - 当前 headless 游戏上下文。
 *
 * 输出：
 * @returns {void} 直接原地改写玩家托管状态。
 *
 * 注意：
 * - 必须在 `setupGame()` 后调用，因为新局初始化会重建玩家数组。
 * - 这里只锁定回归场景，不改正式局内托管入口。
 */
function setAllPlayersToManagedBeginnerAi(context) {
  for (const player of context.state.players) {
    player.isHuman = false;
    player.aiDifficulty = "beginner";
  }
}

/**
 * 作用：
 * 复现“发牌结束时玩家1已托管，但仍被错误送进人工补亮等待”的历史问题。
 *
 * 为什么这样写：
 * 旧实现里，发牌阶段最后一拍只要发现玩家1存在补亮方案，
 * 就会无条件进入 `awaitingHumanDeclaration`；
 * 在 headless 全托管批跑中，这会把流程卡成“还在 dealing，但没人会点补亮”的死状态。
 * 这里用真实失败 seed 把收口固定下来，确保后续不会再回退。
 *
 * 输入：
 * @param {void} - 直接使用固定的历史失败 seed。
 *
 * 输出：
 * @returns {{phase: string, declaration: object|null, awaitingHumanDeclaration: boolean}} 当前收口后的关键状态摘要。
 *
 * 注意：
 * - 这条回归只覆盖发牌结束这一瞬间，不负责把整局继续打完。
 * - 若未来该 seed 的洗牌或亮主启发式调整，这里仍应保持“托管玩家不进入人工补亮等待”的核心断言。
 */
function runManagedFinalDeclarationRegression() {
  const { context } = loadHeadlessGameContext({ seed: STUCK_REGRESSION_SEED });
  context.state.aiDifficulty = "beginner";
  context.setupGame();
  setAllPlayersToManagedBeginnerAi(context);
  context.startDealing();

  while (context.state.phase === "dealing" && context.state.dealIndex < context.state.dealCards.length) {
    context.dealOneCard();
  }

  assert.equal(context.state.dealIndex, context.state.dealCards.length, "regression setup should finish dealing all cards before the final收口检查");
  context.dealOneCard();

  return {
    phase: context.state.phase,
    declaration: context.state.declaration,
    awaitingHumanDeclaration: context.state.awaitingHumanDeclaration,
  };
}

const result = runManagedFinalDeclarationRegression();

assert.equal(result.awaitingHumanDeclaration, false, "managed player1 should not enter human declaration waiting after dealing finishes");
assert.equal(result.phase, "countering", "managed player1 should auto-resolve the final declaration opportunity and enter countering");
assert.ok(result.declaration, "managed player1 should leave dealing with a declaration object");
assert.equal(result.declaration.playerId, 1, "the final managed declaration should belong to player1");
assert.equal(result.declaration.suit, "notrump", "this historical regression sample should auto-declare notrump after the final card");
assert.equal(result.declaration.count, 2, "this historical regression sample should keep the original two-red-joker declaration");

console.log("Managed final declaration regression passed:");
console.log(`- phase after dealing: ${result.phase}`);
console.log(`- declaration: 玩家${result.declaration.playerId} ${result.declaration.suit} x${result.declaration.count}`);
