const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 加载运行牌局逻辑所需的测试上下文。
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
  ];
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

// 运行埋底策略测试套件。
function runBuryStrategySuite(context) {
  const testSource = `
    // 断言测试条件是否成立。
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    // 创建测试用牌对象。
    function makeCard(id, suit, rank) {
      return { id, suit, rank };
    }

    // 创建测试用玩家对象。
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

    // 重置扣底状态。
    function resetBuryState(difficulty) {
      state.gameOver = false;
      state.phase = "burying";
      state.aiDifficulty = difficulty;
      state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
      state.trumpSuit = "spades";
      state.levelRank = "2";
      state.declaration = null;
      state.currentTurnId = 1;
      state.leaderId = 1;
      state.bankerId = 1;
      state.hiddenFriendId = null;
      state.currentTrick = [];
      state.leadSpec = null;
      state.trickNumber = 1;
      state.defenderPoints = 0;
      state.bottomCards = [];
    }

    // 搭建避免拆断拖拉机的测试场景。
    function setupAvoidBreakingTractorScenario(difficulty) {
      resetBuryState(difficulty);
      state.players = [
        basePlayer(1, [
          makeCard("c7-1", "clubs", "7"),
          makeCard("c7-2", "clubs", "7"),
          makeCard("c8-1", "clubs", "8"),
          makeCard("c8-2", "clubs", "8"),
          makeCard("d3", "diamonds", "3"),
          makeCard("d4", "diamonds", "4"),
          makeCard("d6", "diamonds", "6"),
          makeCard("h3", "hearts", "3"),
          makeCard("h4", "hearts", "4"),
          makeCard("h6", "hearts", "6"),
          makeCard("h7", "hearts", "7"),
          makeCard("h8", "hearts", "8"),
          makeCard("s9", "spades", "9"),
          makeCard("s10", "spades", "10"),
        ], true),
        basePlayer(2, []),
        basePlayer(3, []),
        basePlayer(4, []),
        basePlayer(5, []),
      ];
    }

    function setupAvoidBuryingAceScenario(difficulty) {
      resetBuryState(difficulty);
      state.players = [
        basePlayer(1, [
          makeCard("ca", "clubs", "A"),
          makeCard("c4", "clubs", "4"),
          makeCard("c6", "clubs", "6"),
          makeCard("d3", "diamonds", "3"),
          makeCard("d4", "diamonds", "4"),
          makeCard("d6", "diamonds", "6"),
          makeCard("h3", "hearts", "3"),
          makeCard("h4", "hearts", "4"),
          makeCard("h6", "hearts", "6"),
          makeCard("h7", "hearts", "7"),
          makeCard("s9", "spades", "9"),
          makeCard("s10", "spades", "10"),
          makeCard("sj", "spades", "J"),
          makeCard("sq", "spades", "Q"),
        ], true),
        basePlayer(2, []),
        basePlayer(3, []),
        basePlayer(4, []),
        basePlayer(5, []),
      ];
    }

    function setupPreferSideSuitDiscardScenario(difficulty) {
      resetBuryState(difficulty);
      state.players = [
        basePlayer(1, [
          makeCard("rj1", "joker", "RJ"),
          makeCard("rj2", "joker", "RJ"),
          makeCard("bj", "joker", "BJ"),
          makeCard("d2-1", "diamonds", "2"),
          makeCard("d2-2", "diamonds", "2"),
          makeCard("s2-1", "spades", "2"),
          makeCard("s2-2", "spades", "2"),
          makeCard("ck", "clubs", "K"),
          makeCard("cj", "clubs", "J"),
          makeCard("c10", "clubs", "10"),
          makeCard("c7-1", "clubs", "7"),
          makeCard("c7-2", "clubs", "7"),
          makeCard("c6", "clubs", "6"),
          makeCard("da", "diamonds", "A"),
          makeCard("dq", "diamonds", "Q"),
          makeCard("d9", "diamonds", "9"),
          makeCard("d8", "diamonds", "8"),
          makeCard("d7", "diamonds", "7"),
          makeCard("d6-1", "diamonds", "6"),
          makeCard("d6-2", "diamonds", "6"),
          makeCard("d6-3", "diamonds", "6"),
          makeCard("d5", "diamonds", "5"),
          makeCard("d3-1", "diamonds", "3"),
          makeCard("d3-2", "diamonds", "3"),
          makeCard("sj", "spades", "J"),
          makeCard("s10-1", "spades", "10"),
          makeCard("s10-2", "spades", "10"),
          makeCard("s9", "spades", "9"),
          makeCard("s7", "spades", "7"),
          makeCard("s5", "spades", "5"),
          makeCard("s3", "spades", "3"),
          makeCard("hk", "hearts", "K"),
          makeCard("h10", "hearts", "10"),
          makeCard("h8-1", "hearts", "8"),
          makeCard("h8-2", "hearts", "8"),
          makeCard("h7", "hearts", "7"),
          makeCard("h6", "hearts", "6"),
          makeCard("h4", "hearts", "4"),
        ], true),
        basePlayer(2, []),
        basePlayer(3, []),
        basePlayer(4, []),
        basePlayer(5, []),
      ];
      state.trumpSuit = "clubs";
      state.declaration = { playerId: 1, suit: "clubs", rank: "2", count: 2, cards: [] };
    }

    function setupPointCapScenario(difficulty) {
      resetBuryState(difficulty);
      state.players = [
        basePlayer(1, [
          makeCard("c3", "clubs", "3"),
          makeCard("c4", "clubs", "4"),
          makeCard("c5", "clubs", "5"),
          makeCard("c10", "clubs", "10"),
          makeCard("ck", "clubs", "K"),
          makeCard("d3", "diamonds", "3"),
          makeCard("d4", "diamonds", "4"),
          makeCard("d5", "diamonds", "5"),
          makeCard("d10", "diamonds", "10"),
          makeCard("dk", "diamonds", "K"),
          makeCard("h3", "hearts", "3"),
          makeCard("h4", "hearts", "4"),
          makeCard("h5", "hearts", "5"),
          makeCard("s2-1", "spades", "2"),
        ], true),
        basePlayer(2, []),
        basePlayer(3, []),
        basePlayer(4, []),
        basePlayer(5, []),
      ];
    }

    /**
     * 作用：
     * 搭建“初级应为最短副牌 A 留下 A + 单牌回手”的埋底测试场景。
     *
     * 为什么这样写：
     * 这次 beginner heuristic 要把“短门找朋友”提前反映到埋底阶段，
     * 因此需要验证初级会优先把目标门做成“A + 单牌回手”，
     * 而不是默认再额外保留同门 “K”。
     *
     * 输入：
     * @param {void} - 场景固定只验证初级埋底。
     *
     * 输出：
     * @returns {void} 直接写入打家手牌。
     *
     * 注意：
     * - 黑桃是最短副牌门，且同时具备 “A / K / 6” 三张；新规则只应强保 “A / 6”。
     * - 其余副牌数量更长，理论上更适合被扣到底里。
     */
    function setupBeginnerShortSuitReserveScenario() {
      resetBuryState("beginner");
      state.players = [
        basePlayer(1, [
          makeCard("sA", "spades", "A"),
          makeCard("sK", "spades", "K"),
          makeCard("s6", "spades", "6"),
          makeCard("dA", "diamonds", "A"),
          makeCard("d9", "diamonds", "9"),
          makeCard("d8", "diamonds", "8"),
          makeCard("hQ", "hearts", "Q"),
          makeCard("h9", "hearts", "9"),
          makeCard("h8", "hearts", "8"),
          makeCard("c7", "clubs", "7"),
          makeCard("c6", "clubs", "6"),
          makeCard("c5", "clubs", "5"),
          makeCard("trump-1", "joker", "BJ"),
          makeCard("trump-2", "spades", "2"),
        ], true),
        basePlayer(2, []),
        basePlayer(3, []),
        basePlayer(4, []),
        basePlayer(5, []),
      ];
      state.trumpSuit = "clubs";
      state.declaration = { playerId: 1, suit: "clubs", rank: "2", count: 2, cards: [] };
    }

    /**
     * 作用：
     * 搭建“第三张 A 找朋友时应保留 AA10、并把额外同门小牌埋掉”的埋底测试场景。
     *
     * 为什么这样写：
     * 这轮修复针对的是固定复盘里“打家持有 AA + 10 + 4，却把 10 埋掉、留下 4”的错误路线。
     * 正确节奏应是保留 AA10，再用 10 去找朋友，让第三张 A 自然上手。
     *
     * 输入：
     * @param {void} - 场景固定只验证初级埋底。
     *
     * 输出：
     * @returns {void} 直接写入打家手牌。
     *
     * 注意：
     * - 方片是唯一可用的副牌 A 门，避免测试被其它短门候选干扰。
     * - 这里既要验证 short-suit plan 的保留牌，也要验证最终埋底结果真的把方片 4 压下去。
     */
    function setupBeginnerThirdAceTakeoverReserveScenario() {
      resetBuryState("beginner");
      state.players = [
        basePlayer(1, [
          makeCard("dA-1", "diamonds", "A"),
          makeCard("dA-2", "diamonds", "A"),
          makeCard("d10", "diamonds", "10"),
          makeCard("d4", "diamonds", "4"),
          makeCard("sK", "spades", "K"),
          makeCard("s9", "spades", "9"),
          makeCard("s8", "spades", "8"),
          makeCard("hQ", "hearts", "Q"),
          makeCard("h9", "hearts", "9"),
          makeCard("h8", "hearts", "8"),
          makeCard("c7", "clubs", "7"),
          makeCard("c6", "clubs", "6"),
          makeCard("trump-bj", "joker", "BJ"),
          makeCard("trump-level", "clubs", "2"),
        ], true),
        basePlayer(2, []),
        basePlayer(3, []),
        basePlayer(4, []),
        basePlayer(5, []),
      ];
      state.trumpSuit = "clubs";
      state.declaration = { playerId: 1, suit: "clubs", rank: "2", count: 2, cards: [] };
    }

    function setupManualPointCapValidationScenario() {
      resetBuryState("beginner");
      state.players = [
        basePlayer(1, [
          makeCard("c5-1", "clubs", "5"),
          makeCard("c10-1", "clubs", "10"),
          makeCard("ck-1", "clubs", "K"),
          makeCard("d5-1", "diamonds", "5"),
          makeCard("d10-1", "diamonds", "10"),
          makeCard("h3-1", "hearts", "3"),
          makeCard("h4-1", "hearts", "4"),
          makeCard("s3-1", "spades", "3"),
          makeCard("s4-1", "spades", "4"),
          makeCard("s6-1", "spades", "6"),
          makeCard("h6-1", "hearts", "6"),
          makeCard("d3-1", "diamonds", "3"),
          makeCard("c3-1", "clubs", "3"),
          makeCard("c4-1", "clubs", "4"),
        ], true),
        basePlayer(2, []),
        basePlayer(3, []),
        basePlayer(4, []),
        basePlayer(5, []),
      ];
      state.bottomCards = [];
    }

    const results = [];

    for (const difficulty of ["beginner", "intermediate"]) {
      setupAvoidBreakingTractorScenario(difficulty);
      const bury = getBuryHintForPlayer(1);
      assert(bury.length === 7, difficulty + ": bury hint should return 7 cards");
      const buryIds = new Set(bury.map((card) => card.id));
      assert(!buryIds.has("c7-1"), difficulty + ": should not bury tractor card c7-1");
      assert(!buryIds.has("c7-2"), difficulty + ": should not bury tractor card c7-2");
      assert(!buryIds.has("c8-1"), difficulty + ": should not bury tractor card c8-1");
      assert(!buryIds.has("c8-2"), difficulty + ": should not bury tractor card c8-2");
      results.push(difficulty + " bury-protect tractor ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupAvoidBuryingAceScenario(difficulty);
      const bury = getBuryHintForPlayer(1);
      assert(bury.length === 7, difficulty + ": ace-protection bury hint should return 7 cards");
      const buryIds = new Set(bury.map((card) => card.id));
      assert(!buryIds.has("ca"), difficulty + ": should not bury side-suit A when enough low cards exist");
      results.push(difficulty + " bury-protect ace ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupPreferSideSuitDiscardScenario(difficulty);
      const bury = getBuryHintForPlayer(1);
      assert(bury.length === 7, difficulty + ": side-suit discard hint should return 7 cards");
      assert(bury.every((card) => !isTrump(card)), difficulty + ": should avoid burying trump when side suits are enough");
      results.push(difficulty + " bury-prefer side suits ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupPointCapScenario(difficulty);
      const bury = getBuryHintForPlayer(1);
      assert(bury.length === 7, difficulty + ": point-cap bury hint should return 7 cards");
      assert(getCardsPointTotal(bury) <= MAX_BURY_POINT_TOTAL, difficulty + ": bury hint should respect the 25-point cap");
      results.push(difficulty + " bury-point-cap ok");
    }

    setupBeginnerShortSuitReserveScenario();
    const beginnerShortSuitPlan = getBeginnerShortSuitFriendPlan(getPlayer(1), { countKnownBuriedCopies: false });
    assert(beginnerShortSuitPlan?.suit === "spades", "beginner: short-suit plan should still target spades");
    assert(beginnerShortSuitPlan?.reservedCardIds?.has("sA"), "beginner: short-suit plan should reserve side-suit A");
    assert(beginnerShortSuitPlan?.reservedCardIds?.has("s6"), "beginner: short-suit plan should reserve the single low return card");
    assert(!beginnerShortSuitPlan?.reservedCardIds?.has("sK"), "beginner: short-suit plan should not reserve extra K by default");
    const beginnerShortSuitReserve = getBuryHintForPlayer(1);
    const beginnerShortSuitReserveIds = new Set(beginnerShortSuitReserve.map((card) => card.id));
    assert(!beginnerShortSuitReserveIds.has("sA"), "beginner: should keep side-suit A for short-suit friend plan");
    assert(!beginnerShortSuitReserveIds.has("s6"), "beginner: should keep one side-suit return card for the short-suit line");
    results.push("beginner short-suit reserve bury ok");

    setupBeginnerThirdAceTakeoverReserveScenario();
    const beginnerThirdAceTakeoverPlan = getBeginnerShortSuitFriendPlan(getPlayer(1), { countKnownBuriedCopies: false });
    assert(beginnerThirdAceTakeoverPlan?.suit === "diamonds", "beginner: third-A takeover plan should target diamonds");
    assert(beginnerThirdAceTakeoverPlan?.reservedCardIds?.has("dA-1"), "beginner: third-A takeover plan should reserve the first diamonds A");
    assert(beginnerThirdAceTakeoverPlan?.reservedCardIds?.has("dA-2"), "beginner: third-A takeover plan should reserve the second diamonds A");
    assert(beginnerThirdAceTakeoverPlan?.reservedCardIds?.has("d10"), "beginner: third-A takeover plan should reserve diamonds 10 as the takeover search card");
    assert(!beginnerThirdAceTakeoverPlan?.reservedCardIds?.has("d4"), "beginner: third-A takeover plan should no longer reserve the lower diamonds 4");
    const beginnerThirdAceTakeoverBury = getBuryHintForPlayer(1);
    const beginnerThirdAceTakeoverIds = new Set(beginnerThirdAceTakeoverBury.map((card) => card.id));
    assert(!beginnerThirdAceTakeoverIds.has("dA-1"), "beginner: third-A takeover bury should keep the first diamonds A");
    assert(!beginnerThirdAceTakeoverIds.has("dA-2"), "beginner: third-A takeover bury should keep the second diamonds A");
    assert(!beginnerThirdAceTakeoverIds.has("d10"), "beginner: third-A takeover bury should keep diamonds 10");
    assert(beginnerThirdAceTakeoverIds.has("d4"), "beginner: third-A takeover bury should bury diamonds 4 to leave AA10");
    results.push("beginner third-A takeover reserve bury ok");

    setupManualPointCapValidationScenario();
    const invalidBuryIds = ["c5-1", "c10-1", "ck-1", "d5-1", "d10-1", "h3-1", "h4-1"];
    const invalidBuryCards = invalidBuryIds.map((id) => state.players[0].hand.find((card) => card.id === id));
    assert(getCardsPointTotal(invalidBuryCards) > MAX_BURY_POINT_TOTAL, "manual scenario should exceed the point cap");
    const invalidValidation = validateBurySelection(invalidBuryCards);
    assert(!invalidValidation.ok, "bury validation should reject selections over 25 points");
    completeBurying(1, invalidBuryIds);
    assert(state.phase === "burying", "invalid bury selection should not finish burying");
    assert(state.bottomCards.length === 0, "invalid bury selection should not write bottom cards");

    const validBuryIds = ["s3-1", "s4-1", "s6-1", "h6-1", "d3-1", "c3-1", "c4-1"];
    completeBurying(1, validBuryIds);
    assert(state.phase !== "burying", "valid bury selection should finish burying");
    assert(getCardsPointTotal(state.bottomCards) <= MAX_BURY_POINT_TOTAL, "completed bottom cards should respect the point cap");
    results.push("manual bury point-cap validation ok");

    globalThis.__buryStrategyResults = { results };
  `;

  vm.runInContext(testSource, context, { filename: "bury-strategy-inline.js" });
  return context.__buryStrategyResults;
}

const context = loadGameContext();
const output = runBuryStrategySuite(context);

console.log("AI bury strategy regression passed:");
for (const result of output.results) {
  console.log("- " + result);
}
