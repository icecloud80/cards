const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

/**
 * 作用：
 * 为性能回归构造最小牌对象。
 *
 * 为什么这样写：
 * 这条回归只关心 AI 决策链路，不依赖图片资源或真实副数信息；
 * 统一用轻量牌对象即可把日志里的复盘局面稳定还原。
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
 * 第六轮性能回归需要大量重复牌面；统一在这里自动补唯一 ID，
 * 可以避免每张重复牌都手写不同的命名规则。
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
 * - 返回顺序保持与传入列表一致，方便和日志逐行核对。
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
 * `playCards(...)` 与 AI 决策链路会读取名字、手牌、等级、积分等共享字段；
 * 统一补齐最小玩家结构，可以保证复盘脚本和真实运行态使用同一套字段口径。
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
 * - `roundPoints / capturedPoints` 会在前五轮回放过程中自动被真实规则更新。
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
 * 从当前玩家手牌里按标签精确取出一组牌 ID。
 *
 * 为什么这样写：
 * 性能回归需要严格按日志里的真实出牌顺序回放；
 * 统一 helper 能保证重复牌场景下每张牌只会被拿一次，不会误取到同名副本。
 *
 * 输入：
 * @param {ReturnType<typeof loadHeadlessGameContext>["context"]} context - 当前 headless 上下文。
 * @param {number} playerId - 出牌玩家 ID。
 * @param {string[]} labels - 本次要打出的 `suit-rank` 标签列表。
 *
 * 输出：
 * @returns {string[]} 返回可直接传给 `playCards(...)` 的牌 ID 列表。
 *
 * 注意：
 * - 若当前玩家手里缺少任意一张目标牌，必须直接抛错，说明样本构造已失真。
 * - 同一张牌在一次出牌里不能被重复拿取。
 */
function getCardIdsForLabels(context, playerId, labels) {
  const usedCardIds = new Set();
  return labels.map((label) => {
    const matchedCard = context.getPlayer(playerId).hand.find((card) =>
      `${card.suit}-${card.rank}` === label && !usedCardIds.has(card.id)
    );
    assert.ok(matchedCard, `玩家${playerId} 应持有 ${label}`);
    usedCardIds.add(matchedCard.id);
    return matchedCard.id;
  });
}

/**
 * 作用：
 * 按日志标签回放一手真实出牌。
 *
 * 为什么这样写：
 * 这条性能回归的目标是复现“前五轮结束后，第六轮玩家 2 跟牌卡顿”；
 * 直接通过业务入口回放，能保证断门、抓分、朋友进度和上一轮状态全部按真实规则推进。
 *
 * 输入：
 * @param {ReturnType<typeof loadHeadlessGameContext>["context"]} context - 当前 headless 上下文。
 * @param {number} playerId - 当前出牌玩家 ID。
 * @param {string[]} labels - 本次要出的牌标签列表。
 *
 * 输出：
 * @returns {void} 只推进共享状态，不返回额外结果。
 *
 * 注意：
 * - 必须开启 `skipResolveDelay / skipStartTurn`，避免测试被计时器和异步回合推进干扰。
 * - 这里只服务于固定样本回放，不用于正式业务逻辑。
 */
function playByLabels(context, playerId, labels) {
  const cardIds = getCardIdsForLabels(context, playerId, labels);
  const playSucceeded = context.playCards(playerId, cardIds, {
    skipResolveDelay: true,
    skipStartTurn: true,
  });
  assert.equal(playSucceeded, true, `玩家${playerId} 应能合法打出 ${labels.join("、")}`);
}

/**
 * 作用：
 * 复原“你给的日志第六轮前后”性能样本，并把状态推进到玩家 2 跟牌前。
 *
 * 为什么这样写：
 * 线上卡顿不是抽象的“复杂局面”，而是特定日志里：
 * 1. 打家叫第三张黑桃 A；
 * 2. 前五轮已经形成较长公开历史；
 * 3. 第六轮由玩家 1 首发 `♣J、♣J、♣Q、♣Q、♣A`；
 * 这里把这段固定下来，后续哪怕 AI 其它行为继续演进，也能稳定守住这个卡顿点不回退。
 *
 * 输入：
 * @param {ReturnType<typeof loadHeadlessGameContext>["context"]} context - 当前 headless 上下文。
 *
 * 输出：
 * @returns {void} 只重建状态，不返回额外结果。
 *
 * 注意：
 * - 这条样本只还原性能相关的最小状态，不依赖完整发牌、翻底和扣底流程。
 * - 底牌内容沿用日志里的真实 7 张，避免状态评估链读取到底牌字段时失真。
 */
