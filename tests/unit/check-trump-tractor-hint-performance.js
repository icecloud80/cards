const fs = require("fs");
const path = require("path");
const vm = require("vm");

/**
 * 作用：
 * 加载共享牌局脚本，构造一个可直接执行规则与 AI helper 的轻量测试上下文。
 *
 * 为什么这样写：
 * 这条回归只关心“自动选择 / 合法候选”链路，不需要完整 DOM；
 * 用最小 VM 上下文即可稳定复现主牌拖拉机场景，并精确统计是否还会落回组合枚举。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {object} 返回挂好共享脚本后的 VM context。
 *
 * 注意：
 * - 这里只保留测试所需的最小 DOM / 渲染桩，避免异步 UI 行为干扰断言。
 * - 脚本加载顺序必须与运行态保持一致，否则共享 helper 可能缺依赖。
 */
function loadGameContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  context.window = context;
  context.globalThis = context;
  context.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
  };
  context.CustomEvent = function CustomEvent(type, options = {}) {
    return { type, detail: options.detail };
  };
  context.document = {
    cookie: "",
    querySelector() {
      return null;
    },
    getElementById() {
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  context.sortPlayedCards = function sortPlayedCards(cards) {
    return [...cards].sort((a, b) => context.cardStrength(a) - context.cardStrength(b));
  };
  context.render = function render() {};
  context.renderScorePanel = function renderScorePanel() {};
  context.renderHand = function renderHand() {};
  context.renderCenterPanel = function renderCenterPanel() {};
  context.updateActionHint = function updateActionHint() {};
  context.appendLog = function appendLog() {};
  context.queueCenterAnnouncement = function queueCenterAnnouncement() {};

  vm.createContext(context);
  const files = [
    path.join(__dirname, "../../src/shared/config.js"),
    path.join(__dirname, "../../src/shared/rules.js"),
    path.join(__dirname, "../../src/shared/text.js"),
    path.join(__dirname, "../../src/shared/game.js"),
    path.join(__dirname, "../../src/shared/ai-shared.js"),
    path.join(__dirname, "../../src/shared/ai-beginner.js"),
    path.join(__dirname, "../../src/shared/ai-simulate.js"),
    path.join(__dirname, "../../src/shared/ai-objectives.js"),
    path.join(__dirname, "../../src/shared/ai-evaluate.js"),
    path.join(__dirname, "../../src/shared/ai-candidates.js"),
    path.join(__dirname, "../../src/shared/ai-intermediate.js"),
    path.join(__dirname, "../../src/shared/ai.js"),
  ];
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

/**
 * 作用：
 * 执行“主牌拖拉机自动选择不应回落到组合枚举”的回归断言。
 *
 * 为什么这样写：
 * 这次用户反馈的卡顿集中在“主牌拖拉机自动选择”；
 * 这里直接锁住候选层短路行为，确保同门且必须精确跟型时，提示链只走精确连组而不再全枚举组合。
 *
 * 输入：
 * @param {object} context - 已加载共享脚本的 VM context。
 *
 * 输出：
 * @returns {void} 断言失败时直接抛错。
 *
 * 注意：
 * - 场景特意构造为“玩家 1 拥有大量主牌且确实有主拖拉机可跟”。
 * - 一旦这里重新触发 `enumerateCombinations`，就说明性能短路失效，应视为回归。
 */
function runTrumpTractorHintPerformanceSuite(context) {
  const testSource = `
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    function makeCard(id, suit, rank) {
      return { id, suit, rank };
    }

    function basePlayer(id, hand, isHuman = false) {
      return {
        id,
        name: "玩家" + id,
        hand: sortHand(hand),
        played: [],
        capturedPoints: 0,
        roundPoints: 0,
        level: "2",
        isHuman,
      };
    }

    state.gameOver = false;
    state.phase = "playing";
    state.aiDifficulty = "intermediate";
    state.trumpSuit = "hearts";
    state.levelRank = "2";
    state.currentTurnId = 1;
    state.leaderId = 5;
    state.bankerId = 5;
    state.hiddenFriendId = null;
    state.friendTarget = null;
    state.trickNumber = 6;
    state.currentTrickBeatCount = 0;
    state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
    state.exposedSuitVoid = {
      1: { clubs: false, diamonds: false, spades: false, hearts: false },
      2: { clubs: false, diamonds: false, spades: false, hearts: false },
      3: { clubs: false, diamonds: false, spades: false, hearts: false },
      4: { clubs: false, diamonds: false, spades: false, hearts: false },
      5: { clubs: false, diamonds: false, spades: false, hearts: false },
    };

    state.players = [
      basePlayer(1, [
        makeCard("p1-joker-r", "joker", "RJ"),
        makeCard("p1-joker-b", "joker", "BJ"),
        makeCard("p1-h-a-1", "hearts", "A"),
        makeCard("p1-h-a-2", "hearts", "A"),
        makeCard("p1-h-k-1", "hearts", "K"),
        makeCard("p1-h-k-2", "hearts", "K"),
        makeCard("p1-h-q-1", "hearts", "Q"),
        makeCard("p1-h-q-2", "hearts", "Q"),
        makeCard("p1-h-j-1", "hearts", "J"),
        makeCard("p1-h-j-2", "hearts", "J"),
        makeCard("p1-d-2-1", "diamonds", "2"),
        makeCard("p1-d-2-2", "diamonds", "2"),
        makeCard("p1-s-9", "spades", "9"),
        makeCard("p1-c-8", "clubs", "8"),
      ], true),
      basePlayer(2, [makeCard("p2-s-a", "spades", "A")]),
      basePlayer(3, [makeCard("p3-c-a", "clubs", "A")]),
      basePlayer(4, [makeCard("p4-d-a", "diamonds", "A")]),
      basePlayer(5, [
        makeCard("lead-h-4-1", "hearts", "4"),
        makeCard("lead-h-4-2", "hearts", "4"),
        makeCard("lead-h-5-1", "hearts", "5"),
        makeCard("lead-h-5-2", "hearts", "5"),
      ]),
    ];

    state.currentTrick = [{
      playerId: 5,
      cards: sortPlayedCards([
        makeCard("lead-h-4-1", "hearts", "4"),
        makeCard("lead-h-4-2", "hearts", "4"),
        makeCard("lead-h-5-1", "hearts", "5"),
        makeCard("lead-h-5-2", "hearts", "5"),
      ]),
    }];
    state.leadSpec = classifyPlay(state.currentTrick[0].cards);

    let enumerateCallCount = 0;
    const originalEnumerateCombinations = enumerateCombinations;
    enumerateCombinations = function wrappedEnumerateCombinations(cards, count, limitOverride) {
      enumerateCallCount += 1;
      return originalEnumerateCombinations(cards, count, limitOverride);
    };

    const candidates = getLegalSelectionsForState(state, 1);

    enumerateCombinations = originalEnumerateCombinations;

    assert(candidates.length > 0, "主牌拖拉机场景应至少生成一手合法候选");
    assert(enumerateCallCount === 0, "主牌拖拉机自动选择命中精确跟型时不应回落到组合枚举");
    assert(
      candidates.every((combo) => matchesLeadPattern(classifyPlay(combo), state.leadSpec)),
      "主牌拖拉机场景的精确短路结果应全部保持为同型拖拉机"
    );
  `;

  vm.runInContext(testSource, context, { filename: "trump-tractor-hint-performance-inline.js" });
}

runTrumpTractorHintPerformanceSuite(loadGameContext());
