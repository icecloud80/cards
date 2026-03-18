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

function runIntermediateSearchSuite(context) {
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

    function resetExtendedSearchState() {
      state.gameOver = false;
      state.phase = "playing";
      state.aiDifficulty = "intermediate";
      state.showDebugPanel = false;
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
      state.friendTarget = { suit: "hearts", rank: "A", occurrence: 1, revealed: false, failed: false, matchesSeen: 0 };
      state.trickNumber = 3;
      state.defenderPoints = 20;
      state.playHistory = [];
      state.lastAiDecision = null;
      state.aiDecisionHistory = [];
      state.aiDecisionHistorySeq = 0;
      state.bottomCards = [makeCard("bottom-h-5", "hearts", "5"), makeCard("bottom-s-10", "spades", "10")];
      state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
      state.exposedSuitVoid = {
        1: { clubs: false, diamonds: false, spades: false, hearts: false },
        2: { clubs: false, diamonds: false, spades: false, hearts: true },
        3: { clubs: false, diamonds: false, spades: false, hearts: false },
        4: { clubs: false, diamonds: false, spades: false, hearts: false },
        5: { clubs: false, diamonds: false, spades: false, hearts: false },
      };
      state.players = [
        basePlayer(1, [
          makeCard("p1-c-a", "clubs", "A"),
          makeCard("p1-s-9", "spades", "9"),
          makeCard("p1-d-7", "diamonds", "7"),
        ], true),
        basePlayer(2, [
          makeCard("p2-h-9", "hearts", "9"),
          makeCard("p2-s-8", "spades", "8"),
          makeCard("p2-d-8", "diamonds", "8"),
        ]),
        basePlayer(3, [
          makeCard("p3-h-k-1", "hearts", "K"),
          makeCard("p3-h-k-2", "hearts", "K"),
          makeCard("p3-c-7", "clubs", "7"),
          makeCard("p3-s-6", "spades", "6"),
        ]),
        basePlayer(4, [
          makeCard("p4-d-9", "diamonds", "9"),
          makeCard("p4-h-8", "hearts", "8"),
          makeCard("p4-s-7", "spades", "7"),
        ]),
        basePlayer(5, [
          makeCard("p5-s-k", "spades", "K"),
          makeCard("p5-h-7", "hearts", "7"),
          makeCard("p5-d-6", "diamonds", "6"),
        ]),
      ];
    }

    function resetTurnAccessRiskState() {
      state.gameOver = false;
      state.phase = "playing";
      state.aiDifficulty = "intermediate";
      state.showDebugPanel = false;
      state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
      state.trumpSuit = "clubs";
      state.levelRank = "2";
      state.declaration = null;
      state.currentTurnId = 3;
      state.leaderId = 1;
      state.bankerId = 1;
      state.hiddenFriendId = null;
      state.friendTarget = null;
      state.trickNumber = 10;
      state.defenderPoints = 70;
      state.playHistory = [];
      state.lastAiDecision = null;
      state.aiDecisionHistory = [];
      state.aiDecisionHistorySeq = 0;
      state.bottomCards = [makeCard("risk-bottom-h-5", "hearts", "5"), makeCard("risk-bottom-s-10", "spades", "10")];
      state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
      state.exposedSuitVoid = {
        1: { clubs: false, diamonds: false, spades: false, hearts: false },
        2: { clubs: false, diamonds: false, spades: false, hearts: false },
        3: { clubs: false, diamonds: false, spades: false, hearts: false },
        4: { clubs: false, diamonds: false, spades: false, hearts: false },
        5: { clubs: false, diamonds: false, spades: false, hearts: false },
      };
      state.players = [
        basePlayer(1, [makeCard("risk-p1-d-a", "diamonds", "A")], true),
        basePlayer(2, [makeCard("risk-p2-s-7", "spades", "7")]),
        basePlayer(3, [
          makeCard("risk-p3-c-7", "clubs", "7"),
          makeCard("risk-p3-d-5", "diamonds", "5"),
          makeCard("risk-p3-s-6", "spades", "6"),
          makeCard("risk-p3-d-4", "diamonds", "4"),
        ]),
        basePlayer(4, [
          makeCard("risk-p4-s-8", "spades", "8"),
          makeCard("risk-p4-s-9", "spades", "9"),
        ]),
        basePlayer(5, [
          makeCard("risk-p5-h-6", "hearts", "6"),
          makeCard("risk-p5-h-7", "hearts", "7"),
        ]),
      ];
      state.currentTrick = [
        { playerId: 1, cards: [makeCard("risk-lead-h-9", "hearts", "9")] },
        { playerId: 2, cards: [makeCard("risk-follow-h-8", "hearts", "8")] },
      ];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
    }

    function resetPositiveSafeLeadState() {
      state.gameOver = false;
      state.phase = "playing";
      state.aiDifficulty = "intermediate";
      state.showDebugPanel = false;
      state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
      state.trumpSuit = "clubs";
      state.levelRank = "2";
      state.declaration = null;
      state.currentTrick = [];
      state.leadSpec = null;
      state.currentTurnId = 3;
      state.leaderId = 3;
      state.bankerId = 1;
      state.hiddenFriendId = 5;
      state.friendTarget = { suit: "spades", rank: "A", occurrence: 1, revealed: true, failed: false, matchesSeen: 1 };
      state.trickNumber = 10;
      state.defenderPoints = 70;
      state.playHistory = [];
      state.lastAiDecision = null;
      state.aiDecisionHistory = [];
      state.aiDecisionHistorySeq = 0;
      state.bottomCards = [makeCard("safe-bottom-h-5", "hearts", "5"), makeCard("safe-bottom-s-10", "spades", "10")];
      state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
      state.exposedSuitVoid = {
        1: { clubs: false, diamonds: false, spades: false, hearts: false },
        2: { clubs: false, diamonds: false, spades: false, hearts: false },
        3: { clubs: false, diamonds: false, spades: false, hearts: false },
        4: { clubs: false, diamonds: false, spades: false, hearts: false },
        5: { clubs: false, diamonds: false, spades: false, hearts: false },
      };
      state.players = [
        basePlayer(1, [makeCard("safe-p1-d-a", "diamonds", "A")], true),
        basePlayer(2, [makeCard("safe-p2-s-7", "spades", "7")]),
        basePlayer(3, [
          makeCard("safe-p3-h-a-1", "hearts", "A"),
          makeCard("safe-p3-h-a-2", "hearts", "A"),
          makeCard("safe-p3-c-a", "clubs", "A"),
          makeCard("safe-p3-s-6", "spades", "6"),
        ]),
        basePlayer(4, [makeCard("safe-p4-s-8", "spades", "8")]),
        basePlayer(5, [makeCard("safe-p5-h-6", "hearts", "6")]),
      ];
    }

    resetExtendedSearchState();
    const trickRollout = simulateCandidateToEndOfCurrentTrick(cloneSimulationState(state), 3, [state.players[2].hand[2]]);
    assert(trickRollout.completed, "simulateCandidateToEndOfCurrentTrick: should finish the current trick before extended search");
    const liveHandSize = state.players[2].hand.length;
    const ownTurnRollout = simulateUntilNextOwnTurn(trickRollout.resultState, 3);
    assert(ownTurnRollout.reachedOwnTurn, "simulateUntilNextOwnTurn: should reach the AI player's next action");
    assert(ownTurnRollout.trace.length > 0, "simulateUntilNextOwnTurn: should simulate intermediate players before own turn");
    assert(ownTurnRollout.resultState.currentTurnId === 3, "simulateUntilNextOwnTurn: should stop exactly on the AI turn");
    assert(state.players[2].hand.length === liveHandSize, "simulateUntilNextOwnTurn: should not mutate live hand state");
    assert(state.currentTrick.length === 0, "simulateUntilNextOwnTurn: should not mutate live trick state");

    resetExtendedSearchState();
    const leadChoice = chooseIntermediatePlay(3, "lead");
    assert(Array.isArray(leadChoice) && leadChoice.length > 0, "chooseIntermediatePlay: should still select a lead under extended search");
    assert(state.lastAiDecision === null, "chooseIntermediatePlay: should not persist debug decision data when debug panel is closed");

    resetExtendedSearchState();
    state.showDebugPanel = true;
    const debugLeadChoice = chooseIntermediatePlay(3, "lead");
    assert(Array.isArray(debugLeadChoice) && debugLeadChoice.length > 0, "chooseIntermediatePlay: should still select a lead under extended search with debug enabled");
    assert(state.lastAiDecision, "chooseIntermediatePlay: should record debug decision data");
    assert(state.lastAiDecision.candidateEntries.some((entry) => entry.rolloutDepth >= 2), "chooseIntermediatePlay: qualifying search scenarios should record depth-2 rollout entries");
    assert(state.lastAiDecision.candidateEntries.some((entry) => entry.rolloutReachedOwnTurn), "chooseIntermediatePlay: extended rollout should reach own next turn for at least one candidate");
    assert(state.lastAiDecision.candidateEntries.some((entry) => entry.rolloutTriggerFlags.includes("unresolved_friend")), "chooseIntermediatePlay: extended rollout should record why depth escalation happened");
    assert(state.lastAiDecision.candidateEntries.some((entry) => entry.rolloutFutureEvaluation && typeof entry.rolloutFutureEvaluation.total === "number"), "chooseIntermediatePlay: depth-2 rollout should expose future evaluation summary");
    assert(state.lastAiDecision.debugStats.extendedRolloutCount > 0, "chooseIntermediatePlay: debug stats should count extended rollouts");

    resetTurnAccessRiskState();
    const accessBaseline = evaluateState(
      cloneSimulationState(state),
      3,
      getIntermediateObjective(3, "follow", cloneSimulationState(state))
    );
    assert(accessBaseline.breakdown.turnAccess < 0, "evaluateState: before抢回当前墩时，牌权续控分应体现当前处于失控");
    assert(accessBaseline.breakdown.controlRisk < 0, "evaluateState: before抢回当前墩时，失先手代价应为负值");
    assert(accessBaseline.breakdown.pointRunRisk < 0, "evaluateState: before抢回当前墩时，对手连续跑分风险应为负值");
    const turnAccessRollout = getIntermediateRolloutSummary(
      3,
      [state.players[2].hand.find((card) => card.id === "risk-p3-c-7")],
      accessBaseline,
      "follow"
    );
    assert(turnAccessRollout.depth === 2, "getIntermediateRolloutSummary: late-round regain-control scenarios should extend into next-lead access check");
    assert(turnAccessRollout.triggerFlags.includes("endgame_safe_lead_check"), "getIntermediateRolloutSummary: extended rollout should record endgame safe lead checks");
    assert(turnAccessRollout.triggerFlags.includes("no_safe_next_lead"), "getIntermediateRolloutSummary: should flag when regained lead has no safe next opening");
    assert(turnAccessRollout.triggerFlags.includes("turn_access_risk"), "getIntermediateRolloutSummary: should mark when next lead likely hands control back to opponents");
    assert(turnAccessRollout.triggerFlags.includes("point_run_risk"), "getIntermediateRolloutSummary: should flag when the next cycle exposes continuous point-run risk");
    assert(turnAccessRollout.futureTrace.length > 0, "getIntermediateRolloutSummary: turn-access extension should preserve next-lead simulation trace");
    assert(turnAccessRollout.nextEvaluation.breakdown.turnAccess > accessBaseline.breakdown.turnAccess, "evaluateState: 抢回当前墩后，牌权续控分应高于原始失控局面");
    assert(turnAccessRollout.nextEvaluation.breakdown.safeLead < 0, "evaluateState: 抢回当前墩但下一拍没有安全起手时，残局安全起手值应为负值");
    assert(turnAccessRollout.futureEvaluation.breakdown.pointRunRisk < 0, "evaluateState: 下一拍进入对手连续跑分态势时，pointRunRisk 应为负值");

    resetPositiveSafeLeadState();
    const safeLeadEvaluation = evaluateState(
      cloneSimulationState(state),
      3,
      getIntermediateObjective(3, "lead", cloneSimulationState(state))
    );
    assert(safeLeadEvaluation.breakdown.safeLead > 0, "evaluateState: 残局轮到自己首发且存在安全结构时，应给出正的残局安全起手值");

    resetPositiveSafeLeadState();
    state.bankerId = 3;
    state.currentTurnId = 3;
    state.leaderId = 3;
    const riskyStructureLead = [
      makeCard("structure-risk-h-9-a", "hearts", "9"),
      makeCard("structure-risk-h-9-b", "hearts", "9"),
      makeCard("structure-risk-h-9-c", "hearts", "9"),
    ];
    const saferLead = [makeCard("structure-safe-c-3", "clubs", "3")];
    const originalLeadScorer = scoreIntermediateLeadCandidate;
    const originalRolloutSummary = getIntermediateRolloutSummary;
    scoreIntermediateLeadCandidate = function mockedLeadScorer(playerId, combo) {
      return getComboKey(combo) === getComboKey(riskyStructureLead) ? 46 : 34;
    };
    getIntermediateRolloutSummary = function mockedRolloutSummary(playerId, combo) {
      if (getComboKey(combo) === getComboKey(riskyStructureLead)) {
        return {
          score: 12,
          delta: 0,
          futureDelta: -18,
          completed: true,
          nextMode: "lead",
          winnerId: 3,
          points: 0,
          trace: [],
          depth: 2,
          reachedOwnTurn: true,
          futureTrace: [],
          triggerFlags: ["turn_access_risk", "point_run_risk"],
          nextEvaluation: {
            total: 12,
            breakdown: { turnAccess: 4, controlRisk: -8, safeLead: -4, pointRunRisk: -30 },
            objective: { primary: "clear_trump", secondary: "keep_control" },
          },
          futureEvaluation: {
            total: -18,
            breakdown: { turnAccess: -10, controlExit: -18, controlRisk: -12, safeLead: -12, pointRunRisk: -32 },
            objective: { primary: "clear_trump", secondary: "keep_control" },
          },
        };
      }
      return {
        score: 10,
        delta: 0,
        futureDelta: 6,
        completed: true,
        nextMode: "lead",
        winnerId: 3,
        points: 0,
        trace: [],
        depth: 2,
        reachedOwnTurn: true,
        futureTrace: [],
        triggerFlags: [],
        nextEvaluation: {
          total: 18,
          breakdown: { turnAccess: 10, controlRisk: -2, safeLead: 8, pointRunRisk: 0 },
          objective: { primary: "clear_trump", secondary: "keep_control" },
        },
        futureEvaluation: {
          total: 16,
          breakdown: { turnAccess: 9, controlExit: 10, controlRisk: -1, safeLead: 6, pointRunRisk: 0 },
          objective: { primary: "clear_trump", secondary: "keep_control" },
        },
      };
    };
    const structureEntries = buildScoredIntermediateLeadEntries(
      3,
      [
        { cards: riskyStructureLead, source: "structure", tags: ["triple", "hearts"] },
        { cards: saferLead, source: "heuristic", tags: ["single", "clubs"] },
      ],
      [],
      {
        total: 0,
        breakdown: {},
        objective: { primary: "clear_trump", secondary: "keep_control", weights: {} },
      }
    );
    scoreIntermediateLeadCandidate = originalLeadScorer;
    getIntermediateRolloutSummary = originalRolloutSummary;
    const riskyStructureEntry = structureEntries.find((entry) => getComboKey(entry.cards) === getComboKey(riskyStructureLead));
    const safeLeadEntry = structureEntries.find((entry) => getComboKey(entry.cards) === getComboKey(saferLead));
    assert(riskyStructureEntry.structureControlPenalty > 0, "buildScoredIntermediateLeadEntries: risky structure leads should receive an explicit structureControlPenalty");
    assert(riskyStructureEntry.score < safeLeadEntry.score, "buildScoredIntermediateLeadEntries: structure leads that imply immediate control loss should rank below safer leads");

    resetPositiveSafeLeadState();
    state.bankerId = 3;
    state.currentTurnId = 3;
    state.leaderId = 3;
    const riskyPointLead = [makeCard("point-risk-h-k", "hearts", "K")];
    const saferLowLead = [makeCard("point-safe-c-3", "clubs", "3")];
    const originalPointLeadScorer = scoreIntermediateLeadCandidate;
    const originalPointRolloutSummary = getIntermediateRolloutSummary;
    scoreIntermediateLeadCandidate = function mockedPointLeadScorer(playerId, combo, beginnerChoice, candidateEntry) {
      if (getComboKey(combo) === getComboKey(riskyPointLead)) {
        candidateEntry.dangerousPointLeadPenalty = 30;
        return 52;
      }
      candidateEntry.dangerousPointLeadPenalty = 0;
      return 30;
    };
    getIntermediateRolloutSummary = function mockedPointRolloutSummary(playerId, combo) {
      if (getComboKey(combo) === getComboKey(riskyPointLead)) {
        return {
          score: 14,
          delta: 0,
          futureDelta: 2,
          completed: true,
          nextMode: "lead",
          winnerId: 3,
          points: 0,
          trace: [],
          depth: 2,
          reachedOwnTurn: true,
          futureTrace: [],
          triggerFlags: ["turn_access_risk", "point_run_risk"],
          nextEvaluation: {
            total: 8,
            breakdown: { turnAccess: 2, controlRisk: -8, safeLead: -2, pointRunRisk: -18 },
            objective: { primary: "clear_trump", secondary: "keep_control" },
          },
          futureEvaluation: {
            total: -10,
            breakdown: { turnAccess: -6, controlExit: -20, controlRisk: -12, safeLead: -10, pointRunRisk: -28 },
            objective: { primary: "clear_trump", secondary: "keep_control" },
          },
        };
      }
      return {
        score: 10,
        delta: 0,
        futureDelta: 14,
        completed: true,
        nextMode: "lead",
        winnerId: 3,
        points: 0,
        trace: [],
        depth: 2,
        reachedOwnTurn: true,
        futureTrace: [],
        triggerFlags: ["turn_access_hold"],
        nextEvaluation: {
          total: 16,
          breakdown: { turnAccess: 8, controlRisk: -1, safeLead: 6, pointRunRisk: 0 },
          objective: { primary: "clear_trump", secondary: "keep_control" },
        },
        futureEvaluation: {
          total: 22,
          breakdown: { turnAccess: 10, controlExit: 12, controlRisk: 0, safeLead: 8, pointRunRisk: 0 },
          objective: { primary: "clear_trump", secondary: "keep_control" },
        },
      };
    };
    const pointLeadEntries = buildScoredIntermediateLeadEntries(
      3,
      [
        { cards: riskyPointLead, source: "heuristic", tags: ["single", "hearts"] },
        { cards: saferLowLead, source: "heuristic", tags: ["single", "clubs"] },
      ],
      [],
      {
        total: 0,
        breakdown: {},
        objective: { primary: "clear_trump", secondary: "keep_control", weights: {} },
      }
    );
    scoreIntermediateLeadCandidate = originalPointLeadScorer;
    getIntermediateRolloutSummary = originalPointRolloutSummary;
    const riskyPointEntry = pointLeadEntries.find((entry) => getComboKey(entry.cards) === getComboKey(riskyPointLead));
    const saferPointEntry = pointLeadEntries.find((entry) => getComboKey(entry.cards) === getComboKey(saferLowLead));
    assert(riskyPointEntry.riskyPointLeadVetoPenalty > 0, "buildScoredIntermediateLeadEntries: dangerous point-carrying leads should receive an explicit riskyPointLeadVetoPenalty");
    assert(riskyPointEntry.score < saferPointEntry.score, "buildScoredIntermediateLeadEntries: control-focused risky point leads should rank below safer low leads when rollout exposes control loss");
    assert(riskyPointEntry.riskyPointLeadVetoPenalty > 80, "buildScoredIntermediateLeadEntries: negative controlExit should further harden the risky point lead veto");

    resetExtendedSearchState();
    state.currentTurnId = 3;
    state.leaderId = 3;
    state.currentTrick = [];
    state.players[2].hand = sortHand([
      makeCard("probe-risk-s-a", "spades", "A"),
      makeCard("probe-risk-c-7", "clubs", "7"),
      makeCard("probe-risk-d-6", "diamonds", "6"),
      makeCard("probe-risk-h-4", "hearts", "4"),
    ]);
    const unresolvedRiskyLead = [state.players[2].hand.find((card) => card.id === "probe-risk-s-a")];
    const unresolvedSafeLead = [state.players[2].hand.find((card) => card.id === "probe-risk-d-6")];
    const originalUnresolvedLeadScorer = scoreIntermediateLeadCandidate;
    const originalUnresolvedRolloutSummary = getIntermediateRolloutSummary;
    scoreIntermediateLeadCandidate = function mockedUnresolvedLeadScorer(playerId, combo) {
      return getComboKey(combo) === getComboKey(unresolvedRiskyLead) ? 58 : 28;
    };
    getIntermediateRolloutSummary = function mockedUnresolvedRolloutSummary(playerId, combo) {
      if (getComboKey(combo) === getComboKey(unresolvedRiskyLead)) {
        return {
          score: 10,
          delta: 0,
          futureDelta: 2,
          completed: true,
          nextMode: "lead",
          winnerId: 3,
          points: 0,
          trace: [],
          depth: 2,
          reachedOwnTurn: true,
          futureTrace: [],
          triggerFlags: ["turn_access_risk", "point_run_risk"],
          nextEvaluation: {
            total: 6,
            breakdown: { friendBelief: 8, probeRisk: -6, turnAccess: 2, safeLead: 0, pointRunRisk: -12 },
            objective: { primary: "find_friend", secondary: "keep_control" },
          },
          futureEvaluation: {
            total: -8,
            breakdown: { friendBelief: 6, probeRisk: -20, turnAccess: -8, safeLead: -6, pointRunRisk: -24 },
            objective: { primary: "find_friend", secondary: "keep_control" },
          },
        };
      }
      return {
        score: 12,
        delta: 0,
        futureDelta: 10,
        completed: true,
        nextMode: "lead",
        winnerId: 3,
        points: 0,
        trace: [],
        depth: 2,
        reachedOwnTurn: true,
        futureTrace: [],
        triggerFlags: [],
        nextEvaluation: {
          total: 10,
          breakdown: { friendBelief: 10, probeRisk: 8, turnAccess: 4, safeLead: 0, pointRunRisk: 0 },
          objective: { primary: "find_friend", secondary: "keep_control" },
        },
        futureEvaluation: {
          total: 18,
          breakdown: { friendBelief: 12, probeRisk: 14, turnAccess: 8, safeLead: 2, pointRunRisk: 0 },
          objective: { primary: "find_friend", secondary: "keep_control" },
        },
      };
    };
    const unresolvedProbeEntries = buildScoredIntermediateLeadEntries(
      3,
      [
        { cards: unresolvedRiskyLead, source: "heuristic", tags: ["single", "spades"] },
        { cards: unresolvedSafeLead, source: "heuristic", tags: ["single", "diamonds"] },
      ],
      [],
      {
        total: 0,
        breakdown: {},
        objective: { primary: "find_friend", secondary: "keep_control", weights: {} },
      }
    );
    scoreIntermediateLeadCandidate = originalUnresolvedLeadScorer;
    getIntermediateRolloutSummary = originalUnresolvedRolloutSummary;
    const unresolvedRiskyEntry = unresolvedProbeEntries.find((entry) => getComboKey(entry.cards) === getComboKey(unresolvedRiskyLead));
    const unresolvedSafeEntry = unresolvedProbeEntries.find((entry) => getComboKey(entry.cards) === getComboKey(unresolvedSafeLead));
    assert(unresolvedRiskyEntry.unresolvedProbeVetoPenalty > 0, "buildScoredIntermediateLeadEntries: unresolved high-cost probes without return path should receive an explicit unresolvedProbeVetoPenalty");
    assert(unresolvedRiskyEntry.score < unresolvedSafeEntry.score, "buildScoredIntermediateLeadEntries: unresolved risky probes should rank below safer probing lines");

    resetExtendedSearchState();
    state.currentTurnId = 3;
    state.leaderId = 3;
    state.currentTrick = [];
    state.players[2].hand = sortHand([
      makeCard("probe-history-s-a", "spades", "A"),
      makeCard("probe-history-c-7", "clubs", "7"),
      makeCard("probe-history-d-6", "diamonds", "6"),
      makeCard("probe-history-h-4", "hearts", "4"),
    ]);
    const repeatedProbeLead = [state.players[2].hand.find((card) => card.id === "probe-history-s-a")];
    const repeatedProbeEntry = {
      cards: repeatedProbeLead,
      rolloutFutureDelta: 2,
      rolloutTriggerFlags: ["turn_access_risk", "point_run_risk"],
      rolloutEvaluation: {
        breakdown: { friendBelief: 8, probeRisk: -6, turnAccess: 2, safeLead: 0, pointRunRisk: -12 },
      },
      rolloutFutureEvaluation: {
        breakdown: { friendBelief: 6, probeRisk: -20, turnAccess: -8, safeLead: -6, pointRunRisk: -24 },
      },
    };
    const freshProbePenalty = scoreIntermediateUnresolvedProbeVetoPenalty(
      3,
      repeatedProbeEntry,
      "lead",
      { primary: "find_friend", secondary: "keep_control", weights: {} }
    );
    state.players[2].played = [
      makeCard("probe-history-bj", "joker", "BJ"),
      makeCard("probe-history-h-k", "hearts", "K"),
    ];
    const repeatedProbePenalty = scoreIntermediateUnresolvedProbeVetoPenalty(
      3,
      repeatedProbeEntry,
      "lead",
      { primary: "find_friend", secondary: "keep_control", weights: {} }
    );
    assert(
      repeatedProbePenalty > freshProbePenalty,
      "scoreIntermediateUnresolvedProbeVetoPenalty: repeated unresolved high-cost probing should harden the veto beyond a fresh single probe"
    );

    resetExtendedSearchState();
    state.currentTurnId = 3;
    state.leaderId = 3;
    state.currentTrick = [];
    state.friendTarget = { suit: "hearts", rank: "A", occurrence: 1, revealed: false, failed: false, matchesSeen: 0 };
    state.players[2].hand = sortHand([
      makeCard("probe-reveal-h-a", "hearts", "A"),
      makeCard("probe-reveal-c-7", "clubs", "7"),
      makeCard("probe-reveal-d-6", "diamonds", "6"),
      makeCard("probe-reveal-s-4", "spades", "4"),
    ]);
    const revealProbeLead = [state.players[2].hand.find((card) => card.id === "probe-reveal-h-a")];
    const revealFallbackLead = [state.players[2].hand.find((card) => card.id === "probe-reveal-d-6")];
    const originalRevealLeadScorer = scoreIntermediateLeadCandidate;
    const originalRevealRolloutSummary = getIntermediateRolloutSummary;
    scoreIntermediateLeadCandidate = function mockedRevealLeadScorer(playerId, combo) {
      return getComboKey(combo) === getComboKey(revealProbeLead) ? 42 : 22;
    };
    getIntermediateRolloutSummary = function mockedRevealRolloutSummary() {
      return {
        score: 8,
        delta: 0,
        futureDelta: 4,
        completed: true,
        nextMode: "lead",
        winnerId: 3,
        points: 0,
        trace: [],
        depth: 2,
        reachedOwnTurn: true,
        futureTrace: [],
        triggerFlags: [],
        nextEvaluation: {
          total: 10,
          breakdown: { friendBelief: 20, probeRisk: 10, turnAccess: 4, safeLead: 0, pointRunRisk: 0 },
          objective: { primary: "find_friend", secondary: "keep_control" },
        },
        futureEvaluation: {
          total: 14,
          breakdown: { friendBelief: 22, probeRisk: 12, turnAccess: 6, safeLead: 2, pointRunRisk: 0 },
          objective: { primary: "find_friend", secondary: "keep_control" },
        },
      };
    };
    const revealProbeEntries = buildScoredIntermediateLeadEntries(
      3,
      [
        { cards: revealProbeLead, source: "heuristic", tags: ["single", "hearts"] },
        { cards: revealFallbackLead, source: "heuristic", tags: ["single", "diamonds"] },
      ],
      [],
      {
        total: 0,
        breakdown: {},
        objective: { primary: "find_friend", secondary: "keep_control", weights: {} },
      }
    );
    scoreIntermediateLeadCandidate = originalRevealLeadScorer;
    getIntermediateRolloutSummary = originalRevealRolloutSummary;
    const revealEntry = revealProbeEntries.find((entry) => getComboKey(entry.cards) === getComboKey(revealProbeLead));
    const revealFallbackEntry = revealProbeEntries.find((entry) => getComboKey(entry.cards) === getComboKey(revealFallbackLead));
    assert(revealEntry.unresolvedProbeVetoPenalty === 0, "buildScoredIntermediateLeadEntries: direct reveal lines should not be penalized as unresolved probes");
    assert(revealEntry.score > revealFallbackEntry.score, "buildScoredIntermediateLeadEntries: direct reveal lines should remain eligible to beat low-risk filler leads");

    resetExtendedSearchState();
    state.currentTurnId = 3;
    state.leaderId = 3;
    state.currentTrick = [];
    state.players[2].hand = sortHand([
      makeCard("probe-safe-s-a", "spades", "A"),
      makeCard("probe-safe-s-4", "spades", "4"),
      makeCard("probe-safe-c-7", "clubs", "7"),
      makeCard("probe-safe-d-6", "diamonds", "6"),
    ]);
    const safeSignalLead = [state.players[2].hand.find((card) => card.id === "probe-safe-s-a")];
    const safeSignalFallback = [state.players[2].hand.find((card) => card.id === "probe-safe-d-6")];
    const originalSafeSignalLeadScorer = scoreIntermediateLeadCandidate;
    const originalSafeSignalRolloutSummary = getIntermediateRolloutSummary;
    scoreIntermediateLeadCandidate = function mockedSafeSignalLeadScorer(playerId, combo) {
      return getComboKey(combo) === getComboKey(safeSignalLead) ? 44 : 24;
    };
    getIntermediateRolloutSummary = function mockedSafeSignalRolloutSummary(playerId, combo) {
      if (getComboKey(combo) === getComboKey(safeSignalLead)) {
        return {
          score: 12,
          delta: 0,
          futureDelta: 14,
          completed: true,
          nextMode: "lead",
          winnerId: 3,
          points: 0,
          trace: [],
          depth: 2,
          reachedOwnTurn: true,
          futureTrace: [],
          triggerFlags: ["turn_access_hold"],
          nextEvaluation: {
            total: 14,
            breakdown: { friendBelief: 14, probeRisk: 14, turnAccess: 6, safeLead: 0, pointRunRisk: 0 },
            objective: { primary: "find_friend", secondary: "keep_control" },
          },
          futureEvaluation: {
            total: 24,
            breakdown: { friendBelief: 20, probeRisk: 18, turnAccess: 10, safeLead: 6, pointRunRisk: 0 },
            objective: { primary: "find_friend", secondary: "keep_control" },
          },
        };
      }
      return {
        score: 8,
        delta: 0,
        futureDelta: 2,
        completed: true,
        nextMode: "lead",
        winnerId: 3,
        points: 0,
        trace: [],
        depth: 2,
        reachedOwnTurn: true,
        futureTrace: [],
        triggerFlags: [],
        nextEvaluation: {
          total: 8,
          breakdown: { friendBelief: 8, probeRisk: 6, turnAccess: 2, safeLead: 0, pointRunRisk: 0 },
          objective: { primary: "find_friend", secondary: "keep_control" },
        },
        futureEvaluation: {
          total: 10,
          breakdown: { friendBelief: 8, probeRisk: 8, turnAccess: 3, safeLead: 0, pointRunRisk: 0 },
          objective: { primary: "find_friend", secondary: "keep_control" },
        },
      };
    };
    const safeSignalEntries = buildScoredIntermediateLeadEntries(
      3,
      [
        { cards: safeSignalLead, source: "heuristic", tags: ["single", "spades"] },
        { cards: safeSignalFallback, source: "heuristic", tags: ["single", "diamonds"] },
      ],
      [],
      {
        total: 0,
        breakdown: {},
        objective: { primary: "find_friend", secondary: "keep_control", weights: {} },
      }
    );
    scoreIntermediateLeadCandidate = originalSafeSignalLeadScorer;
    getIntermediateRolloutSummary = originalSafeSignalRolloutSummary;
    const safeSignalEntry = safeSignalEntries.find((entry) => getComboKey(entry.cards) === getComboKey(safeSignalLead));
    assert(safeSignalEntry.unresolvedProbeVetoPenalty === 0, "buildScoredIntermediateLeadEntries: high-card probes with explicit turn_access_hold should keep the exception lane");

    resetExtendedSearchState();
    state.currentTurnId = 3;
    state.leaderId = 3;
    state.currentTrick = [];
    state.players[2].hand = sortHand([
      makeCard("probe-grade-joker", "joker", "BJ"),
      makeCard("probe-grade-c-a", "clubs", "A"),
      makeCard("probe-grade-c-k", "clubs", "K"),
      makeCard("probe-grade-c-q", "clubs", "Q"),
    ]);
    const gradeBottomLead = [state.players[2].hand.find((card) => card.id === "probe-grade-joker")];
    const originalObjectiveGetter = getIntermediateObjective;
    getIntermediateObjective = function mockedGradeBottomObjective() {
      return { primary: "grade_bottom", secondary: "keep_control", weights: {} };
    };
    const gradeBottomProbeExposure = getIntermediateUnresolvedProbeExposure(3, gradeBottomLead, state.players[2].hand);
    getIntermediateObjective = originalObjectiveGetter;
    assert(gradeBottomProbeExposure === 0, "getIntermediateUnresolvedProbeExposure: explicit grade_bottom priority should bypass unresolved probe suppression");

    resetExtendedSearchState();
    const stableProbeState = cloneSimulationState(state);
    stableProbeState.currentTurnId = 3;
    stableProbeState.leaderId = 3;
    stableProbeState.currentTrick = [];
    stableProbeState.players[2].hand = sortHand([
      makeCard("probe-eval-s-a", "spades", "A"),
      makeCard("probe-eval-c-a", "clubs", "A"),
      makeCard("probe-eval-c-k", "clubs", "K"),
      makeCard("probe-eval-d-6", "diamonds", "6"),
    ]);
    const riskyProbeState = cloneSimulationState(state);
    riskyProbeState.currentTurnId = 1;
    riskyProbeState.leaderId = 1;
    riskyProbeState.currentTrick = [
      { playerId: 1, cards: [makeCard("probe-eval-table-h-k", "hearts", "K")] },
    ];
    riskyProbeState.players[2].hand = sortHand([
      makeCard("probe-eval-s-4", "spades", "4"),
      makeCard("probe-eval-d-6b", "diamonds", "6"),
    ]);
    const stableProbeEvaluation = evaluateState(
      stableProbeState,
      3,
      getIntermediateObjective(3, "lead", stableProbeState)
    );
    const riskyProbeEvaluation = evaluateState(
      riskyProbeState,
      3,
      getIntermediateObjective(3, "follow", riskyProbeState)
    );
    assert(riskyProbeEvaluation.breakdown.probeRisk < 0, "evaluateState: unresolved over-heated probing states should expose negative probeRisk");
    assert(
      stableProbeEvaluation.breakdown.probeRisk > riskyProbeEvaluation.breakdown.probeRisk,
      "evaluateState: probeRisk should prefer retained probe resources plus healthier continuation over exhausted unresolved states"
    );

    resetPositiveSafeLeadState();
    state.bankerId = 3;
    state.currentTurnId = 5;
    state.leaderId = 5;
    const allyControlState = cloneSimulationState(state);
    const allyControlEvaluation = evaluateState(
      allyControlState,
      3,
      getIntermediateObjective(3, "follow", allyControlState)
    );
    const lostControlState = cloneSimulationState(state);
    lostControlState.currentTurnId = 1;
    lostControlState.leaderId = 1;
    lostControlState.currentTrick = [];
    const lostControlEvaluation = evaluateState(
      lostControlState,
      3,
      getIntermediateObjective(3, "follow", lostControlState)
    );
    assert(allyControlEvaluation.breakdown.controlExit > 0, "evaluateState: resolved-friend allied control should yield positive controlExit");
    assert(lostControlEvaluation.breakdown.controlExit < 0, "evaluateState: resolved-friend lost control should yield negative controlExit");
    assert(
      allyControlEvaluation.breakdown.controlExit > lostControlEvaluation.breakdown.controlExit,
      "evaluateState: controlExit should clearly prefer allied continuation over opponent control"
    );

    resetPositiveSafeLeadState();
    const heavySelfControlState = cloneSimulationState(state);
    heavySelfControlState.currentTurnId = 4;
    heavySelfControlState.leaderId = 4;
    heavySelfControlState.players[2].hand = sortHand([
      makeCard("control-heavy-bj", "joker", "BJ"),
      makeCard("control-heavy-rj", "joker", "RJ"),
      makeCard("control-heavy-c-a", "clubs", "A"),
      makeCard("control-heavy-s-6", "spades", "6"),
    ]);
    const lightSelfControlState = cloneSimulationState(heavySelfControlState);
    lightSelfControlState.players[2].hand = sortHand([
      makeCard("control-light-c-9", "clubs", "9"),
      makeCard("control-light-d-6", "diamonds", "6"),
      makeCard("control-light-s-6", "spades", "6"),
      makeCard("control-light-h-4", "hearts", "4"),
    ]);
    const heavySelfControlEvaluation = evaluateState(
      heavySelfControlState,
      3,
      getIntermediateObjective(3, "lead", heavySelfControlState)
    );
    const lightSelfControlEvaluation = evaluateState(
      lightSelfControlState,
      3,
      getIntermediateObjective(3, "lead", lightSelfControlState)
    );
    assert(
      lightSelfControlEvaluation.breakdown.bottomRelease > heavySelfControlEvaluation.breakdown.bottomRelease,
      "evaluateState: late-round same-side control should treat already-released high trump resources as a stronger bottomRelease state"
    );
    assert(
      lightSelfControlEvaluation.breakdown.controlExit > heavySelfControlEvaluation.breakdown.controlExit,
      "evaluateState: resolved-friend allied control should cool down once the hand stops hoarding jokers and high trumps"
    );

    globalThis.__intermediateSearchResults = {
      results: [
        "next-own-turn simulation isolation ok",
        "intermediate rollout depth escalation ok",
        "intermediate debug stats scaffold ok",
        "turn access risk extension ok",
        "evaluateState turn access breakdown ok",
        "structure lead control penalty ok",
        "risky point lead veto penalty ok",
        "unresolved probe veto ok",
        "direct reveal probe exception ok",
        "safe high-card probe exception ok",
        "grade-bottom probe exception ok",
        "repeated probe history veto ok",
        "probeRisk breakdown ok",
        "control exit breakdown ok",
        "bottom release breakdown ok",
      ],
    };
  `;

  vm.runInContext(testSource, context, { filename: "ai-intermediate-search-inline.js" });
  return context.__intermediateSearchResults;
}

const context = loadGameContext();
const output = runIntermediateSearchSuite(context);

console.log("AI intermediate search regression passed:");
for (const result of output.results) {
  console.log("- " + result);
}
