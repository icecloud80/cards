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

function runIntermediateFoundationSuite(context) {
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
      state.aiDifficulty = "intermediate";
      state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
      state.trumpSuit = "clubs";
      state.levelRank = "2";
      state.declaration = null;
      state.currentTrick = [];
      state.leadSpec = null;
      state.currentTurnId = 3;
      state.leaderId = 3;
      state.bankerId = 1;
      state.hiddenFriendId = null;
      state.friendTarget = null;
      state.trickNumber = 2;
      state.defenderPoints = 10;
      state.playHistory = [
        makeCard("hist-h-a", "hearts", "A"),
        makeCard("hist-s-k", "spades", "K"),
      ];
      state.lastAiDecision = null;
      state.bottomCards = [makeCard("bottom-h-5", "hearts", "5")];
      state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
      state.exposedSuitVoid = {
        1: { clubs: false, diamonds: false, spades: false, hearts: true },
        2: { clubs: false, diamonds: false, spades: false, hearts: false },
        3: { clubs: false, diamonds: false, spades: false, hearts: false },
        4: { clubs: false, diamonds: false, spades: false, hearts: false },
        5: { clubs: false, diamonds: false, spades: false, hearts: false },
      };
      state.players = [
        basePlayer(1, [makeCard("b-c-9", "clubs", "9")], true),
        basePlayer(2, [makeCard("p2-d-9", "diamonds", "9")]),
        basePlayer(3, [
          makeCard("p3-h-k-1", "hearts", "K"),
          makeCard("p3-h-k-2", "hearts", "K"),
          makeCard("p3-s-8", "spades", "8"),
          makeCard("p3-c-7", "clubs", "7"),
        ]),
        basePlayer(4, [makeCard("p4-d-8", "diamonds", "8")]),
        basePlayer(5, [makeCard("p5-s-9", "spades", "9")]),
      ];
    }

    resetCommonState();
    const simState = cloneSimulationState(state);
    simState.players[2].hand.pop();
    simState.playHistory.push(makeCard("hist-extra", "diamonds", "A"));
    assert(state.players[2].hand.length === 4, "cloneSimulationState: should not mutate live player hand");
    assert(state.playHistory.length === 2, "cloneSimulationState: should not mutate live play history");

    resetCommonState();
    const leadCandidates = generateCandidatePlays(state, 3, "lead");
    assert(leadCandidates.length > 0, "generateCandidatePlays: should produce lead candidates");
    assert(leadCandidates.every((entry) => Array.isArray(entry.cards) && typeof entry.source === "string"), "generateCandidatePlays: every entry should include cards and source");

    resetCommonState();
    state.friendTarget = { suit: "hearts", rank: "A", occurrence: 1, revealed: false, failed: false };
    const objective = getIntermediateObjective(3, "lead", cloneSimulationState(state));
    assert(objective.primary === "find_friend", "getIntermediateObjective: unresolved friend should prioritize find_friend");
    assert(objective.weights.friend > objective.weights.bottom, "getIntermediateObjective: friend weight should dominate bottom weight in unresolved phase");

    resetCommonState();
    const evaluation = evaluateState(cloneSimulationState(state), 3, getIntermediateObjective(3, "lead", cloneSimulationState(state)));
    assert(typeof evaluation.total === "number", "evaluateState: should return numeric total");
    assert(typeof evaluation.breakdown.structure === "number", "evaluateState: should expose structure breakdown");
    assert(evaluation.objective.primary.length > 0, "evaluateState: should include objective");

    resetCommonState();
    const liveHandSizeBeforeRollout = state.players[2].hand.length;
    const rollout = simulateCandidateToEndOfCurrentTrick(cloneSimulationState(state), 3, [state.players[2].hand[0]]);
    assert(rollout.completed, "simulateCandidateToEndOfCurrentTrick: should complete current trick rollout");
    assert(state.players[2].hand.length === liveHandSizeBeforeRollout, "simulateCandidateToEndOfCurrentTrick: should not mutate live player hand");
    assert(state.currentTrick.length === 0, "simulateCandidateToEndOfCurrentTrick: should not mutate live current trick");
    assert(rollout.resultState.trickNumber >= 3 || rollout.resultState.phase === "ending", "simulateCandidateToEndOfCurrentTrick: should advance simulated trick state");

    resetCommonState();
    const leadChoice = chooseIntermediatePlay(3, "lead");
    assert(Array.isArray(leadChoice) && leadChoice.length > 0, "chooseIntermediatePlay: should return a lead selection");
    assert(state.lastAiDecision && state.lastAiDecision.mode === "lead", "chooseIntermediatePlay: should record last AI decision bundle");
    assert(Array.isArray(state.lastAiDecision.candidateEntries) && state.lastAiDecision.candidateEntries.length > 0, "chooseIntermediatePlay: should persist candidate entries for debug");
    assert(state.lastAiDecision.candidateEntries.every((entry) => typeof entry.heuristicScore === "number"), "chooseIntermediatePlay: should persist heuristic candidate scores");
    assert(state.lastAiDecision.candidateEntries.every((entry) => typeof entry.rolloutScore === "number"), "chooseIntermediatePlay: should persist rollout candidate scores");

    globalThis.__intermediateFoundationResults = {
      results: [
        "simulation clone isolation ok",
        "candidate generation scaffold ok",
        "objective weighting scaffold ok",
        "state evaluation scaffold ok",
        "single trick rollout isolation ok",
        "intermediate unified entry scaffold ok",
      ],
    };
  `;

  vm.runInContext(testSource, context, { filename: "ai-intermediate-foundation-inline.js" });
  return context.__intermediateFoundationResults;
}

const context = loadGameContext();
const output = runIntermediateFoundationSuite(context);

console.log("AI intermediate foundation regression passed:");
for (const result of output.results) {
  console.log("- " + result);
}
