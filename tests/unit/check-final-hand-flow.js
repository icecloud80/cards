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
      makeCard("p2-c3", "clubs", "3"),
      makeCard("p2-d5", "diamonds", "5"),
      makeCard("p2-s7", "spades", "7"),
    ];
    state.players[2].hand = [
      makeCard("p3-c4", "clubs", "4"),
      makeCard("p3-d6", "diamonds", "6"),
      makeCard("p3-s8", "spades", "8"),
    ];
    state.players[3].hand = [
      makeCard("p4-c5", "clubs", "5"),
      makeCard("p4-d7", "diamonds", "7"),
      makeCard("p4-s9", "spades", "9"),
    ];
    state.players[4].hand = [
      makeCard("p5-c6", "clubs", "6"),
      makeCard("p5-d8", "diamonds", "8"),
      makeCard("p5-s10", "spades", "10"),
    ];
    state.players[0].hand = [
      makeCard("p1-c2", "clubs", "2"),
      makeCard("p1-d4", "diamonds", "4"),
      makeCard("p1-s6", "spades", "6"),
    ];

    const leadCards = [...state.players[1].hand];
    const leadValidation = validateSelection(2, leadCards);
    assert(leadValidation.ok, "final-hand lead should be legal when leading the whole remaining hand");

    const leadPlayed = playCards(2, leadCards.map((card) => card.id), { skipStartTurn: true });
    assert(leadPlayed, "playCards should accept the final-hand lead");
    assert(state.leadSpec && state.leadSpec.type === "lastHand", "lead should be recognized as lastHand");

    const partialFollowValidation = validateSelection(3, [state.players[2].hand[0]]);
    assert(!partialFollowValidation.ok, "followers should still have to play their whole remaining hand on lastHand");

    assert(playCards(3, state.players[2].hand.map((card) => card.id), { skipStartTurn: true }), "player 3 should be able to follow");
    assert(playCards(4, state.players[3].hand.map((card) => card.id), { skipStartTurn: true }), "player 4 should be able to follow");
    assert(playCards(5, state.players[4].hand.map((card) => card.id), { skipStartTurn: true }), "player 5 should be able to follow");
    assert(playCards(1, state.players[0].hand.map((card) => card.id), { skipStartTurn: true, skipResolveDelay: true }), "player 1 should finish the trick");

    assert(state.gameOver === true, "the game should finish immediately after the lastHand trick resolves");
    assert(state.lastTrick && state.lastTrick.winnerId === 5, "the strongest full-hand selection should win the final trick");

    globalThis.__finalHandFlowResults = {
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
console.log(`- lead type: ${output.leadType}`);
console.log(`- winner: 玩家${output.winnerId}`);
console.log(`- game over: ${output.gameOver}`);
