const assert = require("node:assert/strict");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

/**
 * 作用：
 * 创建一张适合翻底回归场景使用的测试牌。
 *
 * 为什么这样写：
 * 翻底规则只依赖花色、点数和唯一 ID，统一工厂函数可以让测试数据更紧凑、可读。
 *
 * 输入：
 * @param {string} id - 这张测试牌的唯一标识。
 * @param {string} suit - 业务上的花色，普通牌用四门花色，王统一用 `joker`。
 * @param {string} rank - 业务上的点数或王值。
 *
 * 输出：
 * @returns {{id:string,suit:string,rank:string}} 一张可直接塞进 `state.bottomCards` 的测试牌。
 *
 * 注意：
 * - 这里不需要图片路径，翻底判定只看花色和点数。
 * - ID 仍需保持唯一，避免后续逻辑误把两张牌视为同一张。
 */
function makeCard(id, suit, rank) {
  return { id, suit, rank };
}

/**
 * 作用：
 * 把牌局状态重置成“无人亮主、准备翻底”的最小可测场景。
 *
 * 为什么这样写：
 * `finishDealingPhase` 会读取玩家等级、手牌和底牌，因此每个子场景都需要一套干净且可复现的初始状态。
 *
 * 输入：
 * @param {object} context - headless 测试上下文导出的 API 集合。
 * @param {Array<object>} bottomCards - 本次要用于翻底的底牌顺序。
 * @param {string} [playerLevel="2"] - 先抓牌玩家本局使用的级别点数。
 *
 * 输出：
 * @returns {void} 直接原地修改上下文中的全局状态。
 *
 * 注意：
 * - 所有玩家手牌都要清空，避免“玩家 1 还能补亮”打断翻底流程。
 * - `bottomCards` 的顺序就是翻底顺序，测试里不要再排序。
 */
function prepareBottomRevealScenario(context, bottomCards, playerLevel = "2") {
  context.setupGame();
  context.state.playerLevels = { 1: playerLevel, 2: "2", 3: "2", 4: "2", 5: "2" };
  context.state.phase = "dealing";
  context.state.declaration = null;
  context.state.awaitingHumanDeclaration = false;
  context.state.nextFirstDealPlayerId = 1;
  context.state.bottomCards = bottomCards;
  context.state.bottomRevealCount = 0;
  context.state.logs = [];
  context.state.allLogs = [];
  context.state.players.forEach((player) => {
    player.hand = [];
    player.level = context.state.playerLevels[player.id];
  });
}

/**
 * 作用：
 * 执行翻底定主回归断言，覆盖“翻到即停”和“无触发时翻完整副底牌”两条路径。
 *
 * 为什么这样写：
 * 这次改动的核心风险在于：一旦翻底中途命中级牌或王，后面的底牌不应再被公开；
 * 同时仍要保留“没有即时触发牌时翻完 7 张再按最大首见牌定主”的旧规则。
 *
 * 输入：
 * @param {void} - 直接创建新的 headless 上下文并运行三个子场景。
 *
 * 输出：
 * @returns {{levelRevealCount:number,jokerRevealCount:number,fullRevealCount:number,fullRevealSuit:string}} 便于打印的人类可读结果摘要。
 *
 * 注意：
 * - 级牌场景要验证“第二张命中就停”。
 * - 王场景要验证“先翻到王即无主”，即使后面还有级牌也不能继续翻。
 */
function runSuite() {
  const { context } = loadHeadlessGameContext({ seed: "bottom-reveal-regression" });

  prepareBottomRevealScenario(context, [
    makeCard("level-a", "hearts", "7"),
    makeCard("level-b", "spades", "2"),
    makeCard("level-c", "clubs", "A"),
    makeCard("level-d", "diamonds", "K"),
    makeCard("level-e", "clubs", "9"),
    makeCard("level-f", "hearts", "4"),
    makeCard("level-g", "spades", "6"),
  ]);
  context.finishDealingPhase();
  assert.equal(context.state.phase, "bottomReveal", "翻到底牌级牌后应进入翻底展示阶段");
  assert.equal(context.state.declaration?.suit, "spades", "第二张级牌应直接定黑桃为主");
  assert.equal(context.state.declaration?.revealCount, 2, "第二张命中级牌后应只翻开前两张");
  assert.equal(context.state.bottomRevealCount, 2, "公示阶段应只记录实际翻开的两张底牌");
  const levelRevealCount = context.state.bottomRevealCount;

  prepareBottomRevealScenario(context, [
    makeCard("joker-a", "clubs", "K"),
    makeCard("joker-b", "hearts", "9"),
    makeCard("joker-c", "joker", "BJ"),
    makeCard("joker-d", "spades", "2"),
    makeCard("joker-e", "diamonds", "A"),
    makeCard("joker-f", "clubs", "8"),
    makeCard("joker-g", "hearts", "6"),
  ]);
  context.finishDealingPhase();
  assert.equal(context.state.declaration?.suit, "notrump", "翻到底牌中的王后应立即定为无主");
  assert.equal(context.state.declaration?.revealCard?.rank, "BJ", "无主场景应记录触发定主的小王");
  assert.equal(context.state.declaration?.revealCount, 3, "第三张翻到王后不应继续公开后面的底牌");
  const jokerRevealCount = context.state.declaration?.revealCount || 0;

  prepareBottomRevealScenario(context, [
    makeCard("full-a", "hearts", "10"),
    makeCard("full-b", "clubs", "A"),
    makeCard("full-c", "diamonds", "8"),
    makeCard("full-d", "spades", "A"),
    makeCard("full-e", "hearts", "K"),
    makeCard("full-f", "clubs", "3"),
    makeCard("full-g", "diamonds", "9"),
  ]);
  context.finishDealingPhase();
  assert.equal(context.state.declaration?.suit, "clubs", "若没有级牌和王，应按第一次出现的最大牌定主");
  assert.equal(context.state.declaration?.revealCard?.suit, "clubs", "最大首见牌应记录为最先出现的梅花 A");
  assert.equal(context.state.declaration?.revealCount, 7, "没有即时触发牌时应翻完整副底牌");

  return {
    levelRevealCount,
    jokerRevealCount,
    fullRevealCount: context.state.declaration?.revealCount || 0,
    fullRevealSuit: context.state.declaration?.suit || "",
  };
}

const output = runSuite();

console.log("Bottom reveal regression passed:");
console.log(`- level trigger reveal count: ${output.levelRevealCount}`);
console.log(`- joker trigger reveal count: ${output.jokerRevealCount}`);
console.log(`- full reveal count: ${output.fullRevealCount}`);
console.log(`- fallback suit: ${output.fullRevealSuit}`);
