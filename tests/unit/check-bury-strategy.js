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
