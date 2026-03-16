const assert = require("node:assert/strict");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

/**
 * 作用：
 * 生成 headless 回归里使用的最小牌对象。
 *
 * 为什么这样写：
 * 这条回归只关心规则花色、点数和唯一 ID，不需要完整图片与牌背资源；
 * 用统一 helper 构造样本牌，能让复现局面保持紧凑且容易核对。
 *
 * 输入：
 * @param {string} id - 当前牌的唯一标识。
 * @param {string} suit - 当前牌的原始牌花色。
 * @param {string} rank - 当前牌的点数。
 *
 * 输出：
 * @returns {{id: string, suit: string, rank: string, pack: number, img: string}} 可直接塞进 headless 状态的牌对象。
 *
 * 注意：
 * - 这里固定用 `pack: 0`，因为本回归不依赖副数来源。
 * - `img` 仅用于兼容业务数据结构，本测试不会渲染图片。
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
 * 构造用于复现“玩家3 主拖拉机跟牌卡住”的固定对局状态。
 *
 * 为什么这样写：
 * 这次线上样本的关键不是随机洗牌，而是“12 张主牌里合法主拖拉机在组合顺序较后”。
 * 把它固化成单局样本后，后续即使其它 AI 逻辑继续演进，也能稳定检查这个回归点不再倒退。
 *
 * 输入：
 * @param {ReturnType<typeof loadHeadlessGameContext>["context"]} context - 当前 headless 游戏上下文。
 *
 * 输出：
 * @returns {{expectedLabels: string[]}} 返回断言所需的目标合法跟牌标签。
 *
 * 注意：
 * - 这里只还原跟牌所需的最小状态，不依赖完整发牌流程。
 * - 玩家 3 必须同时拥有大量主牌和一手真实可出的主拖拉机。
 */
function setupPlayerThreeTractorFollowScenario(context) {
  const expectedLabels = ["hearts-9", "hearts-9", "hearts-J", "hearts-J"];
  const playerThreeHand = [
    makeCard("p3-c1", "clubs", "K"),
    makeCard("p3-c2", "clubs", "Q"),
    makeCard("p3-c3", "clubs", "9"),
    makeCard("p3-d1", "diamonds", "A"),
    makeCard("p3-d2", "diamonds", "Q"),
    makeCard("p3-d3", "diamonds", "8"),
    makeCard("p3-d4", "diamonds", "7"),
    makeCard("p3-s1", "spades", "A"),
    makeCard("p3-s2", "spades", "K"),
    makeCard("p3-s3", "spades", "Q"),
    makeCard("p3-s4", "spades", "Q"),
    makeCard("p3-s5", "spades", "9"),
    makeCard("p3-s6", "spades", "8"),
    makeCard("p3-s7", "spades", "7"),
    makeCard("p3-s8", "spades", "5"),
    makeCard("p3-s9", "spades", "5"),
    makeCard("p3-s10", "spades", "3"),
    makeCard("p3-s11", "spades", "3"),
    makeCard("p3-j1", "joker", "RJ"),
    makeCard("p3-d5", "diamonds", "2"),
    makeCard("p3-s12", "spades", "2"),
    makeCard("p3-h1", "hearts", "A"),
    makeCard("p3-h2", "hearts", "Q"),
    makeCard("p3-h3", "hearts", "J"),
    makeCard("p3-h4", "hearts", "J"),
    makeCard("p3-h5", "hearts", "9"),
    makeCard("p3-h6", "hearts", "9"),
    makeCard("p3-h7", "hearts", "6"),
    makeCard("p3-h8", "hearts", "4"),
    makeCard("p3-h9", "hearts", "3"),
  ];
  const leaderPlay = [
    makeCard("p1-h5a", "hearts", "5"),
    makeCard("p1-h5b", "hearts", "5"),
    makeCard("p1-h6a", "hearts", "6"),
    makeCard("p1-h6b", "hearts", "6"),
  ];
  const playerTwoPlay = [
    makeCard("p2-h3", "hearts", "3"),
    makeCard("p2-h4", "hearts", "4"),
    makeCard("p2-h7", "hearts", "7"),
    makeCard("p2-s2", "spades", "2"),
  ];

  /**
   * 作用：
   * 创建本回归里使用的最小玩家对象。
   *
   * 为什么这样写：
   * AI 跟牌逻辑只依赖玩家基础身份、手牌和记分字段；
   * 统一在这里补齐最小字段，可以避免每个玩家都手写一份重复结构。
   *
   * 输入：
   * @param {number} playerId - 当前玩家 ID。
   * @param {Array<object>} hand - 该玩家当前手牌。
   *
   * 输出：
   * @returns {object} 可直接写入 `state.players` 的玩家对象。
   *
   * 注意：
   * - 本回归固定把玩家 1 视作人类，其他玩家视作 AI。
   * - `roundPoints` 与 `capturedPoints` 虽不是本断言核心，但业务逻辑会读取它们。
   */
  function makePlayer(playerId, hand) {
    return {
      id: playerId,
      name: `玩家${playerId}`,
      isHuman: playerId === 1,
      hand: [...hand],
      played: [],
      level: "2",
      roundPoints: 0,
      capturedPoints: 0,
    };
  }

  context.state.players = [
    makePlayer(1, []),
    makePlayer(2, []),
    makePlayer(3, playerThreeHand),
    makePlayer(4, []),
    makePlayer(5, []),
  ];
  context.state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
  context.state.phase = "playing";
  context.state.gameOver = false;
  context.state.aiDifficulty = "beginner";
  context.state.aiPace = "fast";
  context.state.trumpSuit = "hearts";
  context.state.levelRank = "2";
  context.state.declaration = { playerId: 1, suit: "hearts", rank: "2" };
  context.state.bankerId = 1;
  context.state.currentTurnId = 3;
  context.state.leaderId = 1;
  context.state.trickNumber = 2;
  context.state.currentTrick = [
    { playerId: 1, cards: leaderPlay },
    { playerId: 2, cards: playerTwoPlay },
  ];
  context.state.currentTrickBeatCount = 0;
  context.state.leadSpec = {
    ok: true,
    type: "tractor",
    count: 4,
    suit: "trump",
    chainLength: 2,
    tupleSize: 2,
    power: 4,
    leaderId: 1,
  };
  context.state.friendTarget = {
    suit: "spades",
    rank: "A",
    occurrence: 1,
    matchesSeen: 0,
    revealed: false,
    failed: false,
  };
  context.state.hiddenFriendId = null;
  context.state.playHistory = [...leaderPlay, ...playerTwoPlay];
  context.state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
  context.state.exposedSuitVoid = {
    1: { clubs: false, diamonds: false, spades: false, hearts: false },
    2: { clubs: false, diamonds: false, spades: false, hearts: false },
    3: { clubs: false, diamonds: false, spades: false, hearts: false },
    4: { clubs: false, diamonds: false, spades: false, hearts: false },
    5: { clubs: false, diamonds: false, spades: false, hearts: false },
  };

  return { expectedLabels };
}

