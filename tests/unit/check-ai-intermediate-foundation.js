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
      state.friendTarget = null;
      state.trickNumber = 2;
      state.defenderPoints = 10;
      state.playHistory = [
        makeCard("hist-h-a", "hearts", "A"),
        makeCard("hist-s-k", "spades", "K"),
      ];
      state.lastAiDecision = null;
      state.aiDecisionHistory = [];
      state.aiDecisionHistorySeq = 0;
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
    const simulatedLeadCandidates = generateCandidatePlays(cloneSimulationState(state), 3, "lead");
    assert(simulatedLeadCandidates.length > 0, "generateCandidatePlays: should also produce lead candidates from simulation state");
    assert(simulatedLeadCandidates.every((entry) => Array.isArray(entry.cards) && typeof entry.source === "string"), "generateCandidatePlays: simulation-state entries should preserve candidate metadata");

    // 验证候选层的跟牌标签优先使用 sourceState，而不是偷读当前 live state。
    resetCommonState();
    state.trumpSuit = "clubs";
    state.currentTurnId = 3;
    state.leaderId = 1;
    state.players = [
      basePlayer(1, [makeCard("follow-p1-h-9", "hearts", "9")], true),
      basePlayer(2, [makeCard("follow-p2-s-9", "spades", "9")]),
      basePlayer(3, [
        makeCard("follow-p3-c-7", "clubs", "7"),
        makeCard("follow-p3-d-6", "diamonds", "6"),
        makeCard("follow-p3-s-8", "spades", "8"),
      ]),
      basePlayer(4, [makeCard("follow-p4-d-8", "diamonds", "8")]),
      basePlayer(5, [makeCard("follow-p5-s-k", "spades", "K")]),
    ];
    state.currentTrick = [
      { playerId: 1, cards: [makeCard("follow-lead-h-9", "hearts", "9")] },
    ];
    state.leadSpec = classifyPlay(state.currentTrick[0].cards);
    const followSourceState = cloneSimulationState(state);
    const sourceTrumpSingle = [followSourceState.players[2].hand.find((card) => card.id === "follow-p3-c-7")];
    state.currentTrick = [
      { playerId: 1, cards: [makeCard("live-lead-s-7", "spades", "7")] },
    ];
    state.leadSpec = classifyPlay(state.currentTrick[0].cards);
    assert(doesSelectionBeatCurrentForState(followSourceState, 3, sourceTrumpSingle), "doesSelectionBeatCurrentForState: should evaluate beatability from sourceState instead of live state");
    const sourceForcedFallback = buildForcedFollowFallbackForState(followSourceState, 3);
    assert(getComboKey(sourceForcedFallback) === getComboKey([followSourceState.players[2].hand.find((card) => card.id === "follow-p3-d-6")]), "buildForcedFollowFallbackForState: should construct fallback from sourceState hand order");
    const sourceLegalSelections = getLegalSelectionsForState(followSourceState, 3);
    assert(sourceLegalSelections.some((combo) => getComboKey(combo) === getComboKey(sourceTrumpSingle)), "getLegalSelectionsForState: should enumerate legal follows from sourceState instead of live state");
    const searchedFromSource = findLegalSelectionBySearchForState(followSourceState, 3);
    assert(sourceLegalSelections.some((combo) => getComboKey(combo) === getComboKey(searchedFromSource)), "findLegalSelectionBySearchForState: should return one of the legal sourceState candidates");
    const beginnerHintFromSource = getBeginnerLegalHintForState(followSourceState, 3);
    assert(getComboKey(beginnerHintFromSource) === getComboKey(sourceTrumpSingle), "getBeginnerLegalHintForState: should follow sourceState instead of live state drift");
    const intermediateHintFromSource = getIntermediateLegalHintForState(followSourceState, 3);
    assert(getComboKey(intermediateHintFromSource) === getComboKey(sourceTrumpSingle), "getIntermediateLegalHintForState: should follow sourceState instead of live state drift");
    const followCandidates = generateCandidatePlays(followSourceState, 3, "follow");
    assert(followCandidates.some((entry) => getComboKey(entry.cards) === getComboKey(sourceTrumpSingle) && entry.tags.includes("beats")), "generateCandidatePlays follow: should tag beating candidates from sourceState context");

    resetCommonState();
    state.currentTurnId = 3;
    state.leaderId = 1;
    state.players = [
      basePlayer(1, [makeCard("pair-lead-p1-h-9", "hearts", "9")], true),
      basePlayer(2, [makeCard("pair-lead-p2-s-9", "spades", "9")]),
      basePlayer(3, [
        makeCard("pair-lead-p3-h-6", "hearts", "6"),
        makeCard("pair-lead-p3-c-7", "clubs", "7"),
        makeCard("pair-lead-p3-d-8", "diamonds", "8"),
      ]),
      basePlayer(4, [makeCard("pair-lead-p4-d-8", "diamonds", "8")]),
      basePlayer(5, [makeCard("pair-lead-p5-s-k", "spades", "K")]),
    ];
    state.currentTrick = [
      { playerId: 1, cards: [makeCard("pair-lead-h-9-1", "hearts", "9"), makeCard("pair-lead-h-9-2", "hearts", "9")] },
    ];
    state.leadSpec = classifyPlay(state.currentTrick[0].cards);
    const unshapedSourceState = cloneSimulationState(state);
    const unshapedCandidates = generateCandidatePlays(unshapedSourceState, 3, "follow");
    const legalUnshaped = unshapedCandidates.find((entry) => entry.tags.includes("unshaped"));
    assert(legalUnshaped, "generateCandidatePlays follow: should keep legal but unshaped follow candidates");
    assert(!legalUnshaped.tags.includes("invalid"), "generateCandidatePlays follow: legal unshaped candidates should not be tagged invalid");
    assert(legalUnshaped.tags.includes("off_pattern"), "generateCandidatePlays follow: legal unshaped candidates should be marked off_pattern");

    resetCommonState();
    state.currentTurnId = 3;
    state.leaderId = 3;
    state.players = [
      basePlayer(1, [
        makeCard("throw-guard-p1-h-j-1", "hearts", "J"),
        makeCard("throw-guard-p1-h-j-2", "hearts", "J"),
      ], true),
      basePlayer(2, [makeCard("throw-guard-p2-s-9", "spades", "9")]),
      basePlayer(3, [
        makeCard("throw-guard-p3-h-a-1", "hearts", "A"),
        makeCard("throw-guard-p3-h-a-2", "hearts", "A"),
        makeCard("throw-guard-p3-h-k-1", "hearts", "K"),
        makeCard("throw-guard-p3-h-k-2", "hearts", "K"),
        makeCard("throw-guard-p3-h-3", "hearts", "3"),
      ]),
      basePlayer(4, [makeCard("throw-guard-p4-d-8", "diamonds", "8")]),
      basePlayer(5, [makeCard("throw-guard-p5-s-k", "spades", "K")]),
    ];
    state.playHistory = [];
    state.currentTrick = [];
    state.leadSpec = null;
    const throwGuardState = cloneSimulationState(state);
    const riskyThrowEntry = createCandidateEntry([...throwGuardState.players[2].hand], "manual", ["throw", "hearts"]);
    const filteredThrowResult = filterCandidateEntriesForState(throwGuardState, 3, "lead", [riskyThrowEntry]);
    assert(filteredThrowResult.entries.length === 1, "filterCandidateEntriesForState: should keep risky throw candidates instead of filtering by hidden hands");
    assert(filteredThrowResult.filteredEntries.length === 0, "filterCandidateEntriesForState: should not produce failed_throw from hidden-hand truth");
    assert(filteredThrowResult.entries[0].tags.includes("throw_risky"), "filterCandidateEntriesForState: should tag unresolved throw candidates as throw_risky");
    const throwRiskAssessment = assessThrowCandidateForState(throwGuardState, 3, [...throwGuardState.players[2].hand]);
    assert(throwRiskAssessment && throwRiskAssessment.level === "risky", "assessThrowCandidateForState: unresolved higher singles should mark throw as risky");

    resetCommonState();
    state.currentTurnId = 3;
    state.leaderId = 3;
    state.players = [
      basePlayer(1, [makeCard("throw-safe-p1-s-9", "spades", "9")], true),
      basePlayer(2, [makeCard("throw-safe-p2-d-9", "diamonds", "9")]),
      basePlayer(3, [
        makeCard("throw-safe-p3-h-a-1", "hearts", "A"),
        makeCard("throw-safe-p3-h-a-2", "hearts", "A"),
        makeCard("throw-safe-p3-h-k-1", "hearts", "K"),
        makeCard("throw-safe-p3-h-k-2", "hearts", "K"),
        makeCard("throw-safe-p3-h-9-1", "hearts", "9"),
        makeCard("throw-safe-p3-h-9-2", "hearts", "9"),
      ]),
      basePlayer(4, [makeCard("throw-safe-p4-d-8", "diamonds", "8")]),
      basePlayer(5, [makeCard("throw-safe-p5-s-k", "spades", "K")]),
    ];
    state.playHistory = [
      makeCard("seen-h-10-1", "hearts", "10"),
      makeCard("seen-h-10-2", "hearts", "10"),
      makeCard("seen-h-j-1", "hearts", "J"),
      makeCard("seen-h-j-2", "hearts", "J"),
      makeCard("seen-h-q-1", "hearts", "Q"),
      makeCard("seen-h-q-2", "hearts", "Q"),
    ];
    state.currentTrick = [];
    state.leadSpec = null;
    const throwSafeState = cloneSimulationState(state);
    const safeThrowCombo = [...throwSafeState.players[2].hand];
    const throwSafeAssessment = assessThrowCandidateForState(throwSafeState, 3, safeThrowCombo);
    assert(throwSafeAssessment && throwSafeAssessment.safe, "assessThrowCandidateForState: should mark throw safe when stronger same-suit pairs are publicly exhausted");
    const safeThrowEntry = createCandidateEntry(safeThrowCombo, "manual", ["throw", "hearts"]);
    const safeThrowResult = filterCandidateEntriesForState(throwSafeState, 3, "lead", [safeThrowEntry]);
    assert(safeThrowResult.entries[0].tags.includes("throw_safe"), "filterCandidateEntriesForState: publicly safe throw should carry throw_safe tag");

    resetCommonState();
    state.friendTarget = { suit: "hearts", rank: "A", occurrence: 1, revealed: false, failed: false };
    const objective = getIntermediateObjective(3, "lead", cloneSimulationState(state));
    assert(objective.primary === "find_friend", "getIntermediateObjective: unresolved friend should prioritize find_friend");
    assert(objective.weights.friend > objective.weights.bottom, "getIntermediateObjective: friend weight should dominate bottom weight in unresolved phase");

    resetCommonState();
    const evaluation = evaluateState(cloneSimulationState(state), 3, getIntermediateObjective(3, "lead", cloneSimulationState(state)));
    assert(typeof evaluation.total === "number", "evaluateState: should return numeric total");
    assert(typeof evaluation.breakdown.structure === "number", "evaluateState: should expose structure breakdown");
    assert(typeof evaluation.breakdown.allySupport === "number", "evaluateState: should expose ally-support breakdown");
    assert(typeof evaluation.breakdown.tempo === "number", "evaluateState: should expose tempo breakdown");
    assert(typeof evaluation.breakdown.friendRisk === "number", "evaluateState: should expose friend-risk breakdown");
    assert(typeof evaluation.breakdown.bottomRisk === "number", "evaluateState: should expose bottom-risk breakdown");
    assert(typeof evaluation.breakdown.pointRunRisk === "number", "evaluateState: should expose point-run-risk breakdown");
    assert(evaluation.objective.primary.length > 0, "evaluateState: should include objective");

    resetCommonState();
    state.friendTarget = { suit: "spades", rank: "A", occurrence: 1, revealed: true, failed: false, revealedBy: 2, matchesSeen: 1 };
    state.hiddenFriendId = 2;
    state.currentTurnId = 2;
    state.leaderId = 2;
    const resolvedBankerLeadObjective = getIntermediateObjective(2, "lead", cloneSimulationState(state));
    assert(resolvedBankerLeadObjective.primary === "clear_trump", "getIntermediateObjective: revealed friend should switch banker-side lead priority toward clear_trump");
    assert(resolvedBankerLeadObjective.weights.allySupport > resolvedBankerLeadObjective.weights.friend, "getIntermediateObjective: revealed friend should weight ally support above friend search");

    resetCommonState();
    state.friendTarget = { suit: "spades", rank: "A", occurrence: 1, revealed: true, failed: false, revealedBy: 2, matchesSeen: 1 };
    state.hiddenFriendId = 2;
    state.players = [
      basePlayer(1, [makeCard("ally-p1-c-5", "clubs", "5")], true),
      basePlayer(2, [makeCard("ally-p2-s-a", "spades", "A")]),
      basePlayer(3, [makeCard("ally-p3-c-k", "clubs", "K")]),
      basePlayer(4, [makeCard("ally-p4-d-9", "diamonds", "9")]),
      basePlayer(5, [makeCard("ally-p5-h-9", "hearts", "9")]),
    ];
    state.currentTrick = [
      { playerId: 2, cards: [makeCard("ally-lead-s-8", "spades", "8")] },
    ];
    state.leadSpec = classifyPlay(state.currentTrick[0].cards);
    state.currentTurnId = 1;
    state.leaderId = 2;
    const allyControlState = cloneSimulationState(state);
    const enemyControlState = cloneSimulationState(state);
    enemyControlState.currentTrick = [
      { playerId: 4, cards: [makeCard("enemy-lead-d-8", "diamonds", "8")] },
    ];
    enemyControlState.leadSpec = classifyPlay(enemyControlState.currentTrick[0].cards);
    enemyControlState.currentTurnId = 1;
    enemyControlState.leaderId = 4;
    const allySupportEval = evaluateState(allyControlState, 1, getIntermediateObjective(1, "follow", allyControlState));
    const enemySupportEval = evaluateState(enemyControlState, 1, getIntermediateObjective(1, "follow", enemyControlState));
    assert(allySupportEval.breakdown.allySupport > enemySupportEval.breakdown.allySupport, "evaluateState: revealed-friend ally control should score better allySupport than opponent control");

    resetCommonState();
    const ownTurnTempoState = cloneSimulationState(state);
    ownTurnTempoState.currentTurnId = 3;
    ownTurnTempoState.leaderId = 3;
    ownTurnTempoState.currentTrick = [];
    ownTurnTempoState.leadSpec = null;
    const enemyTurnTempoState = cloneSimulationState(state);
    enemyTurnTempoState.currentTurnId = 4;
    enemyTurnTempoState.leaderId = 4;
    enemyTurnTempoState.currentTrick = [];
    enemyTurnTempoState.leadSpec = null;
    const ownTurnTempo = evaluateState(ownTurnTempoState, 3, getIntermediateObjective(3, "lead", ownTurnTempoState));
    const enemyTurnTempo = evaluateState(enemyTurnTempoState, 3, getIntermediateObjective(3, "lead", enemyTurnTempoState));
    assert(ownTurnTempo.breakdown.tempo > enemyTurnTempo.breakdown.tempo, "evaluateState: own turn should score higher tempo than opponent turn");

    resetCommonState();
    state.currentTurnId = 1;
    state.bankerId = 1;
    state.players[0].hand = sortHand([
      makeCard("banker-h-a", "hearts", "A"),
      makeCard("banker-c-9", "clubs", "9"),
    ]);
    state.friendTarget = { suit: "hearts", rank: "A", occurrence: 1, revealed: false, failed: false, matchesSeen: 0 };
    const bankerFriendRiskEval = evaluateState(cloneSimulationState(state), 1, getIntermediateObjective(1, "lead", cloneSimulationState(state)));
    assert(bankerFriendRiskEval.breakdown.friendRisk < 0, "evaluateState: banker holding target card should incur friend-risk penalty");

    resetCommonState();
    state.friendTarget = { suit: "spades", rank: "A", occurrence: 1, revealed: true, failed: false, revealedBy: 2, matchesSeen: 1 };
    state.hiddenFriendId = 2;
    state.players = [
      basePlayer(1, [makeCard("late-p1-c-5", "clubs", "5")], true),
      basePlayer(2, [makeCard("late-p2-s-a", "spades", "A")]),
      basePlayer(3, [makeCard("late-p3-c-k", "clubs", "K")]),
      basePlayer(4, [makeCard("late-p4-d-9", "diamonds", "9")]),
      basePlayer(5, [makeCard("late-p5-h-9", "hearts", "9")]),
    ];
    state.bottomCards = [makeCard("late-bottom-h-5", "hearts", "5"), makeCard("late-bottom-s-10", "spades", "10")];
    state.currentTrick = [];
    state.leadSpec = null;
    state.trickNumber = 10;
    const ownControlBottomState = cloneSimulationState(state);
    ownControlBottomState.currentTurnId = 3;
    ownControlBottomState.leaderId = 3;
    const enemyControlBottomState = cloneSimulationState(state);
    enemyControlBottomState.currentTurnId = 1;
    enemyControlBottomState.leaderId = 1;
    const ownControlBottomEval = evaluateState(ownControlBottomState, 3, getIntermediateObjective(3, "lead", ownControlBottomState));
    const enemyControlBottomEval = evaluateState(enemyControlBottomState, 3, getIntermediateObjective(3, "lead", enemyControlBottomState));
    assert(ownControlBottomEval.breakdown.bottomRisk > enemyControlBottomEval.breakdown.bottomRisk, "evaluateState: late-round same-side control should score better bottom-risk than opponent control");

    resetCommonState();
    state.friendTarget = { suit: "spades", rank: "A", occurrence: 1, revealed: true, failed: false, revealedBy: 2, matchesSeen: 1 };
    state.hiddenFriendId = 2;
    state.bankerId = 1;
    state.players = [
      basePlayer(1, [makeCard("runrisk-p1-c-5", "clubs", "5")], true),
      basePlayer(2, [makeCard("runrisk-p2-s-a", "spades", "A")]),
      basePlayer(3, [makeCard("runrisk-p3-c-k", "clubs", "K")]),
      basePlayer(4, [makeCard("runrisk-p4-d-9", "diamonds", "9")]),
      basePlayer(5, [makeCard("runrisk-p5-h-9", "hearts", "9")]),
    ];
    state.bottomCards = [makeCard("runrisk-bottom-h-5", "hearts", "5"), makeCard("runrisk-bottom-s-10", "spades", "10")];
    state.currentTrick = [
      { playerId: 4, cards: [makeCard("runrisk-lead-d-k", "diamonds", "K")] },
      { playerId: 5, cards: [makeCard("runrisk-follow-h-10", "hearts", "10")] },
    ];
    state.leadSpec = classifyPlay(state.currentTrick[0].cards);
    state.currentTurnId = 1;
    state.leaderId = 4;
    state.defenderPoints = 70;
    state.trickNumber = 10;
    const enemyPointRunState = cloneSimulationState(state);
    const allyPointRunState = cloneSimulationState(state);
    allyPointRunState.currentTrick = [
      { playerId: 2, cards: [makeCard("runrisk-ally-s-a", "spades", "A")] },
      { playerId: 1, cards: [makeCard("runrisk-ally-c-10", "clubs", "10")] },
    ];
    allyPointRunState.leadSpec = classifyPlay(allyPointRunState.currentTrick[0].cards);
    allyPointRunState.currentTurnId = 3;
    allyPointRunState.leaderId = 2;
    const enemyPointRunEval = evaluateState(enemyPointRunState, 1, getIntermediateObjective(1, "follow", enemyPointRunState));
    const allyPointRunEval = evaluateState(allyPointRunState, 1, getIntermediateObjective(1, "follow", allyPointRunState));
    assert(enemyPointRunEval.breakdown.pointRunRisk < allyPointRunEval.breakdown.pointRunRisk, "evaluateState: opponent-controlled scoring trick should incur worse pointRunRisk than same-side control");

    resetCommonState();
    state.trumpSuit = "spades";
    state.bankerId = 3;
    state.currentTurnId = 3;
    state.leaderId = 3;
    state.trickNumber = 9;
    state.friendTarget = { suit: "hearts", rank: "A", occurrence: 1, revealed: true, failed: false, revealedBy: 2, matchesSeen: 1 };
    state.hiddenFriendId = 2;
    state.players = [
      basePlayer(1, [makeCard("danger-p1-s-9", "spades", "9")], true),
      basePlayer(2, [makeCard("danger-p2-h-a", "hearts", "A")]),
      basePlayer(3, [
        makeCard("danger-p3-s-k-1", "spades", "K"),
        makeCard("danger-p3-s-k-2", "spades", "K"),
        makeCard("danger-p3-s-4", "spades", "4"),
        makeCard("danger-p3-h-3", "hearts", "3"),
        makeCard("danger-p3-c-4", "clubs", "4"),
      ]),
      basePlayer(4, [makeCard("danger-p4-s-a", "spades", "A")]),
      basePlayer(5, [makeCard("danger-p5-d-9", "diamonds", "9")]),
    ];
    const dangerousLeadHand = state.players[2].hand;
    const riskyTrumpPair = [
      dangerousLeadHand.find((card) => card.id === "danger-p3-s-k-1"),
      dangerousLeadHand.find((card) => card.id === "danger-p3-s-k-2"),
    ];
    const safeLowHeart = [dangerousLeadHand.find((card) => card.id === "danger-p3-h-3")];
    const riskyLeadPenalty = scoreIntermediateDangerousPointLeadPenalty(3, riskyTrumpPair, dangerousLeadHand);
    const safeLeadPenalty = scoreIntermediateDangerousPointLeadPenalty(3, safeLowHeart, dangerousLeadHand);
    const riskyLeadScore = scoreIntermediateLeadCandidate(3, riskyTrumpPair, []);
    const safeLeadScore = scoreIntermediateLeadCandidate(3, safeLowHeart, []);
    assert(riskyLeadPenalty > safeLeadPenalty, "scoreIntermediateDangerousPointLeadPenalty: high-point trump pair should incur stronger risk penalty than low side lead");
    assert(riskyLeadScore < safeLeadScore, "scoreIntermediateLeadCandidate: dangerous point-carrying trump probe should score below safer low side lead");

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
    assert(state.lastAiDecision === null, "chooseIntermediatePlay: should skip debug decision bundle when debug panel is closed");
    assert(Array.isArray(state.aiDecisionHistory) && state.aiDecisionHistory.length === 0, "chooseIntermediatePlay: should skip AI decision history when debug panel is closed");
    const skippedExportLog = getResultLogText();
    assert(!skippedExportLog.includes("AI 决策记录："), "getResultLogText: should skip AI decision export when debug panel is closed");

    resetCommonState();
    state.showDebugPanel = true;
    const debugLeadChoice = chooseIntermediatePlay(3, "lead");
    assert(Array.isArray(debugLeadChoice) && debugLeadChoice.length > 0, "chooseIntermediatePlay: should still return a lead selection when debug panel is open");
    assert(state.lastAiDecision && state.lastAiDecision.mode === "lead", "chooseIntermediatePlay: should record last AI decision bundle");
    assert(Array.isArray(state.aiDecisionHistory) && state.aiDecisionHistory.length === 1, "chooseIntermediatePlay: should append AI decision history");
    assert(Array.isArray(state.lastAiDecision.candidateEntries) && state.lastAiDecision.candidateEntries.length > 0, "chooseIntermediatePlay: should persist candidate entries for debug");
    assert(state.lastAiDecision.candidateEntries.every((entry) => typeof entry.heuristicScore === "number"), "chooseIntermediatePlay: should persist heuristic candidate scores");
    assert(state.lastAiDecision.candidateEntries.every((entry) => typeof entry.rolloutScore === "number"), "chooseIntermediatePlay: should persist rollout candidate scores");
    assert(typeof state.lastAiDecision.decisionTimeMs === "number", "chooseIntermediatePlay: should expose decision timing");
    assert(typeof state.lastAiDecision.debugStats?.candidateCount === "number", "chooseIntermediatePlay: should expose debug candidate count");
    assert(typeof state.lastAiDecision.debugStats?.maxRolloutDepth === "number", "chooseIntermediatePlay: should expose max rollout depth");
    assert(typeof state.lastAiDecision.debugStats?.filteredCandidateCount === "number", "chooseIntermediatePlay: should expose filtered candidate count");
    assert(state.lastAiDecision.candidateEntries.every((entry) => Array.isArray(entry.rolloutTriggerFlags)), "chooseIntermediatePlay: should expose rollout trigger flags for every candidate");
    assert(state.lastAiDecision.candidateEntries.every((entry) => entry.rolloutEvaluation && typeof entry.rolloutEvaluation.total === "number"), "chooseIntermediatePlay: should expose rollout evaluation summaries");
    assert(state.lastAiDecision.candidateEntries.every((entry) => !entry.tags.includes("failed_throw")), "chooseIntermediatePlay: candidate tags should not leak hidden-hand failed throw truth");
    assert(state.lastAiDecision.candidateEntries.every((entry) => !entry.tags.includes("invalid")), "chooseIntermediatePlay: legal candidate tags should not include invalid");
    assert(state.lastAiDecision.candidateEntries.every((entry) => validateCandidateForState(cloneSimulationState(state), 3, entry.cards, "lead").ok), "chooseIntermediatePlay: every scored lead candidate should pass defensive legality revalidation");
    const exportedLog = getResultLogText();
    assert(exportedLog.includes("AI 决策记录："), "getResultLogText: should include AI decision export section");
    assert(exportedLog.includes("玩家3 首发"), "getResultLogText: should export recorded AI decision summary");
    const simulatedBundle = buildIntermediateDecisionBundleForState(3, "lead", cloneSimulationState(state));
    assert(Array.isArray(simulatedBundle.candidateEntries) && simulatedBundle.candidateEntries.length > 0, "buildIntermediateDecisionBundleForState: should build candidates from simulation state");
    assert(simulatedBundle.sourceState !== state, "buildIntermediateDecisionBundleForState: should preserve explicit source state reference");

    resetCommonState();
    state.currentTurnId = 4;
    state.leaderId = 1;
    state.currentTrickBeatCount = 1;
    state.players = [
      basePlayer(1, [makeCard("b-c-9", "clubs", "9")], true),
      basePlayer(2, [makeCard("p2-d-9", "diamonds", "9")]),
      basePlayer(3, [makeCard("p3-c-7", "clubs", "7")]),
      basePlayer(4, [
        makeCard("p4-h-2-1", "hearts", "2"),
        makeCard("p4-h-2-2", "hearts", "2"),
        makeCard("p4-c-3", "clubs", "3"),
        makeCard("p4-d-4", "diamonds", "4"),
      ]),
      basePlayer(5, [makeCard("p5-s-9", "spades", "9")]),
    ];
    state.currentTrick = [
      { playerId: 1, cards: [makeCard("t1-s-7-1", "spades", "7"), makeCard("t1-s-7-2", "spades", "7")] },
      { playerId: 2, cards: [makeCard("t2-s-5", "spades", "5"), makeCard("t2-s-6", "spades", "6")] },
      { playerId: 3, cards: [makeCard("t3-j-r-1", "joker", "RJ"), makeCard("t3-j-r-2", "joker", "RJ")] },
    ];
    state.leadSpec = classifyPlay(state.currentTrick[0].cards);
    const avoidTrumpPairChoice = chooseIntermediatePlay(4, "follow", getLegalSelectionsForPlayer(4));
    assert(avoidTrumpPairChoice.length === 2, "chooseIntermediatePlay follow: should return a legal two-card follow");
    assert(!avoidTrumpPairChoice.every((card) => card.rank === "2" && card.suit === "hearts"), "chooseIntermediatePlay follow: should not waste a trump pair when it cannot win");

    resetCommonState();
    state.currentTurnId = 4;
    state.leaderId = 1;
    state.players = [
      basePlayer(1, [makeCard("last-p1-s-7", "spades", "7")], true),
      basePlayer(2, [makeCard("last-p2-s-8", "spades", "8")]),
      basePlayer(3, [makeCard("last-p3-j-r", "joker", "RJ")]),
      basePlayer(4, [makeCard("last-p4-h-3", "hearts", "3")]),
      basePlayer(5, [makeCard("last-p5-s-9", "spades", "9")]),
    ];
    state.currentTrick = [
      { playerId: 1, cards: [makeCard("last-t1-s-7", "spades", "7")] },
      { playerId: 2, cards: [makeCard("last-t2-s-8", "spades", "8")] },
      { playerId: 3, cards: [makeCard("last-t3-j-r", "joker", "RJ")] },
    ];
    state.leadSpec = classifyPlay(state.currentTrick[0].cards);
    const originalHint = getLegalHintForPlayer;
    const originalSearch = findLegalSelectionBySearch;
    const originalForced = buildForcedFollowFallback;
    getLegalHintForPlayer = function brokenHint() { return []; };
    findLegalSelectionBySearch = function brokenSearch() { return []; };
    buildForcedFollowFallback = function brokenForced() { return []; };
    autoPlayCurrentTurn();
    getLegalHintForPlayer = originalHint;
    findLegalSelectionBySearch = originalSearch;
    buildForcedFollowFallback = originalForced;
    clearTimers();
    assert(state.players[3].hand.length === 0, "autoPlayCurrentTurn: emergency fallback should still play the last card");
    assert(state.currentTrick.length === 4, "autoPlayCurrentTurn: emergency fallback should advance the live trick");

    globalThis.__intermediateFoundationResults = {
      results: [
        "simulation clone isolation ok",
        "candidate generation scaffold ok",
        "simulation-state candidate generation ok",
        "objective weighting scaffold ok",
        "state evaluation scaffold ok",
        "revealed-friend objective switch ok",
        "ally-support evaluation scaffold ok",
        "tempo evaluation scaffold ok",
        "friend-risk evaluation scaffold ok",
        "bottom-risk evaluation scaffold ok",
        "point-run-risk evaluation scaffold ok",
        "dangerous point-lead penalty scaffold ok",
        "single trick rollout isolation ok",
        "intermediate unified entry scaffold ok",
        "debug-disabled decision skip ok",
        "intermediate decision debug scaffold ok",
        "ai decision history export ok",
        "simulation-state decision bundle ok",
        "void follow avoids wasting trump pair ok",
        "autoplay emergency fallback ok",
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
