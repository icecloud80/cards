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

    // 搭建“延迟站队时不该拆同门拖拉机”的测试场景。
    function setupDelayRevealPreserveSuitStructureScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "clubs";
      state.players = [
        basePlayer(1, [
          makeCard("p1-s-a-1", "spades", "A"),
          makeCard("p1-s-a-2", "spades", "A"),
          makeCard("p1-s-9-1", "spades", "9"),
          makeCard("p1-s-9-2", "spades", "9"),
          makeCard("p1-s-8-1", "spades", "8"),
          makeCard("p1-s-8-2", "spades", "8"),
          makeCard("p1-s-5", "spades", "5"),
        ], true),
        basePlayer(2, [makeCard("banker-d-9", "diamonds", "9")]),
        basePlayer(3, [makeCard("p3-h-7", "hearts", "7")]),
        basePlayer(4, [makeCard("p4-c-7", "clubs", "7")]),
        basePlayer(5, [makeCard("p5-d-7", "diamonds", "7")]),
      ];
      state.bankerId = 2;
      state.currentTrick = [{
        playerId: 2,
        cards: [makeCard("lead-s-a", "spades", "A")],
      }];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 2;
      state.currentTurnId = 1;
      setFriendTarget({ suit: "spades", rank: "A", occurrence: 2 });
      state.friendTarget.matchesSeen = 1;
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

    /**
     * 作用：
     * 搭建“中级应根据已公开高张出牌，主动用小牌递给同伴”的测试场景。
     *
     * 为什么这样写：
     * 用户新增的递牌概念不只包括“同伴已绝门”的硬信号，
     * 还包括“敌方已经公开花掉这门高张、但仍有小牌”时，用小牌把牌权递给同伴的软信号。
     * 这里固定一手公开可解释的心牌历史，验证中级会把这门当作递牌门。
     *
     * 输入：
     * @param {void} - 场景固定给玩家 4 首发。
     *
     * 输出：
     * @returns {void} 直接写入 playing 状态。
     *
     * 注意：
     * - 这里不暴露任何暗手，只通过 played 记录提供公开历史。
     * - 朋友已站队，玩家 4 与玩家 2 同为闲家侧，验证的是“递给同伴”，不是“回打家”。
     */
    function setupSoftHandoffLeadScenario() {
      resetCommonState();
      state.aiDifficulty = "intermediate";
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [makeCard("b-s-9", "spades", "9")], true),
        basePlayer(2, [makeCard("p2-c-8", "clubs", "8")]),
        basePlayer(3, [makeCard("p3-d-9", "diamonds", "9")]),
        basePlayer(4, [
          makeCard("p4-h-9", "hearts", "9"),
          makeCard("p4-h-3", "hearts", "3"),
          makeCard("p4-c-a", "clubs", "A"),
        ]),
        basePlayer(5, [makeCard("p5-s-k", "spades", "K")]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 3;
      state.hiddenFriendId = 3;
      state.currentTurnId = 4;
      state.leaderId = 4;
      state.players[0].played = [
        makeCard("hist-b-h-a", "hearts", "A"),
        makeCard("hist-b-h-6", "hearts", "6"),
      ];
      state.players[2].played = [
        makeCard("hist-p3-h-k", "hearts", "K"),
      ];
      state.playHistory = [
        makeCard("hist-b-h-a", "hearts", "A"),
        makeCard("hist-b-h-6", "hearts", "6"),
        makeCard("hist-p3-h-k", "hearts", "K"),
      ];
    }

    /**
     * 作用：
     * 搭建“中级接同伴递牌时，应考虑用更大的主/王稳接”的测试场景。
     *
     * 为什么这样写：
     * 用户明确补充：当同伴递牌给你，而后位敌人也可能断这门时，经常要用到大王来接。
     * 这里让玩家 4 在断门后可选“小主”或“黑桃王”，验证中级会优先选择更稳的接法。
     *
     * 输入：
     * @param {void} - 场景固定给玩家 4 跟牌。
     *
     * 输出：
     * @returns {void} 直接写入 playing 状态。
     *
     * 注意：
     * - 玩家 2 是同侧首家，先出一张低心牌，构成明显的递牌起手。
     * - 玩家 5 已公开心绝门，用来表达“后位敌人也可能继续毙”的风险。
     */
    function setupHandoffReceiveScenario() {
      resetCommonState();
      state.aiDifficulty = "intermediate";
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [
          makeCard("b-c-7", "clubs", "7"),
          makeCard("b-d-6", "diamonds", "6"),
          makeCard("b-d-7", "diamonds", "7"),
          makeCard("b-c-8", "clubs", "8"),
          makeCard("b-h-5", "hearts", "5"),
          makeCard("b-s-8", "spades", "8"),
        ], true),
        basePlayer(2, [
          makeCard("p2-h-3", "hearts", "3"),
          makeCard("p2-c-6", "clubs", "6"),
          makeCard("p2-c-9", "clubs", "9"),
          makeCard("p2-d-8", "diamonds", "8"),
          makeCard("p2-s-6", "spades", "6"),
          makeCard("p2-d-7", "diamonds", "7"),
        ]),
        basePlayer(3, [
          makeCard("p3-h-9", "hearts", "9"),
          makeCard("p3-c-10", "clubs", "10"),
          makeCard("p3-d-10", "diamonds", "10"),
          makeCard("p3-s-7", "spades", "7"),
          makeCard("p3-h-j", "hearts", "J"),
          makeCard("p3-c-q", "clubs", "Q"),
        ]),
        basePlayer(4, [
          makeCard("p4-s-5", "spades", "5"),
          makeCard("p4-rj", "joker", "RJ"),
        ]),
        basePlayer(5, [
          makeCard("p5-s-a", "spades", "A"),
          makeCard("p5-c-j", "clubs", "J"),
          makeCard("p5-d-j", "diamonds", "J"),
          makeCard("p5-h-8", "hearts", "8"),
          makeCard("p5-s-k", "spades", "K"),
          makeCard("p5-c-k", "clubs", "K"),
        ]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 3;
      state.hiddenFriendId = 3;
      state.currentTrick = [
        { playerId: 2, cards: [makeCard("lead-h-3-handoff", "hearts", "3")] },
        { playerId: 3, cards: [makeCard("enemy-h-9-handoff", "hearts", "9")] },
      ];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.currentTurnId = 4;
      state.leaderId = 2;
      state.exposedSuitVoid[4].hearts = true;
      state.exposedSuitVoid[5].hearts = true;
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

    /**
     * 作用：
     * 搭建“初级应优先选择最短副牌 A 做朋友牌”的测试场景。
     *
     * 为什么这样写：
     * 这次规则把初级叫朋友明确改成“优先副牌 A，并优先最短门”；
     * 这里同时给出多门副牌 A，验证它会稳定选择最短的那一门。
     *
     * 输入：
     * @param {void} - 场景固定给打家 5 使用。
     *
     * 输出：
     * @returns {void} 直接写入 callingFriend 状态。
     *
     * 注意：
     * - 黑桃只有 "A + 7" 两张，应被视为最短门。
     * - 方块虽然也有 "A"，但门更长，不应压过黑桃。
     */
    function setupBeginnerShortestSideAceScenario() {
      resetCommonState();
      state.aiDifficulty = "beginner";
      state.phase = "callingFriend";
      state.bankerId = 5;
      state.currentTurnId = 5;
      state.leaderId = 5;
      state.trumpSuit = "clubs";
      state.players = [
        basePlayer(1, [makeCard("p1-c-6", "clubs", "6")], true),
        basePlayer(2, [makeCard("p2-h-8", "hearts", "8")]),
        basePlayer(3, [makeCard("p3-d-9", "diamonds", "9")]),
        basePlayer(4, [makeCard("p4-s-5", "spades", "5")]),
        basePlayer(5, [
          makeCard("b-s-a", "spades", "A"),
          makeCard("b-s-7", "spades", "7"),
          makeCard("b-d-a", "diamonds", "A"),
          makeCard("b-d-k", "diamonds", "K"),
          makeCard("b-d-8", "diamonds", "8"),
          makeCard("b-h-q", "hearts", "Q"),
        ]),
      ];
    }

    /**
     * 作用：
     * 搭建“叫第二张 A 且已整理成 A + 找朋友牌 时，应先走 A”的测试场景。
     *
     * 为什么这样写：
     * 本轮用户重新明确了叫朋友常规节奏：
     * 如果这门里已经保成 A + 找朋友牌，应先兑现 A 稳住牌权，
     * 再用找朋友牌去把朋友叫出来，而不是先把找朋友牌摸掉。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入 playing 状态。
     *
     * 注意：
     * - 这里故意不给 K，只验证最基础的 A -> 找朋友牌 节奏。
     * - 朋友目标仍是“第二张红桃 A”。
     */
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
          makeCard("banker-h-3-return", "hearts", "3"),
          makeCard("banker-c-k-1", "clubs", "K"),
          makeCard("banker-c-k-2", "clubs", "K"),
          makeCard("banker-s-j", "spades", "J"),
        ]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 2 });
      state.friendTarget.matchesSeen = 0;
    }

    /**
     * 作用：
     * 搭建“已经先出过 A 后，应继续出 K 再找朋友”的测试场景。
     *
     * 为什么这样写：
     * 用户补充的常规节奏不是只会 A -> 小牌，
     * 而是当手里还有过桥高张时，应继续走 A -> K -> 找朋友牌。
     * 这里直接把 matchesSeen 置到 1，模拟打家前面已经先兑现过自己的那张 A。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入 playing 状态。
     *
     * 注意：
     * - 当前目标仍是“第二张红桃 A”。
     * - 手牌里只留 K + 3，验证第二拍会优先走 K 而不是直接摸 3。
     */
    function setupBankerFriendBridgeLeadScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.phase = "playing";
      state.bankerId = 5;
      state.currentTurnId = 5;
      state.leaderId = 5;
      state.trickNumber = 2;
      state.trumpSuit = "clubs";
      state.players = [
        basePlayer(1, [makeCard("p1-s-7-bridge", "spades", "7")], true),
        basePlayer(2, [makeCard("p2-d-8-bridge", "diamonds", "8")]),
        basePlayer(3, [makeCard("p3-s-9-bridge", "spades", "9")]),
        basePlayer(4, [makeCard("p4-c-6-bridge", "clubs", "6")]),
        basePlayer(5, [
          makeCard("banker-h-k-bridge", "hearts", "K"),
          makeCard("banker-h-3-bridge", "hearts", "3"),
          makeCard("banker-c-k-1-bridge", "clubs", "K"),
          makeCard("banker-c-k-2-bridge", "clubs", "K"),
          makeCard("banker-s-j-bridge", "spades", "J"),
        ]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 2 });
      state.friendTarget.matchesSeen = 1;
    }

    /**
     * 作用：
     * 搭建“打家持有 AA10 时，应先用 10 递给第三张 A 接手”的测试场景。
     *
     * 为什么这样写：
     * 这轮修复针对的是固定复盘里的错误路线：
     * 打家如果已经握有两张目标 A，再先出 AA 会直接把朋友叫死；
     * 更合理的节奏应是先用 10 找朋友，让第三张 A 自然上手。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入 playing 状态。
     *
     * 注意：
     * - 目标牌仍是“第三张红桃 A”。
     * - 红桃 10 是预期的接手张，这手不应再先走 AA。
     */
    function setupBankerThirdAceTakeoverLeadScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.phase = "playing";
      state.bankerId = 5;
      state.currentTurnId = 5;
      state.leaderId = 5;
      state.trickNumber = 1;
      state.trumpSuit = "clubs";
      state.players = [
        basePlayer(1, [makeCard("p1-s-7-aa", "spades", "7")], true),
        basePlayer(2, [makeCard("p2-d-8-aa", "diamonds", "8")]),
        basePlayer(3, [makeCard("p3-s-9-aa", "spades", "9")]),
        basePlayer(4, [makeCard("p4-c-6-aa", "clubs", "6")]),
        basePlayer(5, [
          makeCard("banker-h-a-1-aa", "hearts", "A"),
          makeCard("banker-h-a-2-aa", "hearts", "A"),
          makeCard("banker-h-10-aa", "hearts", "10"),
          makeCard("banker-c-k-1-aa", "clubs", "K"),
          makeCard("banker-s-j-aa", "spades", "J"),
        ]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 3 });
      state.friendTarget.matchesSeen = 0;
    }

    /**
     * 作用：
     * 搭建“A 级时不应再叫 A，而应改走第一张 K 的测试场景。
     *
     * 为什么这样写：
     * 用户补充：
     * A 级时 A 已经转成级牌主，不应该再把副牌 A 当朋友牌；
     * 此时副牌最大应改为 K，如果自己没有 K 但有 Q + 小牌，则应先出 Q 再找朋友。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入 callingFriend 状态。
     *
     * 注意：
     * - 这里故意不给打家方块 K，验证它会改叫“第一张方块 K”。
     * - 方块 Q + 5 是预期的过桥高张与找朋友牌结构。
     */
    function setupALevelKingFriendCallScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.phase = "callingFriend";
      state.bankerId = 5;
      state.currentTurnId = 5;
      state.leaderId = 5;
      state.trumpSuit = "clubs";
      state.levelRank = "A";
      state.playerLevels = { 1: "A", 2: "A", 3: "A", 4: "A", 5: "A" };
      state.players = [
        basePlayer(1, [makeCard("p1-c-6-a-level", "clubs", "6")], true),
        basePlayer(2, [makeCard("p2-h-8-a-level", "hearts", "8")]),
        basePlayer(3, [makeCard("p3-d-k-a-level", "diamonds", "K")]),
        basePlayer(4, [makeCard("p4-s-5-a-level", "spades", "5")]),
        basePlayer(5, [
          makeCard("b-d-q-a-level", "diamonds", "Q"),
          makeCard("b-d-5-a-level", "diamonds", "5"),
          makeCard("b-s-q-a-level", "spades", "Q"),
          makeCard("b-s-j-a-level", "spades", "J"),
          makeCard("b-h-9-a-level", "hearts", "9"),
          makeCard("b-h-7-a-level", "hearts", "7"),
          makeCard("b-c-k-a-level", "clubs", "K"),
        ]),
      ];
    }

    /**
     * 作用：
     * 搭建“A 级第一张 K 路线下，应先出 Q 再找朋友”的测试场景。
     *
     * 为什么这样写：
     * 这条场景直接复用上面的叫朋友结构，但切到出牌阶段，
     * 验证 AI 会先走方块 Q，而不是直接摸方块 5。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入 playing 状态。
     *
     * 注意：
     * - 朋友牌固定为“第一张方块 K”。
     * - 这里只验证 Q -> 找朋友牌 的第二高张节奏。
     */
    function setupALevelKingBridgeLeadScenario(difficulty) {
      setupALevelKingFriendCallScenario(difficulty);
      state.phase = "playing";
      setFriendTarget({ suit: "diamonds", rank: "K", occurrence: 1 });
      state.currentTurnId = 5;
      state.leaderId = 5;
      state.trickNumber = 1;
    }

    /**
     * 作用：
     * 搭建“副牌都过脏时，应改叫第一张大王”的测试场景。
     *
     * 为什么这样写：
     * 用户补充：
     * 如果每一门副牌都有拖拉机、刻子或太多分，不应再硬拆副牌找朋友；
     * 这时更合理的兜底是改叫第一张大王。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入 callingFriend 状态。
     *
     * 注意：
     * - 打家自己不持有大王，验证的是“第一张大王”而不是“第二张大王”。
     * - 三门副牌都故意做成高分 / 成对结构，避免干净短门压过 joker fallback。
     */
    function setupJokerFriendFallbackScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.phase = "callingFriend";
      state.bankerId = 5;
      state.currentTurnId = 5;
      state.leaderId = 5;
      state.trumpSuit = "clubs";
      state.players = [
        basePlayer(1, [makeCard("p1-c-6-joker-fallback", "clubs", "6")], true),
        basePlayer(2, [makeCard("p2-h-8-joker-fallback", "hearts", "8")]),
        basePlayer(3, [makeCard("p3-d-9-joker-fallback", "diamonds", "9")]),
        basePlayer(4, [makeCard("p4-s-5-joker-fallback", "spades", "5")]),
        basePlayer(5, [
          makeCard("b-s-10a-joker-fallback", "spades", "10"),
          makeCard("b-s-10b-joker-fallback", "spades", "10"),
          makeCard("b-s-j-joker-fallback", "spades", "J"),
          makeCard("b-s-5-joker-fallback", "spades", "5"),
          makeCard("b-h-k1-joker-fallback", "hearts", "K"),
          makeCard("b-h-k2-joker-fallback", "hearts", "K"),
          makeCard("b-h-10-joker-fallback", "hearts", "10"),
          makeCard("b-d-a1-joker-fallback", "diamonds", "A"),
          makeCard("b-d-a2-joker-fallback", "diamonds", "A"),
          makeCard("b-d-10-joker-fallback", "diamonds", "10"),
          makeCard("b-c-7-joker-fallback", "clubs", "7"),
        ]),
      ];
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

    /**
     * 作用：
     * 搭建“短门 K 加小牌应压过长门 A”的测试场景。
     *
     * 为什么这样写：
     * 用户这轮把 beginner 的常规找朋友路线进一步收口成：
     * 尽量把某门整理成 “A / K + 找友小牌” 的可执行短门。
     * 因此这里不只验证中级 / 高级，也要锁住 beginner：
     * 当一门是“长门第二张 A”，另一门是“短门第一张 A 且自带 K + 小牌过桥”时，
     * 三个难度都应把后者视为更像人类常规打法的路线。
     *
     * 输入：
     * @param {string} difficulty - 需要验证的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接写入 callingFriend 状态。
     *
     * 注意：
     * - 黑桃故意做成 “A + 多张跟张” 的长门，旧逻辑更容易误选它。
     * - 方片只有 “K + 5” 两张，预期会改成叫“第一张方片 A”。
     */
    function setupShortSuitFriendCallScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.phase = "callingFriend";
      state.bankerId = 5;
      state.currentTurnId = 5;
      state.leaderId = 5;
      state.trumpSuit = "clubs";
      state.players = [
        basePlayer(1, [makeCard("p1-h-8-short-friend", "hearts", "8")], true),
        basePlayer(2, [makeCard("p2-c-9-short-friend", "clubs", "9")]),
        basePlayer(3, [makeCard("p3-s-k-short-friend", "spades", "K")]),
        basePlayer(4, [makeCard("p4-d-a-short-friend", "diamonds", "A")]),
        basePlayer(5, [
          makeCard("b-s-a-short-friend", "spades", "A"),
          makeCard("b-s-10a-short-friend", "spades", "10"),
          makeCard("b-s-10b-short-friend", "spades", "10"),
          makeCard("b-s-j-short-friend", "spades", "J"),
          makeCard("b-s-7-short-friend", "spades", "7"),
          makeCard("b-d-k-short-friend", "diamonds", "K"),
          makeCard("b-d-5-short-friend", "diamonds", "5"),
          makeCard("b-h-9-short-friend", "hearts", "9"),
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

    /**
     * 作用：
     * 搭建“闲家先用 A 开路保控制，再为后续递牌留小牌”的测试场景。
     *
     * 为什么这样写：
     * 用户新增了一条 beginner heuristic：
     * 当闲家已经拿到首发、同伴已知、且公开信息还没有显示这门任何人绝门时，
     * 不应直接把小牌递出去，而应先把这门 A 打出来，先稳一手控制并给同伴传递高张信号。
     *
     * 输入：
     * @param {string} difficulty - 需要验证的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接写入首发测试状态。
     *
     * 注意：
     * - 玩家 4 持有“红桃 A + 红桃 3”，验证的是“先出 A，再留 3 给后续递牌”。
     * - 敌我双方都没有公开红桃绝门，确保不会提前落到旧的 handoff / pressure_void 逻辑。
     */
    function setupDefenderHighControlSignalScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.players = [
        basePlayer(1, [makeCard("b-s-9-signal", "spades", "9")], true),
        basePlayer(2, [makeCard("p2-d-a-signal", "diamonds", "A")]),
        basePlayer(3, [makeCard("p3-c-8-signal", "clubs", "8")]),
        basePlayer(4, [
          makeCard("p4-h-a-signal", "hearts", "A"),
          makeCard("p4-h-3-signal", "hearts", "3"),
          makeCard("p4-c-6-signal", "clubs", "6"),
        ]),
        basePlayer(5, [makeCard("p5-s-k-signal", "spades", "K")]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 3;
      state.hiddenFriendId = 3;
      state.currentTurnId = 4;
      state.leaderId = 4;
    }

    /**
     * 作用：
     * 搭建“朋友已站队后，打家在没有明确主控资源时先用 A 定门”的测试场景。
     *
     * 为什么这样写：
     * 用户补充了一个更细的协同判断：
     * 如果打家已经拿到首发，但手里没有足够稳的主控资源，那么不应机械地出低张保守牌，
     * 而应趁这次出牌权先把副牌 A 打出去，给同伴传递“这门高张正在被我方兑现”的信号，
     * 再把同门小牌留作后续递牌口。
     *
     * 输入：
     * @param {string} difficulty - 需要验证的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接写入首发测试状态。
     *
     * 注意：
     * - 打家刻意不带主控结构，验证的是“没有明确清主线时会先定门”。
     * - 所有人公开信息里都还没出现红桃断门，确保这手 A 真的是信号牌而不是断门施压。
     */
    function setupBankerHighControlSignalScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.trickNumber = 4;
      state.currentTurnId = 1;
      state.leaderId = 1;
      state.players = [
        basePlayer(1, [
          makeCard("b-h-a-signal", "hearts", "A"),
          makeCard("b-h-3-signal", "hearts", "3"),
          makeCard("b-c-6-signal", "clubs", "6"),
        ], true),
        basePlayer(2, [makeCard("p2-s-9-signal", "spades", "9")]),
        basePlayer(3, [makeCard("p3-d-8-signal", "diamonds", "8")]),
        basePlayer(4, [makeCard("p4-c-7-signal", "clubs", "7")]),
        basePlayer(5, [makeCard("p5-h-8-signal", "hearts", "8")]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 3;
      state.friendTarget.revealedTrickNumber = 2;
      state.hiddenFriendId = 3;
    }

    /**
     * 作用：
     * 搭建“同伴已经公开绝门后，打家应回退成直接递牌”的测试场景。
     *
     * 为什么这样写：
     * “先用 A 定门”只适用于所有人还公开有这门牌的窗口。
     * 一旦同伴已经明确绝门，就不需要再额外打信号，而应直接把同门小牌递过去。
     *
     * 输入：
     * @param {string} difficulty - 需要验证的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接写入首发测试状态。
     *
     * 注意：
     * - 这里沿用上一组手牌，只额外把同伴标成红桃绝门。
     * - 预期会从“红桃 A 定门”切回“红桃 3 递牌”。
     */
    function setupBankerSignalFallsBackToHandoffScenario(difficulty) {
      setupBankerHighControlSignalScenario(difficulty);
      state.exposedSuitVoid[3].hearts = true;
    }

    /**
     * 作用：
     * 搭建“同伴已经公开绝门时，不应继续走高张开路，而应回到递牌”的测试场景。
     *
     * 为什么这样写：
     * 新 heuristic 只覆盖“大家都还没公开绝门”的控制窗口；
     * 一旦同伴已经明确绝门，就应该回到旧的 handoff 思路，优先把小牌递过去。
     *
     * 输入：
     * @param {string} difficulty - 需要验证的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接写入首发测试状态。
     *
     * 注意：
     * - 这里沿用上一组手牌，只额外把玩家 2 标成红桃绝门。
     * - 预期是高张开路 helper 失效，首发改成红桃 3。
     */
    function setupDefenderSignalFallsBackToHandoffScenario(difficulty) {
      setupDefenderHighControlSignalScenario(difficulty);
      state.exposedSuitVoid[2].hearts = true;
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

    /**
     * 作用：
     * 搭建“同一墩里朋友刚亮出朋友牌后，后位闲家不应再跟出同一张朋友牌”的测试场景。
     *
     * 为什么这样写：
     * 用户给出的真实复盘问题是：
     * 玩家 4 已经用 "♦A" 完成站队，玩家 5 手里虽然也有 "♦A"，但这张同点数后出并不能赢墩，
     * 继续跟出只是在白白浪费一张高价值控制牌。这里固定一手最小复现场景，
     * 验证中级 / 高级都会把这类“亮友后 echo 同一张 target”的动作改成垫同门低张。
     *
     * 输入：
     * @param {string} difficulty - 需要验证的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接写入跟牌测试状态。
     *
     * 注意：
     * - 这里是无主局，"♦A" 只是普通副牌大张，不存在“主牌后出还能反超”的例外。
     * - 玩家 5 仍有 "♦6" 可合法跟牌，预期会保住 "♦A"。
     */
    function setupResolvedFriendRevealEchoAvoidanceScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "notrump";
      state.bankerId = 2;
      state.trickNumber = 1;
      state.players = [
        basePlayer(1, [makeCard("echo-p1-c-7", "clubs", "7")], true),
        basePlayer(2, [makeCard("echo-p2-s-8", "spades", "8")]),
        basePlayer(3, [makeCard("echo-p3-c-9", "clubs", "9")]),
        basePlayer(4, [makeCard("echo-p4-h-8", "hearts", "8")]),
        basePlayer(5, [
          makeCard("echo-p5-d-a", "diamonds", "A"),
          makeCard("echo-p5-d-6", "diamonds", "6"),
          makeCard("echo-p5-s-q", "spades", "Q"),
        ]),
      ];
      setFriendTarget({ suit: "diamonds", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 4;
      state.friendTarget.revealedTrickNumber = 1;
      state.friendTarget.matchesSeen = 1;
      state.hiddenFriendId = 4;
      state.currentTrick = [
        { playerId: 2, cards: [makeCard("echo-lead-d-5", "diamonds", "5")] },
        { playerId: 3, cards: [makeCard("echo-p3-d-9-play", "diamonds", "9")] },
        { playerId: 4, cards: [makeCard("echo-p4-d-a-play", "diamonds", "A")] },
      ];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 2;
      state.currentTurnId = 5;
    }

    /**
     * 作用：
     * 搭建“缺首门贴副时，应优先保住副牌对子而不是把它直接贴掉”的测试场景。
     *
     * 为什么这样写：
     * 用户补充了一个容易被误解的点：
     * 当自己没有首门、主上也没有成型可毙时，规则并不要求继续拿另一门对子来贴同型。
     * 这里固定成“对梅花 A、红桃为主、跟牌方没有梅花也没有主对”，验证 AI 会优先贴两张散副，
     * 而不是把手里仅有的一对副牌直接送出去。
     *
     * 输入：
     * @param {string} difficulty - 需要验证的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接写入跟牌状态，供 getLegalHintForPlayer(2) 使用。
     *
     * 注意：
     * - 玩家 2 没有梅花，也没有主牌，因此这里只验证“贴牌保结构”，不验证毙牌选择。
     * - 方块 6,6 是待保护的副牌对子；黑桃 3,4 是更应优先贴掉的两张散牌。
     */
    function setupOffSuitPairDiscardPreservationScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "hearts";
      state.players = [
        basePlayer(1, [
          makeCard("discard-p1-c-a-1", "clubs", "A"),
          makeCard("discard-p1-c-a-2", "clubs", "A"),
        ], true),
        basePlayer(2, [
          makeCard("discard-p2-d-6-1", "diamonds", "6"),
          makeCard("discard-p2-d-6-2", "diamonds", "6"),
          makeCard("discard-p2-s-3", "spades", "3"),
          makeCard("discard-p2-s-4", "spades", "4"),
        ]),
        basePlayer(3, [makeCard("discard-p3-h-9", "hearts", "9")]),
        basePlayer(4, [makeCard("discard-p4-d-8", "diamonds", "8")]),
        basePlayer(5, [makeCard("discard-p5-s-k", "spades", "K")]),
      ];
      state.currentTrick = [
        {
          playerId: 1,
          cards: [
            makeCard("discard-lead-c-a-1", "clubs", "A"),
            makeCard("discard-lead-c-a-2", "clubs", "A"),
          ],
        },
      ];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 1;
      state.currentTurnId = 2;
    }

    /**
     * 作用：
     * 搭建“打家已断首门且闲家正在拿分时，若仍有不拆高对的安全毙牌，就不应被贴牌短路拦住”的测试场景。
     *
     * 为什么这样写：
     * 真实复盘里暴露过一个共享跟牌短路问题：
     * 旧逻辑只要发现“某些可毙单张会拆掉高对”，就会直接退回贴小牌，
     * 却没有继续检查“我是否仍然握有不拆高对、而且能稳压的其它主牌”。
     * 这会让打家在闲家领先分牌时，把本来可以收回来的分直接放走。
     *
     * 输入：
     * @param {string} difficulty - 需要验证的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接写入当前测试状态，供 getLegalHintForPlayer(4) 使用。
     *
     * 注意：
     * - 玩家 4 是打家，玩家 1 已明友，因此当前属于“打家侧需要保这墩分”的窗口。
     * - 玩家 4 既有“会拆高对的危险毙牌”，也有“不会拆高对的安全毙牌”；回归重点是后者不能被旧短路吞掉。
     */
    function setupBankerPointProtectRuffScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "clubs";
      state.declaration = { suit: "clubs", rank: "2", count: 2, playerId: 4 };
      state.bankerId = 4;
      state.hiddenFriendId = 1;
      state.trickNumber = 6;
      state.currentTurnId = 4;
      state.leaderId = 1;
      state.friendTarget = {
        suit: "spades",
        rank: "A",
        occurrence: 2,
        revealed: true,
        revealedBy: 1,
        matchesSeen: 2,
        failed: false,
      };
      state.exposedSuitVoid[4].spades = true;
      state.players = [
        basePlayer(1, [makeCard("point-protect-p1-s-4", "spades", "4")], true),
        basePlayer(2, [makeCard("point-protect-p2-s-5", "spades", "5")]),
        basePlayer(3, [makeCard("point-protect-p3-s-5", "spades", "5")]),
        basePlayer(4, [
          makeCard("point-protect-p4-h-6", "hearts", "6"),
          makeCard("point-protect-p4-c-j", "clubs", "J"),
          makeCard("point-protect-p4-d-5", "diamonds", "5"),
          makeCard("point-protect-p4-d-10", "diamonds", "10"),
          makeCard("point-protect-p4-c-2-a", "clubs", "2"),
          makeCard("point-protect-p4-c-2-b", "clubs", "2"),
          makeCard("point-protect-p4-h-a-a", "hearts", "A"),
          makeCard("point-protect-p4-h-a-b", "hearts", "A"),
          makeCard("point-protect-p4-h-4-a", "hearts", "4"),
          makeCard("point-protect-p4-h-4-b", "hearts", "4"),
          makeCard("point-protect-p4-c-a-a", "clubs", "A"),
          makeCard("point-protect-p4-c-a-b", "clubs", "A"),
          makeCard("point-protect-p4-rj-a", "joker", "RJ"),
          makeCard("point-protect-p4-rj-b", "joker", "RJ"),
          makeCard("point-protect-p4-bj", "joker", "BJ"),
          makeCard("point-protect-p4-d-2", "diamonds", "2"),
          makeCard("point-protect-p4-s-2", "spades", "2"),
          makeCard("point-protect-p4-c-3", "clubs", "3"),
          makeCard("point-protect-p4-c-4", "clubs", "4"),
          makeCard("point-protect-p4-h-2", "hearts", "2"),
          makeCard("point-protect-p4-h-8", "hearts", "8"),
          makeCard("point-protect-p4-c-10", "clubs", "10"),
          makeCard("point-protect-p4-h-5", "hearts", "5"),
          makeCard("point-protect-p4-d-a", "diamonds", "A"),
        ]),
        basePlayer(5, [
          makeCard("point-protect-p5-d-7", "diamonds", "7"),
          makeCard("point-protect-p5-c-2", "clubs", "2"),
          makeCard("point-protect-p5-h-2-a", "hearts", "2"),
          makeCard("point-protect-p5-h-2-b", "hearts", "2"),
          makeCard("point-protect-p5-c-7-a", "clubs", "7"),
          makeCard("point-protect-p5-c-7-b", "clubs", "7"),
          makeCard("point-protect-p5-c-3", "clubs", "3"),
          makeCard("point-protect-p5-c-8", "clubs", "8"),
          makeCard("point-protect-p5-bj", "joker", "BJ"),
        ]),
      ];
      state.currentTrick = [
        { playerId: 1, cards: [makeCard("point-protect-live-p1-s-4", "spades", "4")] },
        { playerId: 2, cards: [makeCard("point-protect-live-p2-s-5", "spades", "5")] },
        { playerId: 3, cards: [makeCard("point-protect-live-p3-s-5", "spades", "5")] },
      ];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
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

    /**
     * 作用：
     * 搭建“别人出对时，自己有同门刻子和杂牌，不应为了跟对去拆刻子”的测试场景。
     *
     * 为什么这样写：
     * 用户明确要求把这条 beginner heuristic 锁死：
     * 当同门里已经是“刻子 + 两张杂牌”时，AI 完全可以用两张杂牌合法跟牌，
     * 不应因为“拆成对子还能压住当前”就优先拆掉刻子。
     *
     * 输入：
     * @param {string} difficulty - 当前要验证的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接改写共享 state，供后续读取合法候选和提示。
     *
     * 注意：
     * - 这里只保护“正好三张”的同门刻子，避免把四张真对子资源混进断言。
     * - 场景里让前位已经用更大的对子暂时领先，确保旧逻辑真的会诱发“拆刻子去抢这一手”。
     */
    function setupPairFollowTriplePreserveScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "clubs";
      state.friendTarget = null;
      state.playHistory = [];
      state.players = [
        basePlayer(1, [makeCard("pair-triple-p1-h-9-1", "hearts", "9"), makeCard("pair-triple-p1-h-9-2", "hearts", "9")], true),
        basePlayer(2, [makeCard("pair-triple-p2-h-10-1", "hearts", "10"), makeCard("pair-triple-p2-h-10-2", "hearts", "10")]),
        basePlayer(3, [
          makeCard("pair-triple-p3-h-k-1", "hearts", "K"),
          makeCard("pair-triple-p3-h-k-2", "hearts", "K"),
          makeCard("pair-triple-p3-h-k-3", "hearts", "K"),
          makeCard("pair-triple-p3-h-3", "hearts", "3"),
          makeCard("pair-triple-p3-h-4", "hearts", "4"),
        ]),
        basePlayer(4, [makeCard("pair-triple-p4-s-8", "spades", "8")]),
        basePlayer(5, [makeCard("pair-triple-p5-d-7", "diamonds", "7")]),
      ];
      state.currentTurnId = 3;
      state.leaderId = 1;
      state.currentTrick = [
        { playerId: 1, cards: [makeCard("pair-triple-lead-h-9-1", "hearts", "9"), makeCard("pair-triple-lead-h-9-2", "hearts", "9")] },
        { playerId: 2, cards: [makeCard("pair-triple-beat-h-a-1", "hearts", "A"), makeCard("pair-triple-beat-h-a-2", "hearts", "A")] },
      ];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
    }

    /**
     * 作用：
     * 搭建“拆刻子成对确实能抢回牌权，且拆完还有后续牌可出”的正向例外场景。
     *
     * 为什么这样写：
     * 用户新增口径不是“永远不拆刻子”，而是“除非拆这手能大一手、拿到出牌权，而且后面还有牌可走”。
     * 这条回归专门锁住这个很窄的例外，避免后续又把它和默认的“保刻子”规则混在一起。
     *
     * 输入：
     * @param {string} difficulty - 当前要验证的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接改写共享 state，供后续读取合法候选和提示。
     *
     * 注意：
     * - 场景里保留同门两张杂牌，确保 AI 不是“被迫拆刻子”，而是在有别的合法跟牌时主动抢权。
     * - 拆完后仍会留下至少一张非刻子牌，满足“拿到牌权后还有别的牌可出”的产品口径。
     */
    function setupPairFollowTripleTakeoverScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "clubs";
      state.friendTarget = null;
      state.playHistory = [];
      state.players = [
        basePlayer(1, [makeCard("pair-takeover-p1-h-9-1", "hearts", "9"), makeCard("pair-takeover-p1-h-9-2", "hearts", "9")], true),
        basePlayer(2, [makeCard("pair-takeover-p2-h-10-1", "hearts", "10"), makeCard("pair-takeover-p2-h-10-2", "hearts", "10")]),
        basePlayer(3, [
          makeCard("pair-takeover-p3-h-k-1", "hearts", "K"),
          makeCard("pair-takeover-p3-h-k-2", "hearts", "K"),
          makeCard("pair-takeover-p3-h-k-3", "hearts", "K"),
          makeCard("pair-takeover-p3-h-3", "hearts", "3"),
          makeCard("pair-takeover-p3-h-4", "hearts", "4"),
        ]),
        basePlayer(4, [makeCard("pair-takeover-p4-s-8", "spades", "8")]),
        basePlayer(5, [makeCard("pair-takeover-p5-d-7", "diamonds", "7")]),
      ];
      state.currentTurnId = 3;
      state.leaderId = 1;
      state.currentTrick = [
        { playerId: 1, cards: [makeCard("pair-takeover-lead-h-9-1", "hearts", "9"), makeCard("pair-takeover-lead-h-9-2", "hearts", "9")] },
        { playerId: 2, cards: [makeCard("pair-takeover-beat-h-10-1", "hearts", "10"), makeCard("pair-takeover-beat-h-10-2", "hearts", "10")] },
      ];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
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

    /**
     * 作用：
     * 搭建“朋友刚亮后，打家应立刻切到清主控局”的测试场景。
     *
     * 为什么这样写：
     * 这轮要验证新 heuristic 会在朋友刚亮后的短窗口里优先清主，
     * 而不是继续拿副牌去试探或送节奏。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入当前测试状态。
     *
     * 注意：
     * - revealedTrickNumber=2，当前来到第 4 轮，仍在控局窗口内。
     * - 打家手里同时有主对子和副牌 A，用来确认它会优先走主。
     */
    function setupRevealedFriendControlModeScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "spades";
      state.trickNumber = 4;
      state.currentTurnId = 1;
      state.leaderId = 1;
      state.players = [
        basePlayer(1, [
          makeCard("b-s-k-1", "spades", "K"),
          makeCard("b-s-k-2", "spades", "K"),
          makeCard("b-s-7-1", "spades", "7"),
          makeCard("b-s-7-2", "spades", "7"),
          makeCard("b-c-a", "clubs", "A"),
          makeCard("b-h-3", "hearts", "3"),
        ], true),
        basePlayer(2, [makeCard("p2-d-9", "diamonds", "9")]),
        basePlayer(3, [makeCard("p3-c-8", "clubs", "8")]),
        basePlayer(4, [makeCard("p4-h-9", "hearts", "9")]),
        basePlayer(5, [makeCard("p5-d-8", "diamonds", "8")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 1 });
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = 3;
      state.friendTarget.revealedTrickNumber = 2;
      state.hiddenFriendId = 3;
    }

    /**
     * 作用：
     * 搭建“无主打家前几轮应先打控制线，不急着探朋友门”的测试场景。
     *
     * 为什么这样写：
     * 数据里无主打家经常被 friend-setup lead 抢先，先把朋友牌 A 打出去；
     * 这里用双王和高主资源验证，新规则会先清控制而不是先摸朋友门。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入当前测试状态。
     *
     * 注意：
     * - 朋友目标是第二张红桃 A，旧逻辑会直接先打红桃 A。
     * - 现在应优先打双王，确认“少探朋友门”已经生效。
     */
    function setupNoTrumpProbeDeferralScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "notrump";
      state.trickNumber = 2;
      state.currentTurnId = 1;
      state.leaderId = 1;
      state.players = [
        basePlayer(1, [
          makeCard("b-h-a", "hearts", "A"),
          makeCard("b-h-3", "hearts", "3"),
          makeCard("b-bj-1", "joker", "BJ"),
          makeCard("b-bj-2", "joker", "BJ"),
          makeCard("b-c-k", "clubs", "K"),
          makeCard("b-s-4", "spades", "4"),
        ], true),
        basePlayer(2, [makeCard("p2-d-8", "diamonds", "8")]),
        basePlayer(3, [makeCard("p3-c-8", "clubs", "8")]),
        basePlayer(4, [makeCard("p4-h-8", "hearts", "8")]),
        basePlayer(5, [makeCard("p5-d-7", "diamonds", "7")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 2 });
      state.friendTarget.matchesSeen = 0;
    }

    /**
     * 作用：
     * 搭建“无主未亮友时，打家仍握有短主硬控，不应先送低副牌”的测试场景。
     *
     * 为什么这样写：
     * 这次复盘暴露出的关键问题，不是打家完全没有主控，而是“主张数变短后被误判成已经不该继续控”。
     * 这里固定成“红王 + 一对级牌”对抗“低副对子 / 低副单张”的最小样本，
     * 验证中级会继续走主控，而不是把牌权过早让给闲家长门。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入当前测试状态。
     *
     * 注意：
     * - 场景限定为无主、朋友未站队、前中盘，避免把这条回归误扩成残局通则。
     * - 朋友目标仍是红桃 A，但打家当前并没有正式的“A / K -> 小牌”前置路线，确保测试聚焦在“短主续控”。
     */
    function setupNoTrumpShortControlReserveScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "notrump";
      state.trickNumber = 4;
      state.currentTurnId = 1;
      state.leaderId = 1;
      state.bankerId = 1;
      state.players = [
        basePlayer(1, [
          makeCard("b-rj-reserve", "joker", "RJ"),
          makeCard("b-s-2-reserve-1", "spades", "2"),
          makeCard("b-s-2-reserve-2", "spades", "2"),
          makeCard("b-s-7-reserve-1", "spades", "7"),
          makeCard("b-s-7-reserve-2", "spades", "7"),
          makeCard("b-c-k-reserve", "clubs", "K"),
          makeCard("b-d-4-reserve", "diamonds", "4"),
        ], true),
        basePlayer(2, [makeCard("p2-c-8-reserve", "clubs", "8")]),
        basePlayer(3, [makeCard("p3-d-8-reserve", "diamonds", "8")]),
        basePlayer(4, [makeCard("p4-h-8-reserve", "hearts", "8")]),
        basePlayer(5, [makeCard("p5-c-7-reserve", "clubs", "7")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 1 });
      state.friendTarget.matchesSeen = 0;
    }

    /**
     * 作用：
     * 搭建“无主且第三张 A 已被叫死时，打家不应再被 no-trump defer 拦住”的测试场景。
     *
     * 为什么这样写：
     * 固定复盘里，打家已经握有 AA10，外面只剩唯一一张目标 A；
     * 这时继续按普通无主逻辑先清王，会把“用 10 递给朋友用第三张 A 上手”的窗口错过。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入当前测试状态。
     *
     * 注意：
     * - 这里故意保留双黑桃小王，验证“无主先清控”不会压过“第三张 A 已叫死”的接手路线。
     * - 目标仍是第三张红桃 A；预期首发必须是红桃 10。
     */
    function setupNoTrumpCalledDeadTakeoverScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "notrump";
      state.trickNumber = 1;
      state.currentTurnId = 1;
      state.leaderId = 1;
      state.players = [
        basePlayer(1, [
          makeCard("b-h-a-dead-1", "hearts", "A"),
          makeCard("b-h-a-dead-2", "hearts", "A"),
          makeCard("b-h-10-dead", "hearts", "10"),
          makeCard("b-bj-dead-1", "joker", "BJ"),
          makeCard("b-bj-dead-2", "joker", "BJ"),
          makeCard("b-s-4-dead", "spades", "4"),
        ], true),
        basePlayer(2, [makeCard("p2-d-8-dead", "diamonds", "8")]),
        basePlayer(3, [makeCard("p3-c-8-dead", "clubs", "8")]),
        basePlayer(4, [makeCard("p4-h-8-dead", "hearts", "8")]),
        basePlayer(5, [makeCard("p5-d-7-dead", "diamonds", "7")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 3 });
      state.friendTarget.matchesSeen = 0;
    }

    /**
     * 作用：
     * 搭建“无主且叫第三张大王时，打家应先把自持两张大王控出来”的测试场景。
     *
     * 为什么这样写：
     * 用户给出的固定复盘里，打家已经拿着前两张大王，却在高级搜索里被一手黑桃刻子带偏，
     * 没有先把确定的王控兑现出来，结果白白让外面先抢回牌权。
     * 这里固定一手最小牌型，验证首发会先打双大王，而不是先甩副牌结构。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入当前测试状态。
     *
     * 注意：
     * - 规则口径不变，仍按公开外部张次亮友；这里修的是打家自己的出牌时机。
     * - 牌里故意保留黑桃刻子，避免回归只在“没有诱惑副牌”时才成立。
     */
    function setupNoTrumpThirdJokerControlLeadScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "notrump";
      state.trickNumber = 1;
      state.currentTurnId = 1;
      state.leaderId = 1;
      state.players = [
        basePlayer(1, [
          makeCard("b-rj-1-third-joker", "joker", "RJ"),
          makeCard("b-rj-2-third-joker", "joker", "RJ"),
          makeCard("b-s-5a-third-joker", "spades", "5"),
          makeCard("b-s-5b-third-joker", "spades", "5"),
          makeCard("b-s-5c-third-joker", "spades", "5"),
          makeCard("b-c-2-third-joker", "clubs", "2"),
          makeCard("b-h-9-third-joker", "hearts", "9"),
        ], true),
        basePlayer(2, [makeCard("p2-d-8-third-joker", "diamonds", "8")]),
        basePlayer(3, [makeCard("p3-c-8-third-joker", "clubs", "8")]),
        basePlayer(4, [makeCard("p4-h-8-third-joker", "hearts", "8")]),
        basePlayer(5, [makeCard("p5-d-7-third-joker", "diamonds", "7")]),
      ];
      setFriendTarget({ suit: "joker", rank: "RJ", occurrence: 3 });
      state.friendTarget.matchesSeen = 0;
    }

    /**
     * 作用：
     * 搭建“朋友到第 6 轮仍未亮，打家应切 solo fallback”的测试场景。
     *
     * 为什么这样写：
     * 这条 heuristic 要验证打家不会在晚亮友局面继续死摸目标门，
     * 而是先转成更保守的主控 / 低风险首发。
     *
     * 输入：
     * @param {string} difficulty - 当前测试难度。
     *
     * 输出：
     * @returns {void} 直接写入当前测试状态。
     *
     * 注意：
     * - 朋友目标仍是第二张红桃 A，旧逻辑在这种牌里很容易先出红桃 A 或红桃 3。
     * - 现在应优先走梅花主对子，避免继续透支打家节奏。
     */
    function setupLateUnrevealedFriendFallbackScenario(difficulty) {
      resetCommonState();
      state.aiDifficulty = difficulty;
      state.trumpSuit = "clubs";
      state.trickNumber = 6;
      state.currentTurnId = 1;
      state.leaderId = 1;
      state.players = [
        basePlayer(1, [
          makeCard("b-h-a-late", "hearts", "A"),
          makeCard("b-h-3-late", "hearts", "3"),
          makeCard("b-c-7-1", "clubs", "7"),
          makeCard("b-c-7-2", "clubs", "7"),
          makeCard("b-d-4", "diamonds", "4"),
          makeCard("b-s-6", "spades", "6"),
        ], true),
        basePlayer(2, [makeCard("p2-d-8-late", "diamonds", "8")]),
        basePlayer(3, [makeCard("p3-c-9-late", "clubs", "9")]),
        basePlayer(4, [makeCard("p4-h-8-late", "hearts", "8")]),
        basePlayer(5, [makeCard("p5-d-7-late", "diamonds", "7")]),
      ];
      setFriendTarget({ suit: "hearts", rank: "A", occurrence: 2 });
      state.friendTarget.matchesSeen = 0;
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

    for (const difficulty of ["beginner", "intermediate", "advanced"]) {
      setupDelayRevealPreserveSuitStructureScenario(difficulty);
      assert(canAiRevealFriendNow(1) === true, difficulty + ": preserve-structure delay case should still be a stand opportunity");
      const hint = getLegalHintForPlayer(1);
      assert(hint.length === 1, difficulty + ": preserve-structure delay case should choose a single follow card");
      assert(hint[0].suit === "spades" && hint[0].rank === "5", difficulty + ": should keep 8899 intact and shed the side 5 while delaying stand");
      results.push(difficulty + " delay-reveal preserve structure ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupBankerFriendSetupLeadScenario(difficulty);
      const hint = chooseAiLeadPlay(5);
      assert(hint.length === 1, difficulty + ": banker friend-setup scenario should choose a single heuristic lead");
      assert(hint[0].suit === "hearts" && hint[0].rank === "A", difficulty + ": banker should cash the held hearts A before using the friend-search card");
      results.push(difficulty + " banker friend-setup A-first ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupBankerFriendBridgeLeadScenario(difficulty);
      const hint = chooseAiLeadPlay(5);
      assert(hint.length === 1, difficulty + ": banker friend-bridge scenario should choose a single heuristic lead");
      assert(hint[0].suit === "hearts" && hint[0].rank === "K", difficulty + ": banker should continue with the bridge K before using the friend-search card");
      results.push(difficulty + " banker friend-bridge lead ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupBankerThirdAceTakeoverLeadScenario(difficulty);
      const hint = chooseAiLeadPlay(5);
      assert(hint.length === 1, difficulty + ": third-A takeover scenario should choose a single search lead");
      assert(hint[0].suit === "hearts" && hint[0].rank === "10", difficulty + ": banker should lead hearts 10 to let the third A take over");
      results.push(difficulty + " banker third-A takeover lead ok");
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

    setupBeginnerShortestSideAceScenario();
    const beginnerShortestSideAce = chooseFriendTarget().target;
    assert(beginnerShortestSideAce.suit === "spades", "beginner: should prefer the shortest side suit when calling A");
    assert(beginnerShortestSideAce.rank === "A", "beginner: shortest-side heuristic should still call side-suit A");
    assert(beginnerShortestSideAce.occurrence === 2, "beginner: holding the first side-suit A should call the second copy");
    results.push("beginner shortest-side A target ok");

    setupAvoidKingWhileAceAliveScenario("beginner");
    const beginnerAvoidKingWhileAceAlive = chooseFriendTarget().target;
    results.push("beginner avoid-K-with-live-A baseline -> " + beginnerAvoidKingWhileAceAlive.suit + "-" + beginnerAvoidKingWhileAceAlive.rank);

    setupAvoidKingWhileAceAliveScenario("intermediate");
    const intermediateAvoidKingWhileAceAlive = chooseFriendTarget().target;
    assert(!(intermediateAvoidKingWhileAceAlive.suit === "hearts" && intermediateAvoidKingWhileAceAlive.rank === "K"), "intermediate: should not call hearts K while hearts A is still outside banker");
    results.push("intermediate avoid-K-with-live-A ok -> " + intermediateAvoidKingWhileAceAlive.suit + "-" + intermediateAvoidKingWhileAceAlive.rank);

    for (const difficulty of ["beginner", "intermediate", "advanced"]) {
      setupShortSuitFriendCallScenario(difficulty);
      const friendDecision = buildAiFriendTargetDecision(5, difficulty);
      assert(friendDecision.selectedEntry.target.suit === "diamonds", difficulty + ": should prefer the short diamonds route over long spades A");
      assert(friendDecision.selectedEntry.target.rank === "A", difficulty + ": short-suit cover should still keep A as the target rank");
      assert(friendDecision.selectedEntry.target.occurrence === 1, difficulty + ": should call the first diamonds A instead of the second spades A");
      assert(["short-suit-window", "short-suit-friend"].includes(friendDecision.selectedEntry.source), difficulty + ": short-suit route should stay on the explicit short-suit heuristic chain");
      results.push(difficulty + " short-suit friend call ok -> " + friendDecision.selectedEntry.label);
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupALevelKingFriendCallScenario(difficulty);
      const friendDecision = buildAiFriendTargetDecision(5, difficulty);
      assert(friendDecision.selectedEntry.target.suit === "diamonds", difficulty + ": A-level should prefer the short diamonds K route");
      assert(friendDecision.selectedEntry.target.rank === "K", difficulty + ": A-level should not call A after A becomes level trump");
      assert(friendDecision.selectedEntry.target.occurrence === 1, difficulty + ": without self-held K, A-level should call the first outside K");
      results.push(difficulty + " A-level king friend call ok -> " + friendDecision.selectedEntry.label);
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupALevelKingBridgeLeadScenario(difficulty);
      const hint = chooseAiLeadPlay(5);
      assert(hint.length === 1, difficulty + ": A-level king bridge scenario should choose a single heuristic lead");
      assert(hint[0].suit === "diamonds" && hint[0].rank === "Q", difficulty + ": A-level should lead Q before using the friend-search card on a first-K route");
      results.push(difficulty + " A-level king bridge lead ok");
    }

    for (const difficulty of ["intermediate"]) {
      setupJokerFriendFallbackScenario(difficulty);
      const friendDecision = buildAiFriendTargetDecision(5, difficulty);
      assert(friendDecision.selectedEntry.target.suit === "joker", difficulty + ": when every side suit is overloaded, should fall back to joker");
      assert(friendDecision.selectedEntry.target.rank === "RJ", difficulty + ": joker fallback should prefer the first red joker");
      results.push(difficulty + " joker friend fallback ok -> " + friendDecision.selectedEntry.label);
    }

    setupJokerFriendFallbackScenario("beginner");
    const beginnerJokerFallbackDecision = buildAiFriendTargetDecision(5, "beginner");
    assert(beginnerJokerFallbackDecision.selectedEntry.target.suit === "joker", "beginner: fully overloaded side suits should allow the strict joker fallback");
    assert(beginnerJokerFallbackDecision.selectedEntry.target.rank === "RJ", "beginner: strict joker fallback should still prefer the first red joker");
    results.push("beginner strict joker fallback ok -> " + beginnerJokerFallbackDecision.selectedEntry.label);

    for (const difficulty of ["beginner", "intermediate"]) {
      setupReturnToBankerScenario(difficulty);
      const returnLead = getLegalHintForPlayer(3);
      assert(returnLead.length === 1, difficulty + ": return scenario should choose a single lead");
      assert(returnLead[0].suit === "hearts" && returnLead[0].rank === "3", difficulty + ": should prefer low heart to hand off control back to banker");
      results.push(difficulty + " return-to-banker handoff ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupDefenderHighControlSignalScenario(difficulty);
      const highControlSignalLead = chooseAiLeadPlay(4);
      assert(highControlSignalLead.length === 1, difficulty + ": high-control signal scenario should choose a single lead");
      assert(highControlSignalLead[0].suit === "hearts" && highControlSignalLead[0].rank === "A", difficulty + ": should cash the side-suit A first when everyone is still publicly in-suit");
      results.push(difficulty + " defender high-control signal lead ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupBankerHighControlSignalScenario(difficulty);
      const bankerHighControlSignalLead = getLegalHintForPlayer(1);
      assert(bankerHighControlSignalLead.length === 1, difficulty + ": banker high-control signal scenario should choose a single lead");
      assert(bankerHighControlSignalLead[0].suit === "hearts" && bankerHighControlSignalLead[0].rank === "A", difficulty + ": banker should cash the side-suit A first when no clear trump-control line exists");
      results.push(difficulty + " banker high-control signal lead ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupDefenderSignalFallsBackToHandoffScenario(difficulty);
      const fallbackSignalLead = chooseAiLeadPlay(4);
      assert(fallbackSignalLead.length === 1, difficulty + ": signal fallback scenario should still choose a single lead");
      assert(fallbackSignalLead[0].suit === "hearts" && fallbackSignalLead[0].rank === "3", difficulty + ": should switch back to low-card handoff once ally is publicly void in that suit");
      results.push(difficulty + " defender signal fallback-to-handoff ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupBankerSignalFallsBackToHandoffScenario(difficulty);
      const bankerFallbackSignalLead = getLegalHintForPlayer(1);
      assert(bankerFallbackSignalLead.length === 1, difficulty + ": banker signal fallback scenario should still choose a single lead");
      assert(bankerFallbackSignalLead[0].suit === "hearts" && bankerFallbackSignalLead[0].rank === "3", difficulty + ": banker should switch back to low-card handoff once friend is publicly void in that suit");
      results.push(difficulty + " banker signal fallback-to-handoff ok");
    }

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

    setupSoftHandoffLeadScenario();
    const intermediateSoftHandoffLead = getLegalHintForPlayer(4);
    assert(intermediateSoftHandoffLead.length === 1, "intermediate: soft handoff scenario should choose a single lead");
    assert(intermediateSoftHandoffLead[0].suit === "hearts" && intermediateSoftHandoffLead[0].rank === "3", "intermediate: should use the publicly softened suit as a handoff lead");
    results.push("intermediate soft handoff lead ok");

    setupDefenderFollowSupportScenario("intermediate");
    const intermediateDefenderFollowSupport = getLegalHintForPlayer(4);
    assert(intermediateDefenderFollowSupport.length === 1, "intermediate: defender follow-support scenario should choose a single card");
    assert(intermediateDefenderFollowSupport[0].suit === "hearts" && intermediateDefenderFollowSupport[0].rank === "3", "intermediate: should not overtake tentative defender ally while following");
    results.push("intermediate defender-follow support ok");

    for (const difficulty of ["intermediate", "advanced"]) {
      setupResolvedFriendRevealEchoAvoidanceScenario(difficulty);
      const resolvedFriendEchoAvoidanceChoice = getLegalHintForPlayer(5);
      assert(resolvedFriendEchoAvoidanceChoice.length === 1, difficulty + ": resolved-friend echo-avoidance scenario should choose a single card");
      assert(
        resolvedFriendEchoAvoidanceChoice[0].suit === "diamonds" && resolvedFriendEchoAvoidanceChoice[0].rank === "6",
        difficulty + ": should keep the duplicate friend-target A and follow with the lower same-suit card after the reveal is already complete"
      );
      results.push(difficulty + " resolved-friend echo avoidance ok");
    }

    setupDefenderFollowBeatScenario("beginner");
    const beginnerDefenderFollowBeat = getLegalHintForPlayer(4);
    assert(beginnerDefenderFollowBeat.length === 1, "beginner: defender follow-beat scenario should choose a single card");
    results.push("beginner defender-follow beat baseline -> " + beginnerDefenderFollowBeat[0].suit + "-" + beginnerDefenderFollowBeat[0].rank);

    setupDefenderFollowBeatScenario("intermediate");
    const intermediateDefenderFollowBeat = getLegalHintForPlayer(4);
    assert(intermediateDefenderFollowBeat.length === 1, "intermediate: defender follow-beat scenario should choose a single card");
    assert(intermediateDefenderFollowBeat[0].suit === "hearts" && intermediateDefenderFollowBeat[0].rank === "A", "intermediate: should beat banker lead to reclaim control for defender side");
    results.push("intermediate defender-follow beat ok");

    for (const difficulty of ["beginner", "intermediate"]) {
      setupOffSuitPairDiscardPreservationScenario(difficulty);
      const legalDiscardChoices = getLegalSelectionsForPlayer(2);
      const protectedPair = [
        state.players[1].hand.find((card) => card.id === "discard-p2-d-6-1"),
        state.players[1].hand.find((card) => card.id === "discard-p2-d-6-2"),
      ];
      const preferredLooseDiscard = [
        state.players[1].hand.find((card) => card.id === "discard-p2-s-3"),
        state.players[1].hand.find((card) => card.id === "discard-p2-s-4"),
      ];
      assert(
        legalDiscardChoices.some((combo) => getComboKey(combo) === getComboKey(protectedPair)),
        difficulty + ": off-suit pair discard scenario should include the side-suit pair as a legal baseline candidate"
      );
      const discardChoice = getLegalHintForPlayer(2);
      assert(discardChoice.length === 2, difficulty + ": off-suit pair discard scenario should choose two follow cards");
      assert(
        getComboKey(discardChoice) === getComboKey(preferredLooseDiscard),
        difficulty + ": should keep the side-suit pair instead of pasting it away while void on the lead suit"
      );
      results.push(difficulty + " off-suit discard preserves side pair ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupBankerPointProtectRuffScenario(difficulty);
      const pointProtectChoice = getLegalHintForPlayer(4);
      assert(pointProtectChoice.length === 1, difficulty + ": banker point-protect ruff scenario should choose a single follow card");
      assert(
        doesSelectionBeatCurrent(4, pointProtectChoice),
        difficulty + ": banker point-protect ruff scenario should keep a safe beating option available instead of discarding"
      );
      assert(
        effectiveSuit(pointProtectChoice[0]) === "trump",
        difficulty + ": banker point-protect ruff scenario should use a trump to reclaim the current point trick"
      );
      results.push(difficulty + " banker point-protect ruff ok");
    }

    setupHandoffReceiveScenario();
    const intermediateHandoffReceive = getLegalHintForPlayer(4);
    assert(intermediateHandoffReceive.length === 1, "intermediate: handoff receive scenario should choose a single card");
    assert(intermediateHandoffReceive[0].suit === "joker" && intermediateHandoffReceive[0].rank === "RJ", "intermediate: should use the bigger trump to secure a teammate handoff against a possible overruff");
    results.push("intermediate handoff receive with big trump ok");

    setupTrumpClearControlScenario("beginner");
    const beginnerTrumpClearControl = getLegalHintForPlayer(3);
    assert(beginnerTrumpClearControl.length === 4, "beginner: trump-clear control scenario should choose a 4-card lead");
    results.push("beginner trump-clear control baseline -> " + beginnerTrumpClearControl.map((card) => card.suit + "-" + card.rank).join(","));

    setupTrumpClearControlScenario("intermediate");
    const intermediateTrumpClearControl = getLegalHintForPlayer(3);
    assert(intermediateTrumpClearControl.length >= 2, "intermediate: trump-clear control scenario should choose a structured trump lead");
    assert(intermediateTrumpClearControl.every((card) => card.suit === "spades"), "intermediate: should clear trump first when control is strong");
    results.push("intermediate trump-clear control ok");

    for (const difficulty of ["beginner", "intermediate"]) {
      setupRevealedFriendControlModeScenario(difficulty);
      const controlModeLead = chooseAiLeadPlay(1);
      assert(controlModeLead.length >= 2, difficulty + ": revealed-friend control mode should choose a structured trump lead");
      assert(controlModeLead.every((card) => card.suit === "spades"), difficulty + ": revealed-friend control mode should clear trump before side-suit probing");
      results.push(difficulty + " revealed-friend control mode ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupNoTrumpProbeDeferralScenario(difficulty);
      const deferredProbeLead = chooseAiLeadPlay(1);
      assert(deferredProbeLead.length >= 1, difficulty + ": no-trump probe deferral should still choose a legal lead");
      assert(!(deferredProbeLead[0].suit === "hearts"), difficulty + ": no-trump banker should not probe friend suit first when control line is strong");
      assert(deferredProbeLead.every((card) => card.suit === "joker"), difficulty + ": no-trump banker should clear joker control before probing friend suit");
      results.push(difficulty + " no-trump friend-probe deferral ok");
    }

    setupNoTrumpShortControlReserveScenario("intermediate");
    const intermediateShortControlReserveLead = getLegalHintForPlayer(1);
    assert(intermediateShortControlReserveLead.length >= 1, "intermediate: no-trump short-control reserve scenario should choose a legal lead");
    assert(intermediateShortControlReserveLead.every((card) => effectiveSuit(card) === "trump"), "intermediate: should keep pressing the short trump reserve instead of leading low side cards");
    results.push("intermediate no-trump short-control reserve ok");

    for (const difficulty of ["beginner", "intermediate"]) {
      setupNoTrumpCalledDeadTakeoverScenario(difficulty);
      const noTrumpCalledDeadLead = chooseAiLeadPlay(1);
      assert(noTrumpCalledDeadLead.length === 1, difficulty + ": called-dead no-trump takeover should choose a single search lead");
      assert(noTrumpCalledDeadLead[0].suit === "hearts" && noTrumpCalledDeadLead[0].rank === "10", difficulty + ": called-dead no-trump takeover should lead hearts 10 before clearing joker control");
      results.push(difficulty + " no-trump called-dead takeover ok");
    }

    for (const difficulty of ["beginner", "intermediate", "advanced"]) {
      setupNoTrumpThirdJokerControlLeadScenario(difficulty);
      const noTrumpThirdJokerLead = getLegalHintForPlayer(1);
      assert(noTrumpThirdJokerLead.length === 2, difficulty + ": third-joker control lead should choose a pair lead");
      assert(
        noTrumpThirdJokerLead.every((card) => card.suit === "joker" && card.rank === "RJ"),
        difficulty + ": third-joker control lead should cash the held red-joker pair before side-suit structures"
      );
      results.push(difficulty + " no-trump third-joker control lead ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupLateUnrevealedFriendFallbackScenario(difficulty);
      const lateFallbackLead = chooseAiLeadPlay(1);
      assert(lateFallbackLead.length >= 2, difficulty + ": late-unrevealed friend fallback should prefer a structured safety lead");
      assert(lateFallbackLead.every((card) => card.suit === "clubs"), difficulty + ": late-unrevealed friend fallback should stop leading friend suit and return to trump control");
      results.push(difficulty + " late-unrevealed friend fallback ok");
    }

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

    for (const difficulty of ["beginner", "intermediate"]) {
      setupPairFollowTriplePreserveScenario(difficulty);
      const protectedPairFromTriple = [
        state.players[2].hand.find((card) => card.id === "pair-triple-p3-h-k-1"),
        state.players[2].hand.find((card) => card.id === "pair-triple-p3-h-k-2"),
      ];
      const preferredLooseFollow = [
        state.players[2].hand.find((card) => card.id === "pair-triple-p3-h-3"),
        state.players[2].hand.find((card) => card.id === "pair-triple-p3-h-4"),
      ];
      const legalPairFollowChoices = getLegalSelectionsForPlayer(3);
      assert(
        legalPairFollowChoices.some((combo) => getComboKey(combo) === getComboKey(protectedPairFromTriple)),
        difficulty + ": pair-follow triple-preserve scenario should include the split-triple pair as a legal baseline candidate"
      );
      assert(
        legalPairFollowChoices.some((combo) => getComboKey(combo) === getComboKey(preferredLooseFollow)),
        difficulty + ": pair-follow triple-preserve scenario should include the loose same-suit follow as a legal alternative"
      );
      const pairFollowChoice = getLegalHintForPlayer(3);
      assert(pairFollowChoice.length === 2, difficulty + ": pair-follow triple-preserve scenario should choose two cards");
      assert(
        getComboKey(pairFollowChoice) === getComboKey(preferredLooseFollow),
        difficulty + ": should keep the exact triple intact instead of splitting it to follow pair"
      );
      results.push(difficulty + " pair-follow preserves exact triple ok");
    }

    for (const difficulty of ["beginner", "intermediate"]) {
      setupPairFollowTripleTakeoverScenario(difficulty);
      const protectedPairFromTriple = [
        state.players[2].hand.find((card) => card.id === "pair-takeover-p3-h-k-1"),
        state.players[2].hand.find((card) => card.id === "pair-takeover-p3-h-k-2"),
      ];
      const pairFollowChoice = getLegalHintForPlayer(3);
      assert(pairFollowChoice.length === 2, difficulty + ": pair-follow takeover scenario should choose two cards");
      assert(
        getComboKey(pairFollowChoice) === getComboKey(protectedPairFromTriple),
        difficulty + ": should split the exact triple into a pair when that pair can take the lead and still leaves follow-up cards"
      );
      results.push(difficulty + " pair-follow triple takeover ok");
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
