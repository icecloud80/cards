const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

/**
 * 作用：
 * 为首发性能回归构造最小牌对象。
 *
 * 为什么这样写：
 * 这条回归只关心 AI 首发决策链路，不依赖图片资源或真实副数信息；
 * 用轻量牌对象就足够把目标局面稳定还原出来。
 *
 * 输入：
 * @param {string} id - 当前牌的唯一标识。
 * @param {string} suit - 当前牌的原始牌花色。
 * @param {string} rank - 当前牌的点数。
 *
 * 输出：
 * @returns {{id: string, suit: string, rank: string, pack: number, img: string}} 可直接写入共享状态的牌对象。
 *
 * 注意：
 * - 这里固定 `pack: 0`，因为测试不依赖真实副本来源。
 * - `img` 只是兼容运行态字段，本测试不会渲染图片。
 */
function makeCard(id, suit, rank) {
  return {
    id,
    suit,
    rank,
    pack: 0,
    img: "",
  };
}

/**
 * 作用：
 * 把 `suit-rank` 标签列表转换成可复现的手牌数组。
 *
 * 为什么这样写：
 * 这条回归包含重复牌和多种结构组合；统一 helper 自动补唯一 ID 后，
 * 就不需要为每一张重复牌手写不同命名规则。
 *
 * 输入：
 * @param {number} playerId - 当前玩家 ID。
 * @param {string[]} labels - 当前玩家整手牌的标签列表。
 *
 * 输出：
 * @returns {Array<object>} 返回带稳定唯一 ID 的牌对象数组。
 *
 * 注意：
 * - 相同 `suit-rank` 会自动追加出现次数，避免重复牌 ID 冲突。
 * - 返回顺序保持与传入列表一致，方便和调试输出逐项核对。
 */
function buildHandFromLabels(playerId, labels) {
  const labelCounts = new Map();
  return labels.map((label, index) => {
    const nextCount = (labelCounts.get(label) || 0) + 1;
    labelCounts.set(label, nextCount);
    const [suit, rank] = label.split("-");
    return makeCard(`p${playerId}-${label}-${nextCount}-${index}`, suit, rank);
  });
}

/**
 * 作用：
 * 创建这条性能回归里使用的最小玩家对象。
 *
 * 为什么这样写：
 * AI 决策链路会读取名字、手牌、等级和积分等共享字段；
 * 统一补齐最小玩家结构，可以保证测试走的仍是正式业务入口。
 *
 * 输入：
 * @param {number} playerId - 当前玩家 ID。
 * @param {Array<object>} hand - 当前玩家完整手牌。
 *
 * 输出：
 * @returns {object} 可直接写入 `state.players` 的玩家对象。
 *
 * 注意：
 * - 本回归固定把 5 位玩家都视为 AI，避免人类分支干扰性能统计。
 * - 这里只补最小共享字段，不引入无关 UI 状态。
 */
function makePlayer(playerId, hand) {
  return {
    id: playerId,
    name: `玩家${playerId}`,
    isHuman: false,
    hand: [...hand],
    played: [],
    capturedPoints: 0,
    roundPoints: 0,
    level: "2",
  };
}

/**
 * 作用：
 * 复原“未站队 + 高主控牌 + 多结构首发”性能样本。
 *
 * 为什么这样写：
 * mixed 长样本里最慢的热点集中在复杂首发：
 * 1. 朋友未站队；
 * 2. 手牌里同时有高主、对子和多门高张；
 * 3. 首发候选大约十余手，旧实现会每手都跑 depth-2 rollout。
 * 这里把这类特征浓缩成最小状态，专门守住首发预算不回退。
 *
 * 输入：
 * @param {ReturnType<typeof loadHeadlessGameContext>["context"]} context - 当前 headless 上下文。
 *
 * 输出：
 * @returns {void} 只重建状态，不返回额外结果。
 *
 * 注意：
 * - 这条样本只服务性能门禁，不追求复刻完整一局真实对战。
 * - 当前目标是稳定复现“候选 10+ 且会走多层 rollout”的首发环境。
 */