/**
 * 作用：
 * 把牌组转换成稳定的 `suit-rank` 标签序列，便于断言。
 *
 * 为什么这样写：
 * 这类回归更关心“AI 最终选到了哪组结构牌”，不关心 pack 与图片字段；
 * 压平成可读标签后，失败输出会比直接打印对象更容易复盘。
 *
 * 输入：
 * @param {Array<object>} cards - 待转换的牌组。
 *
 * 输出：
 * @returns {string[]} 返回按原顺序生成的标签数组。
 *
 * 注意：
 * - 这里只用于测试断言，不参与正式业务逻辑。
 * - 传入空值时返回空数组，避免测试辅助函数本身抛错。
 */
function toLabels(cards) {
  return Array.isArray(cards) ? Array.from(cards, (card) => `${card.suit}-${card.rank}`) : [];
}

const { context } = loadHeadlessGameContext({ seed: "regression-player3-tractor-follow" });
const { expectedLabels } = setupPlayerThreeTractorFollowScenario(context);

const hintedCards = context.getLegalHintForPlayer(3);
const searchedCards = context.findLegalSelectionBySearch(3);
const hintLabels = toLabels(hintedCards);
const searchLabels = toLabels(searchedCards);

assert.deepEqual(
  hintLabels,
  expectedLabels,
  "玩家3 在大量主牌场景下应直接拿到合法主拖拉机跟牌提示，不能再退回非法散主兜底"
);
assert.deepEqual(
  searchLabels,
  expectedLabels,
  "合法跟牌搜索应能扫到真实存在的主拖拉机，不能被组合上限提前截断"
);

const playSucceeded = context.playCards(3, hintedCards.map((card) => card.id), { skipStartTurn: true });
assert.equal(playSucceeded, true, "玩家3 的合法主拖拉机跟牌必须能正常提交并推进轮次");
assert.equal(context.state.currentTrick.length, 3, "玩家3 出牌成功后，本轮桌面应新增一手出牌记录");

console.log("AI follow candidate limit regression passed.");
