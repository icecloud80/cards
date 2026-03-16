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

// 运行“叫朋友 / 找朋友 / 站队”AI 策略测试套件。
function runFriendStrategySuite(context) {
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

    // 重置测试共用的牌局状态。
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

    // 搭建叫死朋友的测试场景。
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

    // 搭建第三张朋友牌叫死的测试场景。
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

    // 搭建首轮延后站队的测试场景。
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

    function setupDelayRevealOnBankerAceLeadScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "clubs";
      state.trickNumber = 1;
      state.players = [
        basePlayer(1, [makeCard("b-h-a", "hearts", "A")], true),
        basePlayer(2, [makeCard("p2-d-9", "diamonds", "9")]),
        basePlayer(3, [
          makeCard("p3-h-k", "hearts", "K"),
          makeCard("p3-h-3", "hearts", "3"),
        ]),
        basePlayer(4, [makeCard("p4-h-8", "hearts", "8")]),
        basePlayer(5, [makeCard("p5-h-7", "hearts", "7")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "K", occurrence: 2 });
      state.friendTarget.matchesSeen = 1;
      state.currentTrick = [{
        playerId: 1,
        cards: [makeCard("lead-h-a", "hearts", "A")],
      }];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 1;
      state.currentTurnId = 3;
    }

    function setupDelayRevealOnSecondBankerAceScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "clubs";
      state.trickNumber = 2;
      state.players = [
        basePlayer(1, [makeCard("b-h-a-2", "hearts", "A")], true),
        basePlayer(2, [makeCard("p2-d-9", "diamonds", "9")]),
        basePlayer(3, [
          makeCard("p3-h-a-3", "hearts", "A"),
          makeCard("p3-h-3-2", "hearts", "3"),
        ]),
        basePlayer(4, [makeCard("p4-h-8-2", "hearts", "8")]),
        basePlayer(5, [makeCard("p5-h-7-2", "hearts", "7")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 3 });
      state.friendTarget.matchesSeen = 2;
      state.currentTrick = [{
        playerId: 1,
        cards: [makeCard("lead-h-a-2", "hearts", "A")],
      }];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 1;
      state.currentTurnId = 3;
    }

    function setupRevealTakeoverScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "clubs";
      state.trickNumber = 2;
      state.players = [
        basePlayer(1, [makeCard("b-h-q", "hearts", "Q")], true),
        basePlayer(2, [makeCard("p2-d-9-2", "diamonds", "9")]),
        basePlayer(3, [
          makeCard("p3-h-k-2", "hearts", "K"),
          makeCard("p3-h-3-3", "hearts", "3"),
        ]),
        basePlayer(4, [makeCard("p4-h-8-3", "hearts", "8")]),
        basePlayer(5, [makeCard("p5-h-7-3", "hearts", "7")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "K", occurrence: 2 });
      state.friendTarget.matchesSeen = 1;
      state.currentTrick = [{
        playerId: 1,
        cards: [makeCard("lead-h-q-2", "hearts", "Q")],
      }];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 1;
      state.currentTurnId = 3;
    }

    // 搭建回牌给庄家的测试场景。
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

    // 搭建庄家暗断门时回牌的测试场景。
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

    // 搭建自动成友的测试场景。
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

    // 搭建“叫第二张 A 且自己持有第一张 A，应尽快先打出去”的测试场景。
    function setupBankerFriendSetupLeadScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.phase = "playing";
      state.bankerId = 5;
      state.currentTurnId = 5;
      state.leaderId = 5;
      state.trickNumber = 2;
      state.trumpSuit = "clubs";
      state.players = [
        basePlayer(1, [makeCard("p1-s-7", "spades", "7")], true),
        basePlayer(2, [makeCard("p2-d-8", "diamonds", "8")]),
        basePlayer(3, [makeCard("p3-s-9", "spades", "9")]),
        basePlayer(4, [makeCard("p4-c-6", "clubs", "6")]),
        basePlayer(5, [
          makeCard("banker-h-a-held", "hearts", "A"),
          makeCard("banker-c-k-1", "clubs", "K"),
          makeCard("banker-c-k-2", "clubs", "K"),
          makeCard("banker-s-j", "spades", "J"),
        ]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 2 });
      state.friendTarget.matchesSeen = 0;
    }

    function setupAvoidKingWhileAceAliveScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.phase = "callingFriend";
      state.bankerId = 5;
      state.currentTurnId = 5;
      state.leaderId = 5;
      state.trumpSuit = "clubs";
      state.players = [
        basePlayer(1, [makeCard("p1-h-a", "hearts", "A")], true),
        basePlayer(2, [makeCard("p2-h-k", "hearts", "K")]),
        basePlayer(3, [makeCard("p3-c-9", "clubs", "9")]),
        basePlayer(4, [makeCard("p4-s-a", "spades", "A")]),
        basePlayer(5, [
          makeCard("b-h-k-1", "hearts", "K"),
          makeCard("b-d-a", "diamonds", "A"),
          makeCard("b-d-9", "diamonds", "9"),
          makeCard("b-s-k", "spades", "K"),
        ]),
      ];
    }

    // 搭建闲家回牌给队友的测试场景。
    function setupDefenderReturnToAllyScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [makeCard("b-s-9", "spades", "9")], true),
        basePlayer(2, [makeCard("p2-d-a", "diamonds", "A")]),
        basePlayer(3, [makeCard("p3-h-9", "hearts", "9"), makeCard("p3-c-6", "clubs", "6")]),
        basePlayer(4, [
          makeCard("p4-c-a", "clubs", "A"),
          makeCard("p4-h-j", "hearts", "J"),
          makeCard("p4-h-3", "hearts", "3"),
        ]),
        basePlayer(5, [makeCard("p5-c-5", "clubs", "5")]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.currentTurnId = 4;
      state.leaderId = 4;
    }

    // 搭建闲家跟牌配合的测试场景。
    function setupDefenderFollowSupportScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [makeCard("b-c-7", "clubs", "7")], true),
        basePlayer(2, [makeCard("p2-h-8", "hearts", "8")]),
        basePlayer(3, [makeCard("p3-h-9", "hearts", "9")]),
        basePlayer(4, [
          makeCard("p4-h-a", "hearts", "A"),
          makeCard("p4-h-3", "hearts", "3"),
        ]),
        basePlayer(5, [makeCard("p5-c-5", "clubs", "5")]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.currentTrick = [
        { playerId: 1, cards: [makeCard("lead-h-7", "hearts", "7")] },
        { playerId: 2, cards: [makeCard("p2-h-8-play", "hearts", "8")] },
        { playerId: 3, cards: [makeCard("p3-h-9-play", "hearts", "9")] },
      ];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 1;
      state.currentTurnId = 4;
    }

    // 搭建闲家跟牌压墩的测试场景。
    function setupDefenderFollowBeatScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [makeCard("b-c-7", "clubs", "7")], true),
        basePlayer(2, [makeCard("p2-h-8", "hearts", "8")]),
        basePlayer(3, [makeCard("p3-h-7", "hearts", "7")]),
        basePlayer(4, [
          makeCard("p4-h-a", "hearts", "A"),
          makeCard("p4-h-3", "hearts", "3"),
        ]),
        basePlayer(5, [makeCard("p5-c-5", "clubs", "5")]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.currentTrick = [
        { playerId: 1, cards: [makeCard("lead-h-9", "hearts", "9")] },
        { playerId: 2, cards: [makeCard("p2-h-8-play", "hearts", "8")] },
        { playerId: 3, cards: [makeCard("p3-h-7-play", "hearts", "7")] },
      ];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 1;
      state.currentTurnId = 4;
    }

    // 搭建清主控场的测试场景。
    function setupTrumpClearControlScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [makeCard("b-s-9", "spades", "9")], true),
        basePlayer(2, [makeCard("p2-s-j-1", "spades", "J"), makeCard("p2-s-j-2", "spades", "J")]),
        basePlayer(3, [
          makeCard("p3-c-7-1", "clubs", "7"),
          makeCard("p3-c-7-2", "clubs", "7"),
          makeCard("p3-c-8-1", "clubs", "8"),
          makeCard("p3-c-8-2", "clubs", "8"),
          makeCard("p3-s-k-1", "spades", "K"),
          makeCard("p3-s-k-2", "spades", "K"),
          makeCard("p3-s-a-1", "spades", "A"),
          makeCard("p3-s-a-2", "spades", "A"),
        ]),
        basePlayer(4, [makeCard("p4-h-9", "hearts", "9")]),
        basePlayer(5, [makeCard("p5-d-9", "diamonds", "9")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 3;
      state.hiddenFriendId = 3;
      state.currentTurnId = 3;
      state.leaderId = 3;
    }

    // 搭建为保护对子而清主的测试场景。
    function setupTrumpClearForPairSafetyScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [makeCard("b-s-9", "spades", "9")], true),
        basePlayer(2, [makeCard("p2-s-q-1", "spades", "Q"), makeCard("p2-s-q-2", "spades", "Q")]),
        basePlayer(3, [
          makeCard("p3-c-9-1", "clubs", "9"),
          makeCard("p3-c-9-2", "clubs", "9"),
          makeCard("p3-s-a-1", "spades", "A"),
          makeCard("p3-s-a-2", "spades", "A"),
          makeCard("p3-s-k-1", "spades", "K"),
          makeCard("p3-s-k-2", "spades", "K"),
          makeCard("p3-h-5", "hearts", "5"),
        ]),
        basePlayer(4, [makeCard("p4-d-9", "diamonds", "9")]),
        basePlayer(5, [makeCard("p5-h-9", "hearts", "9")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 3;
      state.hiddenFriendId = 3;
      state.currentTurnId = 3;
      state.leaderId = 3;
    }

    function setupPreserveTripleLeadScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [makeCard("b-c-3", "clubs", "3")], true),
        basePlayer(2, [makeCard("p2-d-3", "diamonds", "3")]),
        basePlayer(3, [
          makeCard("p3-s-k-1", "spades", "K"),
          makeCard("p3-s-k-2", "spades", "K"),
          makeCard("p3-s-k-3", "spades", "K"),
          makeCard("p3-s-9", "spades", "9"),
        ]),
        basePlayer(4, [makeCard("p4-h-3", "hearts", "3")]),
        basePlayer(5, [makeCard("p5-c-4", "clubs", "4")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 2;
      state.hiddenFriendId = 2;
      state.currentTurnId = 3;
      state.leaderId = 3;
    }

    // 搭建避免给庄家将吃机会的测试场景。
    function setupAvoidBankerRuffLeadScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [makeCard("b-s-9", "spades", "9")], true),
        basePlayer(2, [makeCard("p2-s-a", "spades", "A")]),
        basePlayer(3, [
          makeCard("p3-h-k", "hearts", "K"),
          makeCard("p3-h-9", "hearts", "9"),
          makeCard("p3-c-7", "clubs", "7"),
        ]),
        basePlayer(4, [makeCard("p4-d-8", "diamonds", "8")]),
        basePlayer(5, [makeCard("p5-c-5", "clubs", "5")]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 2;
      state.hiddenFriendId = 2;
      state.currentTurnId = 3;
      state.leaderId = 3;
      state.exposedSuitVoid[1].hearts = true;
    }

    // 搭建允许队友补位化解将吃的测试场景。
    function setupAllowCoverRuffLeadScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [makeCard("b-s-9", "spades", "9")], true),
        basePlayer(2, [makeCard("p2-s-a", "spades", "A")]),
        basePlayer(3, [
          makeCard("p3-h-k", "hearts", "K"),
          makeCard("p3-h-9", "hearts", "9"),
          makeCard("p3-c-7", "clubs", "7"),
        ]),
        basePlayer(4, [makeCard("p4-h-8", "hearts", "8")]),
        basePlayer(5, [makeCard("p5-d-8", "diamonds", "8")]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 5;
      state.hiddenFriendId = 5;
      state.currentTurnId = 3;
      state.leaderId = 3;
      state.exposedSuitVoid[1].hearts = true;
      state.exposedSuitVoid[2].hearts = true;
    }

    const results = [];

    for (const difficulty of ["beginner", "intermediate"]) {
      setupCalledDeadFriendScenario(difficulty);
      assert(isAiCertainFriend(3) === true, difficulty + ": player 3 should be identified as certain friend");
      assert(canAiRevealFriendNow(3) === true, difficulty + ": player 3 should be able to stand now");
      const hint = getLegalHintForPlayer(3);
      assert(hint.length === 1, difficulty + ": stand hint should be a single card");
      assert(hint[0].suit === "hearts" && hint[0].rank === "A", difficulty + ": certain friend should lead hearts A to stand");
      results.push(difficulty + " certain-friend stand ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupThirdAceCalledDeadScenario(difficulty);
      assert(isAiCertainFriend(3) === true, difficulty + ": third-A holder should be identified as certain friend");
      assert(canAiRevealFriendNow(3) === true, difficulty + ": third-A holder should be able to stand now");
      const hint = getLegalHintForPlayer(3);
      assert(hint.length === 1, difficulty + ": third-A stand should be a single card");
      assert(hint[0].suit === "hearts" && hint[0].rank === "A", difficulty + ": third-A holder should lead hearts A to stand");
      results.push(difficulty + " third-A called-dead stand ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupDelayRevealOpeningLeadScenario(difficulty);
      assert(isAiCertainFriend(3) === false, difficulty + ": opening-lead probe case should not mark player 3 as certain friend");
      const hint = getLegalHintForPlayer(3);
      assert(hint.length === 1, difficulty + ": delayed stand should still choose a single follow card");
      assert(hint[0].suit === "hearts" && hint[0].rank === "3", difficulty + ": opening-lead probe should delay standing and play low heart");
      results.push(difficulty + " opening-probe delay stand ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupDelayRevealOnBankerAceLeadScenario(difficulty);
      assert(canAiRevealFriendNow(3) === true, difficulty + ": banker-A lead case should still be a stand opportunity");
      const hint = getLegalHintForPlayer(3);
      assert(hint.length === 1, difficulty + ": banker-A lead delay should still choose a single follow card");
      assert(hint[0].suit === "hearts" && hint[0].rank === "3", difficulty + ": should delay standing on second K when banker already leads A");
      results.push(difficulty + " banker-A delay stand ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupDelayRevealOnSecondBankerAceScenario(difficulty);
      assert(canAiRevealFriendNow(3) === true, difficulty + ": second banker-A lead should still be a stand opportunity");
      const hint = getLegalHintForPlayer(3);
      assert(hint.length === 1, difficulty + ": second banker-A delay should still choose a single follow card");
      assert(hint[0].suit === "hearts" && hint[0].rank === "3", difficulty + ": should delay standing on third A when banker leads another A that still keeps control");
      results.push(difficulty + " second banker-A delay stand ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupBankerFriendSetupLeadScenario(difficulty);
      const hint = chooseAiLeadPlay(5);
      assert(hint.length === 1, difficulty + ": banker friend-setup scenario should choose a single heuristic lead");
      assert(hint[0].suit === "hearts" && hint[0].rank === "A", difficulty + ": banker should heuristically lead held hearts A early to set up delayed friend standing");
      results.push(difficulty + " banker friend-setup lead ok");
    }

    setupRevealTakeoverScenario("beginner");
    const beginnerRevealTakeover = getLegalHintForPlayer(3);
    assert(beginnerRevealTakeover.length === 1, "beginner: stand-takeover scenario should choose a single follow card");
    results.push("beginner stand-takeover baseline -> " + beginnerRevealTakeover[0].suit + "-" + beginnerRevealTakeover[0].rank);

    setupRevealTakeoverScenario("intermediate");
    const intermediateRevealTakeover = getLegalHintForPlayer(3);
    assert(intermediateRevealTakeover.length === 1, "intermediate: stand-takeover scenario should choose a single follow card");
    assert(intermediateRevealTakeover[0].suit === "hearts" && intermediateRevealTakeover[0].rank === "K", "intermediate: should stand and take over when friend card can beat banker lead");
    results.push("intermediate stand-takeover ok");

    for (const difficulty of ["beginner", "intermediate"]) {
      setupAutoFriendScenario(difficulty);
      const chosen = chooseFriendTarget().target;
      assert(["A", "K"].includes(chosen.rank), difficulty + ": auto friend target should stay in A/K, got " + chosen.rank);
      results.push(difficulty + " auto-friend rank ok -> " + chosen.rank);
    }

    setupAvoidKingWhileAceAliveScenario("beginner");
    const beginnerAvoidKingWhileAceAlive = chooseFriendTarget().target;
    results.push("beginner avoid-K-with-live-A baseline -> " + beginnerAvoidKingWhileAceAlive.suit + "-" + beginnerAvoidKingWhileAceAlive.rank);

    setupAvoidKingWhileAceAliveScenario("intermediate");
    const intermediateAvoidKingWhileAceAlive = chooseFriendTarget().target;
    assert(!(intermediateAvoidKingWhileAceAlive.suit === "hearts" && intermediateAvoidKingWhileAceAlive.rank === "K"), "intermediate: should not call hearts K while hearts A is still outside banker");
    results.push("intermediate avoid-K-with-live-A ok -> " + intermediateAvoidKingWhileAceAlive.suit + "-" + intermediateAvoidKingWhileAceAlive.rank);

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
    assert(!(intermediateHiddenVoidLead[0].suit === "hearts" && intermediateHiddenVoidLead[0].rank === "3"), "intermediate: should not infer hidden banker void from unseen cards");
    results.push("intermediate hidden-void stays public-info-only ok");

    setupDefenderReturnToAllyScenario("beginner");
    const beginnerDefenderReturnLead = getLegalHintForPlayer(4);
    assert(beginnerDefenderReturnLead.length === 1, "beginner: defender return scenario should choose a single lead");
    assert(!(beginnerDefenderReturnLead[0].suit === "hearts" && beginnerDefenderReturnLead[0].rank === "3"), "beginner: should not already prefer defender handoff to ally");
    results.push("beginner defender-return baseline -> " + beginnerDefenderReturnLead[0].suit + "-" + beginnerDefenderReturnLead[0].rank);

    setupDefenderReturnToAllyScenario("intermediate");
    const intermediateDefenderReturnLead = getLegalHintForPlayer(4);
    assert(intermediateDefenderReturnLead.length === 1, "intermediate: defender return scenario should choose a single lead");
    assert(!(intermediateDefenderReturnLead[0].suit === "hearts" && intermediateDefenderReturnLead[0].rank === "3"), "intermediate: should not hand control to an unrevealed tentative ally");
    results.push("intermediate defender-return stays public-info-only ok");

    setupDefenderFollowSupportScenario("intermediate");
    const intermediateDefenderFollowSupport = getLegalHintForPlayer(4);
    assert(intermediateDefenderFollowSupport.length === 1, "intermediate: defender follow-support scenario should choose a single card");
    assert(intermediateDefenderFollowSupport[0].suit === "hearts" && intermediateDefenderFollowSupport[0].rank === "3", "intermediate: should not overtake tentative defender ally while following");
    results.push("intermediate defender-follow support ok");

    setupDefenderFollowBeatScenario("beginner");
    const beginnerDefenderFollowBeat = getLegalHintForPlayer(4);
    assert(beginnerDefenderFollowBeat.length === 1, "beginner: defender follow-beat scenario should choose a single card");
    results.push("beginner defender-follow beat baseline -> " + beginnerDefenderFollowBeat[0].suit + "-" + beginnerDefenderFollowBeat[0].rank);

    setupDefenderFollowBeatScenario("intermediate");
    const intermediateDefenderFollowBeat = getLegalHintForPlayer(4);
    assert(intermediateDefenderFollowBeat.length === 1, "intermediate: defender follow-beat scenario should choose a single card");
    assert(intermediateDefenderFollowBeat[0].suit === "hearts" && intermediateDefenderFollowBeat[0].rank === "A", "intermediate: should beat banker lead to reclaim control for defender side");
    results.push("intermediate defender-follow beat ok");

    setupTrumpClearControlScenario("beginner");
    const beginnerTrumpClearControl = getLegalHintForPlayer(3);
    assert(beginnerTrumpClearControl.length === 4, "beginner: trump-clear control scenario should choose a 4-card lead");
    results.push("beginner trump-clear control baseline -> " + beginnerTrumpClearControl.map((card) => card.suit + "-" + card.rank).join(","));

    setupTrumpClearControlScenario("intermediate");
    const intermediateTrumpClearControl = getLegalHintForPlayer(3);
    assert(intermediateTrumpClearControl.length >= 2, "intermediate: trump-clear control scenario should choose a structured trump lead");
    assert(intermediateTrumpClearControl.every((card) => card.suit === "spades"), "intermediate: should clear trump first when control is strong");
    results.push("intermediate trump-clear control ok");

    setupTrumpClearForPairSafetyScenario("beginner");
    const beginnerTrumpClearSafety = getLegalHintForPlayer(3);
    assert(beginnerTrumpClearSafety.length >= 1, "beginner: trump-clear safety scenario should choose a legal lead");
    results.push("beginner trump-clear safety baseline -> " + beginnerTrumpClearSafety.map((card) => card.suit + "-" + card.rank).join(","));

    setupTrumpClearForPairSafetyScenario("intermediate");
    const intermediateTrumpClearSafety = getLegalHintForPlayer(3);
    assert(intermediateTrumpClearSafety.length >= 2, "intermediate: trump-clear safety scenario should choose a structured trump lead");
    assert(intermediateTrumpClearSafety.every((card) => card.suit === "spades"), "intermediate: should clear trump before exposing side-suit pair");
    results.push("intermediate trump-clear safety ok");

    setupPreserveTripleLeadScenario("beginner");
    const beginnerPreserveTripleLead = getLegalHintForPlayer(3);
    assert(beginnerPreserveTripleLead.length === 3, "beginner: preserve-triple scenario should choose all three trump K");
    results.push("beginner preserve-triple lead ok");

    setupPreserveTripleLeadScenario("intermediate");
    const intermediatePreserveTripleLead = getLegalHintForPlayer(3);
    assert(intermediatePreserveTripleLead.length === 3, "intermediate: preserve-triple scenario should choose all three trump K");
    assert(intermediatePreserveTripleLead.every((card) => card.suit === "spades" && card.rank === "K"), "intermediate: should not split an exact triple on lead");
    results.push("intermediate preserve-triple lead ok");

    for (const difficulty of ["beginner", "intermediate"]) {
      setupAvoidBankerRuffLeadScenario(difficulty);
      const hint = getLegalHintForPlayer(3);
      assert(hint.length >= 1, difficulty + ": anti-ruff scenario should choose a legal lead");
      assert(!(hint.every((card) => card.suit === "hearts")), difficulty + ": should avoid re-leading banker void suit without cover");
      results.push(difficulty + " avoid-banker-ruff lead ok");
    }

    setupAllowCoverRuffLeadScenario("beginner");
    const beginnerAllowCoverRuffLead = getLegalHintForPlayer(3);
    assert(beginnerAllowCoverRuffLead.length >= 1, "beginner: cover-ruff scenario should choose a legal lead");
    results.push("beginner allow-cover-ruff baseline -> " + beginnerAllowCoverRuffLead.map((card) => card.suit + "-" + card.rank).join(","));

    setupAllowCoverRuffLeadScenario("intermediate");
    const intermediateAllowCoverRuffLead = getLegalHintForPlayer(3);
    assert(intermediateAllowCoverRuffLead.length >= 1, "intermediate: cover-ruff scenario should choose a legal lead");
    assert(intermediateAllowCoverRuffLead.every((card) => card.suit === "hearts"), "intermediate: should allow re-leading banker void suit when ally after banker can cover");
    results.push("intermediate allow-cover-ruff lead ok");

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