function setupHeavyLeadBudgetScenario(context) {
  const hands = {
    1: buildHandFromLabels(1, [
      "joker-RJ", "joker-BJ", "diamonds-2", "diamonds-2", "spades-A",
      "spades-K", "spades-K", "spades-Q", "spades-Q", "clubs-2",
      "clubs-2", "clubs-A", "clubs-K", "hearts-A", "hearts-K",
      "hearts-Q", "diamonds-A", "diamonds-K", "spades-10", "hearts-10",
    ]),
    2: buildHandFromLabels(2, [
      "clubs-3", "clubs-4", "clubs-5", "clubs-6", "clubs-7",
      "hearts-3", "hearts-4", "hearts-5", "hearts-6", "hearts-7",
    ]),
    3: buildHandFromLabels(3, [
      "spades-3", "spades-4", "spades-5", "spades-6", "spades-7",
      "diamonds-3", "diamonds-4", "diamonds-5", "diamonds-6", "diamonds-7",
    ]),
    4: buildHandFromLabels(4, [
      "clubs-8", "clubs-9", "clubs-10", "clubs-J", "clubs-Q",
      "hearts-8", "hearts-9", "hearts-10", "hearts-J", "hearts-Q",
    ]),
    5: buildHandFromLabels(5, [
      "spades-8", "spades-9", "spades-10", "spades-J", "spades-Q",
      "diamonds-8", "diamonds-9", "diamonds-10", "diamonds-J", "diamonds-Q",
    ]),
  };

  context.state.gameOver = false;
  context.state.phase = "playing";
  context.state.aiDifficulty = "intermediate";
  context.state.aiPace = "fast";
  context.state.showDebugPanel = true;
  context.state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
  context.state.trumpSuit = "diamonds";
  context.state.levelRank = "2";
  context.state.declaration = { playerId: 1, suit: "diamonds", rank: "2", count: 1, cards: [] };
  context.state.currentTurnId = 1;
  context.state.leaderId = 1;
  context.state.bankerId = 1;
  context.state.hiddenFriendId = null;
  context.state.friendTarget = {
    suit: "spades",
    rank: "A",
    occurrence: 3,
    revealed: false,
    failed: false,
    matchesSeen: 0,
    label: "第三张黑桃 A",
  };
  context.state.trickNumber = 1;
  context.state.defenderPoints = 0;
  context.state.playHistory = [];
  context.state.lastAiDecision = null;
  context.state.aiDecisionHistory = [];
  context.state.aiDecisionHistorySeq = 0;
  context.state.currentTrick = [];
  context.state.currentTrickBeatCount = 0;
  context.state.leadSpec = null;
  context.state.lastTrick = null;
  context.state.bottomCards = [];
  context.state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
  context.state.exposedSuitVoid = {
    1: { clubs: false, diamonds: false, spades: false, hearts: false },
    2: { clubs: false, diamonds: false, spades: false, hearts: false },
    3: { clubs: false, diamonds: false, spades: false, hearts: false },
    4: { clubs: false, diamonds: false, spades: false, hearts: false },
    5: { clubs: false, diamonds: false, spades: false, hearts: false },
  };
  context.state.players = [
    makePlayer(1, hands[1]),
    makePlayer(2, hands[2]),
    makePlayer(3, hands[3]),
    makePlayer(4, hands[4]),
    makePlayer(5, hands[5]),
  ];
}

const { context } = loadHeadlessGameContext({ seed: "lead-rollout-budget" });

setupHeavyLeadBudgetScenario(context);

const decisionStart = performance.now();
const hintedCards = context.getLegalHintForPlayer(1);
const elapsedMs = performance.now() - decisionStart;
const latestDecision = context.state.aiDecisionHistory[context.state.aiDecisionHistory.length - 1] || null;

assert.equal(hintedCards.length, 1, "复杂首发预算修复后，AI 仍应返回一手合法首发");
assert.ok(latestDecision, "开启 debug 面板后，应记录本次中级 AI 首发决策");
assert.ok(
  elapsedMs < 1500,
  `复杂首发在 rollout 预算修复后应回到可接受范围，当前耗时 ${elapsedMs.toFixed(2)}ms`
);
assert.ok(
  (latestDecision.debugStats?.candidateCount || 0) <= 6,
  `复杂首发 shortlist 应被压到 6 手以内，当前为 ${latestDecision.debugStats?.candidateCount || 0}`
);
assert.ok(
  (latestDecision.debugStats?.completedRolloutCount || 0) <= 3,
  `复杂首发的 rollout 预算应压到 3 手以内，当前为 ${latestDecision.debugStats?.completedRolloutCount || 0}`
);
assert.ok(
  Array.isArray(latestDecision.candidateEntries)
  && latestDecision.candidateEntries.some((entry) => (
    Array.isArray(entry.rolloutTriggerFlags) && entry.rolloutTriggerFlags.includes("rollout_skipped_by_budget")
  )),
  "复杂首发 shortlist 里应显式保留 rollout_skipped_by_budget 标记，便于复盘预算命中"
);

const playSucceeded = context.playCards(
  1,
  hintedCards.map((card) => card.id),
  { skipResolveDelay: true, skipStartTurn: true }
);
assert.equal(playSucceeded, true, "性能预算修复后，首发输出的牌仍必须保持合法");

console.log("AI lead rollout budget regression passed.");