function setupRoundSixHeavyFollowScenario(context) {
  const fullHands = {
    1: buildHandFromLabels(1, [
      "spades-3", "spades-5", "spades-8", "joker-RJ", "joker-RJ", "spades-Q", "spades-Q", "spades-K", "spades-K",
      "clubs-J", "clubs-J", "clubs-Q", "clubs-Q", "clubs-A", "spades-A", "spades-2", "diamonds-9", "diamonds-9", "spades-10", "spades-10",
      "clubs-4", "hearts-8", "hearts-K", "diamonds-2", "clubs-6", "joker-BJ", "clubs-8", "spades-7", "diamonds-Q", "hearts-2", "clubs-10",
    ]),
    2: buildHandFromLabels(2, [
      "spades-4", "spades-6", "spades-K", "diamonds-6", "diamonds-6", "spades-5", "spades-9", "spades-J", "spades-Q",
      "clubs-4", "hearts-4", "clubs-5", "hearts-6", "clubs-Q", "diamonds-10", "joker-BJ", "diamonds-8", "diamonds-8", "hearts-7", "hearts-9",
      "diamonds-4", "hearts-Q", "hearts-Q", "clubs-2", "spades-2", "diamonds-A", "diamonds-J", "hearts-10", "diamonds-Q", "hearts-5", "hearts-A",
    ]),
    3: buildHandFromLabels(3, [
      "spades-8", "spades-9", "spades-5", "diamonds-3", "diamonds-4", "clubs-3", "hearts-3", "clubs-4", "spades-10",
      "clubs-6", "clubs-8", "clubs-9", "clubs-9", "clubs-A", "hearts-10", "diamonds-10", "diamonds-7", "diamonds-K", "hearts-4", "hearts-6",
      "clubs-K", "hearts-J", "hearts-J", "diamonds-Q", "clubs-A", "clubs-2", "hearts-K", "hearts-8", "spades-2", "diamonds-2", "hearts-A",
    ]),
    4: buildHandFromLabels(4, [
      "spades-A", "spades-A", "spades-7", "diamonds-J", "diamonds-J", "hearts-3", "spades-7", "spades-8", "spades-J",
      "hearts-4", "hearts-5", "hearts-6", "hearts-8", "clubs-K", "joker-RJ", "diamonds-3", "diamonds-5", "diamonds-5", "hearts-10", "hearts-K",
      "diamonds-2", "hearts-7", "hearts-7", "diamonds-4", "hearts-9", "diamonds-6", "hearts-2", "hearts-5", "diamonds-7", "diamonds-10", "diamonds-K",
    ]),
    5: buildHandFromLabels(5, [
      "spades-4", "spades-6", "spades-9", "diamonds-A", "diamonds-A", "hearts-3", "clubs-6", "clubs-8", "spades-J",
      "clubs-5", "clubs-7", "clubs-7", "clubs-9", "clubs-J", "hearts-9", "diamonds-K", "diamonds-3", "diamonds-5", "hearts-J", "hearts-Q",
      "clubs-5", "hearts-A", "diamonds-7", "diamonds-8", "clubs-10", "diamonds-9", "clubs-10", "clubs-2", "hearts-2", "joker-BJ", "clubs-K",
    ]),
  };

  const trickPlays = [
    { leader: 4, plays: { 4: ["spades-A"], 5: ["spades-4"], 1: ["spades-3"], 2: ["spades-4"], 3: ["spades-8"] } },
    { leader: 4, plays: { 4: ["spades-A"], 5: ["spades-6"], 1: ["spades-5"], 2: ["spades-6"], 3: ["spades-9"] } },
    { leader: 4, plays: { 4: ["spades-7"], 5: ["spades-9"], 1: ["spades-8"], 2: ["spades-K"], 3: ["spades-5"] } },
    { leader: 2, plays: { 2: ["diamonds-6", "diamonds-6"], 3: ["diamonds-3", "diamonds-4"], 4: ["diamonds-J", "diamonds-J"], 5: ["diamonds-A", "diamonds-A"], 1: ["joker-RJ", "joker-RJ"] } },
    { leader: 1, plays: { 1: ["spades-Q", "spades-Q", "spades-K", "spades-K"], 2: ["spades-5", "spades-9", "spades-J", "spades-Q"], 3: ["clubs-3", "hearts-3", "clubs-4", "spades-10"], 4: ["hearts-3", "spades-7", "spades-8", "spades-J"], 5: ["hearts-3", "clubs-6", "clubs-8", "spades-J"] } },
  ];

  context.state.gameOver = false;
  context.state.phase = "playing";
  context.state.aiDifficulty = "advanced";
  context.state.aiPace = "fast";
  context.state.showDebugPanel = true;
  context.state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
  context.state.trumpSuit = "diamonds";
  context.state.levelRank = "2";
  context.state.declaration = { playerId: 4, suit: "diamonds", rank: "2", count: 1, cards: [] };
  context.state.currentTurnId = 4;
  context.state.leaderId = 4;
  context.state.bankerId = 4;
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
  context.state.bottomCards = [
    makeCard("bottom-1", "clubs", "7"),
    makeCard("bottom-2", "clubs", "3"),
    makeCard("bottom-3", "clubs", "3"),
    makeCard("bottom-4", "spades", "6"),
    makeCard("bottom-5", "spades", "4"),
    makeCard("bottom-6", "spades", "3"),
    makeCard("bottom-7", "spades", "3"),
  ];
  context.state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
  context.state.exposedSuitVoid = {
    1: { clubs: false, diamonds: false, spades: false, hearts: false },
    2: { clubs: false, diamonds: false, spades: false, hearts: false },
    3: { clubs: false, diamonds: false, spades: false, hearts: false },
    4: { clubs: false, diamonds: false, spades: false, hearts: false },
    5: { clubs: false, diamonds: false, spades: false, hearts: false },
  };
  context.state.players = [
    makePlayer(1, fullHands[1]),
    makePlayer(2, fullHands[2]),
    makePlayer(3, fullHands[3]),
    makePlayer(4, fullHands[4]),
    makePlayer(5, fullHands[5]),
  ];

  for (const trick of trickPlays) {
    const order = [trick.leader];
    while (order.length < 5) {
      order.push((order[order.length - 1] % 5) + 1);
    }
    for (const playerId of order) {
      playByLabels(context, playerId, trick.plays[playerId]);
    }
  }

  playByLabels(context, 1, ["clubs-J", "clubs-J", "clubs-Q", "clubs-Q", "clubs-A"]);
}

