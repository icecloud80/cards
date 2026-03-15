const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 加载运行牌局逻辑所需的测试上下文。
function loadGameContext() {
  const elementMap = new Map();
  function getElement(id) {
    if (!elementMap.has(id)) {
      elementMap.set(id, {
        id,
        textContent: "",
        innerHTML: "",
        classList: {
          add() {},
          remove() {},
          toggle() {},
        },
      });
    }
    return elementMap.get(id);
  }

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
    getElementById(id) {
      return getElement(id);
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
    path.join(__dirname, "../../src/shared/ai-objectives.js"),
    path.join(__dirname, "../../src/shared/ai-evaluate.js"),
    path.join(__dirname, "../../src/shared/ai-candidates.js"),
    path.join(__dirname, "../../src/shared/ai-simulate.js"),
    path.join(__dirname, "../../src/shared/ai-intermediate.js"),
    path.join(__dirname, "../../src/shared/ai.js"),
  ];
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

// 运行末手首出回归测试。
function runSuite(context) {
  const testSource = `
    function assert(condition, message) {
      if (!condition) {
        throw new Error(message);
      }
    }

    function makeCard(id, suit, rank) {
      return { id, suit, rank };
    }

    state.gameOver = false;
    state.phase = "playing";
    state.bankerId = 1;
    state.currentTurnId = 2;
    state.leaderId = 2;
    state.trickNumber = 11;
    state.currentTrick = [];
    state.currentTrickBeatCount = 0;
    state.leadSpec = null;
    state.bottomCards = [];
    state.logs = [];
    state.allLogs = [];
    state.centerAnnouncementQueue = [];
    queueCenterAnnouncement = function queueCenterAnnouncement() {};
    clearCenterAnnouncement = function clearCenterAnnouncement() {};
    startResultCountdown = function startResultCountdown() {};
    state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
    state.players = [1, 2, 3, 4, 5].map((id) => ({
      id,
      name: "玩家" + id,
      isHuman: id === 1,
      hand: [],
      played: [],
      capturedPoints: 0,
      roundPoints: 0,
      level: "2",
    }));

    state.players[1].hand = [
      makeCard("mixed-c3", "clubs", "3"),
      makeCard("mixed-d5", "diamonds", "5"),
      makeCard("mixed-s7", "spades", "7"),
    ];
    assert(!validateSelection(2, [...state.players[1].hand]).ok, "mixed-suit final hand should still be illegal");

    state.players[1].hand = [
      makeCard("p2-hA-a", "hearts", "A"),
      makeCard("p2-hA-b", "hearts", "A"),
      makeCard("p2-hK", "hearts", "K"),
    ];
    state.players[2].hand = [
      makeCard("p3-hQ-a", "hearts", "Q"),
      makeCard("p3-hQ-b", "hearts", "Q"),
      makeCard("p3-hJ", "hearts", "J"),
    ];
    state.players[3].hand = [
      makeCard("p4-h10-a", "hearts", "10"),
      makeCard("p4-h10-b", "hearts", "10"),
      makeCard("p4-h9", "hearts", "9"),
    ];
    state.players[4].hand = [
      makeCard("p5-h8-a", "hearts", "8"),
      makeCard("p5-h8-b", "hearts", "8"),
      makeCard("p5-h7", "hearts", "7"),
    ];
    state.players[0].hand = [
      makeCard("p1-h6-a", "hearts", "6"),
      makeCard("p1-h6-b", "hearts", "6"),
      makeCard("p1-h5", "hearts", "5"),
    ];

    state.aiDifficulty = "beginner";
    const beginnerHint = getLegalHintForPlayer(2);
    assert(beginnerHint.length === 3, "beginner AI should select the whole remaining hand on the final lead");

    state.aiDifficulty = "intermediate";
    const intermediateHint = getLegalHintForPlayer(2);
    assert(intermediateHint.length === 3, "intermediate AI should select the whole remaining hand on the final lead");

    const leadCards = [...state.players[1].hand];
    const leadValidation = validateSelection(2, leadCards);
    assert(leadValidation.ok, "final-hand lead should be legal when leading the whole remaining hand");

    const leadPlayed = playCards(2, leadCards.map((card) => card.id), { skipStartTurn: true });
    assert(leadPlayed, "playCards should accept the final-hand lead");
    assert(state.leadSpec && state.leadSpec.type === "throw", "lead should stay on the normal throw rules");

    const partialFollowValidation = validateSelection(3, [state.players[2].hand[0]]);
    assert(!partialFollowValidation.ok, "followers should still respect the normal same-count follow rules");

    assert(playCards(3, state.players[2].hand.map((card) => card.id), { skipStartTurn: true }), "player 3 should be able to follow");
    assert(playCards(4, state.players[3].hand.map((card) => card.id), { skipStartTurn: true }), "player 4 should be able to follow");
    assert(playCards(5, state.players[4].hand.map((card) => card.id), { skipStartTurn: true }), "player 5 should be able to follow");
    assert(playCards(1, state.players[0].hand.map((card) => card.id), { skipStartTurn: true, skipResolveDelay: true }), "player 1 should finish the trick");

    assert(state.gameOver === true, "the game should finish immediately after the final trick resolves");
    assert(state.lastTrick && state.lastTrick.winnerId === 2, "the strongest full-hand selection should win the final trick");

    globalThis.__finalHandFlowResults = {
      beginnerHintCount: beginnerHint.length,
      intermediateHintCount: intermediateHint.length,
      leadType: state.leadSpec?.type || null,
      winnerId: state.lastTrick?.winnerId || null,
      gameOver: state.gameOver,
    };
  `;

  vm.runInContext(testSource, context, { filename: "final-hand-flow-inline.js" });
  return context.__finalHandFlowResults;
}

const context = loadGameContext();
const output = runSuite(context);

console.log("Final-hand flow regression passed:");
console.log(`- beginner hint count: ${output.beginnerHintCount}`);
console.log(`- intermediate hint count: ${output.intermediateHintCount}`);
console.log(`- lead type: ${output.leadType}`);
console.log(`- winner: 玩家${output.winnerId}`);
console.log(`- game over: ${output.gameOver}`);
