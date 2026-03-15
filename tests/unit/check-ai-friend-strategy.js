const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
    path.join(__dirname, "../../src/shared/ai.js"),
  ];
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

function runFriendStrategySuite(context) {
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
      state.trumpSuit = "clubs";
      state.levelRank = "2";
      state.declaration = null;
      state.currentTrick = [];
      state.leadSpec = null;
      state.currentTurnId = 1;
      state.leaderId = 1;
      state.bankerId = 1;
      state.hiddenFriendId = null;
      state.trickNumber = 2;
      state.defenderPoints = 0;
      state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
      state.exposedSuitVoid = {
        1: { clubs: false, diamonds: false, spades: false, hearts: false },
        2: { clubs: false, diamonds: false, spades: false, hearts: false },
        3: { clubs: false, diamonds: false, spades: false, hearts: false },
        4: { clubs: false, diamonds: false, spades: false, hearts: false },
        5: { clubs: false, diamonds: false, spades: false, hearts: false },
      };
    }

    function setupCalledDeadFriendScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.players = [
        basePlayer(1, [makeCard("b-c-5", "clubs", "5"), makeCard("b-s-k", "spades", "K")], true),
        basePlayer(2, [makeCard("p2-d-9", "diamonds", "9")]),
        basePlayer(3, [
          makeCard("p3-h-a-1", "hearts", "A"),
          makeCard("p3-h-a-2", "hearts", "A"),
          makeCard("p3-s-8", "spades", "8"),
        ]),
        basePlayer(4, [makeCard("p4-c-9", "clubs", "9")]),
        basePlayer(5, [makeCard("p5-d-k", "diamonds", "K")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 2 });
      state.friendTarget.matchesSeen = 1;
      state.currentTurnId = 3;
      state.leaderId = 3;
    }

    function setupThirdAceCalledDeadScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.players = [
        basePlayer(1, [makeCard("b-d-7", "diamonds", "7")], true),
        basePlayer(2, [makeCard("p2-s-9", "spades", "9")]),
        basePlayer(3, [
          makeCard("p3-h-a-3", "hearts", "A"),
          makeCard("p3-h-6", "hearts", "6"),
        ]),
        basePlayer(4, [makeCard("p4-d-9", "diamonds", "9")]),
        basePlayer(5, [makeCard("p5-s-k", "spades", "K")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 3 });
      state.friendTarget.matchesSeen = 2;
      state.currentTurnId = 3;
      state.leaderId = 3;
    }

    function setupDelayRevealOpeningLeadScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "clubs";
      state.trickNumber = 1;
      state.players = [
        basePlayer(1, [makeCard("b-h-a", "hearts", "A")], true),
        basePlayer(2, [makeCard("p2-d-9", "diamonds", "9")]),
        basePlayer(3, [
          makeCard("p3-h-a", "hearts", "A"),
          makeCard("p3-h-3", "hearts", "3"),
        ]),
        basePlayer(4, [makeCard("p4-h-8", "hearts", "8")]),
        basePlayer(5, [makeCard("p5-h-7", "hearts", "7")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 1 });
      state.currentTrick = [{
        playerId: 1,
        cards: [makeCard("lead-h-k", "hearts", "K")],
      }];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 1;
      state.currentTurnId = 3;
    }

    function setupReturnToBankerScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
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
      state.currentTurnId = 3;
      state.leaderId = 3;
      state.exposedSuitVoid[1].hearts = true;
    }

    function setupReturnToBankerHiddenVoidScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
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
      state.currentTurnId = 3;
      state.leaderId = 3;
    }

    function setupAutoFriendScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.phase = "callingFriend";
      state.players = [
        basePlayer(1, [
          makeCard("b-h-6", "hearts", "6"),
          makeCard("b-h-9", "hearts", "9"),
          makeCard("b-s-4", "spades", "4"),
          makeCard("b-c-7", "clubs", "7"),
        ], true),
        basePlayer(2, [makeCard("p2-c-j", "clubs", "J"), makeCard("p2-c-8", "clubs", "8")]),
        basePlayer(3, [makeCard("p3-h-a", "hearts", "A"), makeCard("p3-h-10", "hearts", "10")]),
        basePlayer(4, [makeCard("p4-s-k", "spades", "K"), makeCard("p4-s-7", "spades", "7")]),
        basePlayer(5, [makeCard("p5-d-q", "diamonds", "Q"), makeCard("p5-d-6", "diamonds", "6")]),
      ];
    }

    const results = [];

    for (const difficulty of ["beginner", "intermediate"]) {
      setupCalledDeadFriendScenario(difficulty);
      assert(isAiCertainFriend(3) === true, difficulty + ": player 3 should be identified as certain friend");
      assert(canAiRevealFriendNow(3) === true, difficulty + ": player 3 should be able to reveal now");
      const hint = getLegalHintForPlayer(3);
      assert(hint.length === 1, difficulty + ": reveal hint should be a single card");
      assert(hint[0].suit === "hearts" && hint[0].rank === "A", difficulty + ": certain friend should lead hearts A to reveal");
      results.push(difficulty + " certain-friend reveal ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupThirdAceCalledDeadScenario(difficulty);
      assert(isAiCertainFriend(3) === true, difficulty + ": third-A holder should be identified as certain friend");
      assert(canAiRevealFriendNow(3) === true, difficulty + ": third-A holder should be able to reveal now");
      const hint = getLegalHintForPlayer(3);
      assert(hint.length === 1, difficulty + ": third-A reveal should be a single card");
      assert(hint[0].suit === "hearts" && hint[0].rank === "A", difficulty + ": third-A holder should lead hearts A to reveal");
      results.push(difficulty + " third-A called-dead reveal ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupDelayRevealOpeningLeadScenario(difficulty);
      assert(isAiCertainFriend(3) === false, difficulty + ": opening-lead probe case should not mark player 3 as certain friend");
      const hint = getLegalHintForPlayer(3);
      assert(hint.length === 1, difficulty + ": delayed reveal should still choose a single follow card");
      assert(hint[0].suit === "hearts" && hint[0].rank === "3", difficulty + ": opening-lead probe should delay reveal and play low heart");
      results.push(difficulty + " opening-probe delay reveal ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupAutoFriendScenario(difficulty);
      const chosen = chooseFriendTarget().target;
      assert(["A", "K"].includes(chosen.rank), difficulty + ": auto friend target should stay in A/K, got " + chosen.rank);
      results.push(difficulty + " auto-friend rank ok -> " + chosen.rank);
    }

    setupReturnToBankerScenario("beginner");
    const beginnerReturnLead = getLegalHintForPlayer(3);
    assert(beginnerReturnLead.length === 1, "beginner: return scenario should choose a single lead");
    assert(!(beginnerReturnLead[0].suit === "hearts" && beginnerReturnLead[0].rank === "3"), "beginner: should not already prefer explicit return-to-banker lead");
    results.push("beginner return-to-banker baseline -> " + beginnerReturnLead[0].suit + "-" + beginnerReturnLead[0].rank);

    setupReturnToBankerScenario("intermediate");
    const intermediateReturnLead = getLegalHintForPlayer(3);
    assert(intermediateReturnLead.length === 1, "intermediate: return scenario should choose a single lead");
    assert(intermediateReturnLead[0].suit === "hearts" && intermediateReturnLead[0].rank === "3", "intermediate: should prefer low heart to return control to banker");
    results.push("intermediate return-to-banker lead ok");

    setupReturnToBankerHiddenVoidScenario("beginner");
    const beginnerHiddenVoidLead = getLegalHintForPlayer(3);
    assert(beginnerHiddenVoidLead.length === 1, "beginner: hidden-void return scenario should choose a single lead");
    assert(!(beginnerHiddenVoidLead[0].suit === "hearts" && beginnerHiddenVoidLead[0].rank === "3"), "beginner: should not infer hidden banker void for return lead");
    results.push("beginner hidden-void return baseline -> " + beginnerHiddenVoidLead[0].suit + "-" + beginnerHiddenVoidLead[0].rank);

    setupReturnToBankerHiddenVoidScenario("intermediate");
    const intermediateHiddenVoidLead = getLegalHintForPlayer(3);
    assert(intermediateHiddenVoidLead.length === 1, "intermediate: hidden-void return scenario should choose a single lead");
    assert(intermediateHiddenVoidLead[0].suit === "hearts" && intermediateHiddenVoidLead[0].rank === "3", "intermediate: should infer banker void after burying and return with low heart");
    results.push("intermediate hidden-void return ok");

    globalThis.__friendStrategyResults = { results };
  `;

  vm.runInContext(testSource, context, { filename: "ai-friend-strategy-inline.js" });
  return context.__friendStrategyResults;
}

const context = loadGameContext();
const output = runFriendStrategySuite(context);

console.log("AI friend strategy regression passed:");
for (const result of output.results) {
  console.log("- " + result);
}