const { context } = loadHeadlessGameContext({ seed: "round6-heavy-follow-budget" });

setupRoundSixHeavyFollowScenario(context);

const decisionStart = performance.now();
const hintedCards = context.getLegalHintForPlayer(2);
const elapsedMs = performance.now() - decisionStart;
const latestDecision = context.state.aiDecisionHistory[context.state.aiDecisionHistory.length - 1] || null;

assert.equal(hintedCards.length, 5, "第六轮玩家2的高级 AI 跟牌应返回一手 5 张合法牌");
assert.ok(latestDecision, "开启 debug 面板后，应记录本次高级 AI 跟牌决策");
assert.ok(
  elapsedMs < 1500,
  `第六轮复杂跟牌在 rollout 预算修复后应回到可接受范围，当前耗时 ${elapsedMs.toFixed(2)}ms`
);
assert.ok(
  (latestDecision.debugStats?.candidateCount || 0) <= 4,
  `复杂 5 张跟牌的 rollout shortlist 应被压到 4 手以内，当前为 ${latestDecision.debugStats?.candidateCount || 0}`
);
assert.equal(
  latestDecision.debugStats?.maxRolloutDepth || 0,
  0,
  "最重的 5 张复杂跟牌样本应直接退回 heuristic shortlist，不再继续 rollout 扩展"
);

const playSucceeded = context.playCards(
  2,
  hintedCards.map((card) => card.id),
  { skipResolveDelay: true, skipStartTurn: true }
);
assert.equal(playSucceeded, true, "性能预算修复后，玩家2输出的 5 张跟牌仍必须保持合法");

console.log("AI follow rollout budget regression passed.");
