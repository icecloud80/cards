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

// 运行 AI 记忆能力测试套件。
function runAiMemorySuite(context) {
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

    function resetCommonState() {
      state.gameOver = false;
      state.phase = "playing";
      state.aiDifficulty = "beginner";
      state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
      state.trumpSuit = "spades";
      state.levelRank = "2";
      state.declaration = null;
      state.currentTrick = [];
      state.leadSpec = null;
      state.currentTurnId = 3;
      state.leaderId = 3;
      state.bankerId = 1;
      state.hiddenFriendId = 3;
      state.friendTarget = {
        suit: "hearts",
        rank: "A",
        occurrence: 1,
        revealed: true,
        revealedBy: 3,
      };
      state.trickNumber = 4;
      state.defenderPoints = 0;
      state.playHistory = [];
      state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
      state.exposedSuitVoid = {
        1: { clubs: false, diamonds: false, spades: false, hearts: false },
        2: { clubs: false, diamonds: false, spades: false, hearts: false },
        3: { clubs: false, diamonds: false, spades: false, hearts: false },
        4: { clubs: false, diamonds: false, spades: false, hearts: false },
        5: { clubs: false, diamonds: false, spades: false, hearts: false },
      };
      state.players = [
        basePlayer(1, [makeCard("b-s-9", "spades", "9")], true),
        basePlayer(2, [makeCard("p2-d-7", "diamonds", "7")]),
        basePlayer(3, [
          makeCard("p3-h-k-1", "hearts", "K"),
          makeCard("p3-h-k-2", "hearts", "K"),
          makeCard("p3-c-9-1", "clubs", "9"),
          makeCard("p3-c-9-2", "clubs", "9"),
        ]),
        basePlayer(4, [makeCard("p4-d-8", "diamonds", "8")]),
        basePlayer(5, [makeCard("p5-d-9", "diamonds", "9")]),
      ];
    }

    function setupRememberedCardsScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.playHistory = [
        makeCard("played-h-a-1", "hearts", "A"),
        makeCard("played-h-a-2", "hearts", "A"),
        makeCard("played-c-a-1", "clubs", "A"),
        makeCard("played-d-a-1", "diamonds", "A"),
        makeCard("played-d-5-1", "diamonds", "5"),
      ];
    }

    function setupAdvancedRouteScenario() {
      resetCommonState();
      state.aiDifficulty = "advanced";
      state.players = [
        basePlayer(1, [makeCard("b-s-9", "spades", "9")], true),
        basePlayer(2, [makeCard("p2-d-8", "diamonds", "8")]),
        basePlayer(3, [
          makeCard("p3-c-a", "clubs", "A"),
          makeCard("p3-h-j", "hearts", "J"),
          makeCard("p3-h-3", "hearts", "3"),
        ]),
        basePlayer(4, [makeCard("p4-d-9", "diamonds", "9")]),
        basePlayer(5, [makeCard("p5-c-8", "clubs", "8")]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 3;
      state.hiddenFriendId = 3;
      state.exposedSuitVoid[1].hearts = true;
    }

    setupRememberedCardsScenario("beginner");
    const beginnerRemembered = getRememberedPlayedCardsForPlayer(3);
    assert(beginnerRemembered.length === 0, "beginner: should not remember played cards beyond exposed void");

    setupRememberedCardsScenario("intermediate");
    const intermediateRemembered = getRememberedPlayedCardsForPlayer(3);
    assert(intermediateRemembered.some((card) => card.suit === "hearts" && card.rank === "A"), "intermediate: should remember high cards related to own heart pair");
    assert(intermediateRemembered.some((card) => card.suit === "clubs" && card.rank === "A"), "intermediate: should remember high cards related to own club pair");
    assert(!intermediateRemembered.some((card) => card.suit === "diamonds" && card.rank === "A"), "intermediate: should ignore unrelated suit high cards");
    assert(!intermediateRemembered.some((card) => card.suit === "diamonds" && card.rank === "5"), "intermediate: should ignore unrelated low cards");

    setupRememberedCardsScenario("advanced");
    const advancedRemembered = getRememberedPlayedCardsForPlayer(3);
    assert(advancedRemembered.length === 5, "advanced: should remember every played card");
    assert(advancedRemembered.some((card) => card.suit === "diamonds" && card.rank === "A"), "advanced: should remember unrelated high cards too");
    assert(advancedRemembered.some((card) => card.suit === "diamonds" && card.rank === "5"), "advanced: should remember unrelated low cards too");

    setupAdvancedRouteScenario();
    const advancedHint = getLegalHintForPlayer(3);
    assert(advancedHint.length === 1, "advanced: should route through legal hint selection");
    assert(advancedHint[0].suit === "hearts" && advancedHint[0].rank === "3", "advanced: should inherit intermediate public-info return behavior");

    globalThis.__aiMemoryResults = {
      results: [
        "beginner memory gate ok",
        "intermediate structure-memory gate ok",
        "advanced full-memory gate ok",
        "advanced decision route ok",
      ],
    };
  `;

  vm.runInContext(testSource, context, { filename: "ai-memory-strategy-inline.js" });
  return context.__aiMemoryResults;
}

const context = loadGameContext();
const output = runAiMemorySuite(context);

console.log("AI memory strategy regression passed:");
for (const result of output.results) {
  console.log("- " + result);
}
