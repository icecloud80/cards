const fs = require("fs");
const path = require("path");
const vm = require("vm");

/**
 * 作用：
 * 加载运行级牌扣底 heuristic 回归所需的测试上下文。
 *
 * 为什么这样写：
 * 这组测试需要直接调用共享 AI helper 与 beginner 决策入口，
 * 因此沿用 VM 沙箱把共享脚本装进同一份可控上下文，避免真实 UI 依赖干扰断言。
 *
 * 输入：
 * @param {void} - 无额外输入，直接读取共享脚本。
 *
 * 输出：
 * @returns {object} 带有完整共享函数与 `state` 的测试上下文。
 *
 * 注意：
 * - 这里只 stub 最小 UI 依赖，避免测试把渲染层也拉进来。
 * - 文件加载顺序要和实际运行顺序保持一致。
 */
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

/**
 * 作用：
 * 运行“初级 AI 级牌扣底”专项回归。
 *
 * 为什么这样写：
 * 这轮改动不是完整搜索，而是几条克制的轻量 heuristic，
 * 因此更适合用固定样本分别锁住“画像、吊主、延迟站队”三类行为，避免以后回归时悄悄漂掉。
 *
 * 输入：
 * @param {object} context - `loadGameContext()` 返回的 VM 上下文。
 *
 * 输出：
 * @returns {{results:Array<string>}} 回归结果摘要。
 *
 * 注意：
 * - 所有样本都固定在 `beginner`，避免其它难度的共享函数覆盖掉断言目标。
 * - 这里只校验策略方向，不把具体权重写死到更多边界上。
 */
function runGradeBottomStrategySuite(context) {
  const testSource = `
    /**
     * 作用：
     * 在内联 VM 测试里提供最小断言工具。
     *
     * 为什么这样写：
     * Node 侧只负责启动沙箱；真正的状态和共享函数都活在 VM 里，
     * 因此断言也直接放进同一上下文，更容易拿到原始错误现场。
     *
     * 输入：
     * @param {boolean} condition - 断言条件。
     * @param {string} message - 断言失败时抛出的信息。
     *
     * 输出：
     * @returns {void} 条件成立时不返回值。
     *
     * 注意：
     * - 失败时直接抛错，交给外层测试 runner 统一处理。
     */
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    /**
     * 作用：
     * 创建测试牌对象。
     *
     * 为什么这样写：
     * 这些场景只关心花色、点数和唯一 ID，保持构造器最小化最利于读样本。
     *
     * 输入：
     * @param {string} id - 牌的唯一标识。
     * @param {string} suit - 花色。
     * @param {string} rank - 点数。
     *
     * 输出：
     * @returns {{id:string,suit:string,rank:string}} 测试牌对象。
     *
     * 注意：
     * - ID 必须唯一，避免合法候选去重时误伤。
     */
    function makeCard(id, suit, rank) {
      return { id, suit, rank };
    }

    /**
     * 作用：
     * 创建测试玩家对象。
     *
     * 为什么这样写：
     * AI 共享层只依赖手牌、分数和基础身份字段，
     * 这里统一收口后，每个场景只需要关心自己要表达的牌型即可。
     *
     * 输入：
     * @param {number} id - 玩家 ID。
     * @param {Array<object>} hand - 玩家手牌。
     * @param {boolean} isHuman - 是否模拟真人座位。
     *
     * 输出：
     * @returns {object} 可直接放进 state.players 的玩家对象。
     *
     * 注意：
     * - sortHand() 保证断言时的手牌顺序稳定。
     */
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

    /**
     * 作用：
     * 重置所有场景公用的牌局状态。
     *
     * 为什么这样写：
     * 这组回归只想观察 heuristic 自己，不想被其它历史状态污染；
     * 因此每个样本都从同一套干净的 playing 局面起步。
     *
     * 输入：
     * @param {void} - 无额外输入。
     *
     * 输出：
     * @returns {void} 直接写入全局 state。
     *
     * 注意：
     * - 默认把玩家 1 设为打家，其余 4 家都可作为非打家样本。
     * - 断门信息默认全部关闭，避免误触其它共享 heuristic。
     */
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
      state.currentTurnId = 3;
      state.leaderId = 3;
      state.bankerId = 1;
      state.hiddenFriendId = null;
      state.trickNumber = 2;
      state.defenderPoints = 0;
      state.playHistory = [];
      state.friendTarget = {
        suit: "hearts",
        rank: "A",
        occurrence: 1,
        revealed: false,
        failed: false,
        matchesSeen: 0,
      };
      state.exposedTrumpVoid = { 1: false, 2: false, 3: false, 4: false, 5: false };
      state.exposedSuitVoid = {
        1: { clubs: false, diamonds: false, spades: false, hearts: false },
        2: { clubs: false, diamonds: false, spades: false, hearts: false },
        3: { clubs: false, diamonds: false, spades: false, hearts: false },
        4: { clubs: false, diamonds: false, spades: false, hearts: false },
        5: { clubs: false, diamonds: false, spades: false, hearts: false },
      };
    }

    /**
     * 作用：
     * 搭建“非打家有明显级牌扣底潜力，应主动吊主”的测试场景。
     *
     * 为什么这样写：
     * 这个样本同时满足“有级牌、主够长、手里有双王”三项条件，
     * 目标是验证新的开局画像会把玩家 3 识别为强潜力，并在首发时优先走可消耗主牌而不是普通副牌。
     *
     * 输入：
     * @param {void} - 场景固定由玩家 3 首发。
     *
     * 输出：
     * @returns {void} 直接写入全局 state。
     *
     * 注意：
     * - 玩家 3 明确不持有朋友牌，应被视为“暂定闲家”。
     * - 可消耗主里最高的是梅花 Q，应被优先拿来吊主。
     */
    function setupStrongGradeBottomLeadScenario() {
      resetCommonState();
      state.players = [
        basePlayer(1, [makeCard("b-s-9", "spades", "9")], true),
        basePlayer(2, [makeCard("p2-d-8", "diamonds", "8")]),
        basePlayer(3, [
          makeCard("p3-c-2-1", "clubs", "2"),
          makeCard("p3-c-2-2", "clubs", "2"),
          makeCard("p3-c-q", "clubs", "Q"),
          makeCard("p3-c-9", "clubs", "9"),
          makeCard("p3-c-6", "clubs", "6"),
          makeCard("p3-bj", "joker", "BJ"),
          makeCard("p3-rj", "joker", "RJ"),
          makeCard("p3-s-4", "spades", "4"),
        ]),
        basePlayer(4, [makeCard("p4-h-7", "hearts", "7")]),
        basePlayer(5, [makeCard("p5-d-6", "diamonds", "6")]),
      ];
    }

    /**
     * 作用：
     * 搭建“有级牌扣底潜力，但不是叫死，因此不急着站队”的测试场景。
     *
     * 为什么这样写：
     * 玩家 3 手里同时有朋友牌和较强的级牌扣底资源；
     * 新 heuristic 应该让它在前中盘先保留一点犹豫，不立刻用朋友牌亮身份。
     *
     * 输入：
     * @param {void} - 场景固定由打家首发红桃 Q，玩家 3 跟牌。
     *
     * 输出：
     * @returns {void} 直接写入全局 state。
     *
     * 注意：
     * - 玩家 3 不是叫死，只是持有第一张目标 A，因此允许延迟站队。
     * - 同门里还留了一张红桃 3，用来验证 AI 会优先藏住朋友牌。
     */
    function setupDelayRevealForGradeBottomScenario() {
      resetCommonState();
      state.players = [
        basePlayer(1, [makeCard("b-h-q", "hearts", "Q")], true),
        basePlayer(2, [makeCard("p2-d-9", "diamonds", "9")]),
        basePlayer(3, [
          makeCard("p3-h-a", "hearts", "A"),
          makeCard("p3-h-3", "hearts", "3"),
          makeCard("p3-c-2", "clubs", "2"),
          makeCard("p3-c-q", "clubs", "Q"),
          makeCard("p3-c-8", "clubs", "8"),
          makeCard("p3-c-5", "clubs", "5"),
          makeCard("p3-bj", "joker", "BJ"),
          makeCard("p3-rj", "joker", "RJ"),
        ]),
        basePlayer(4, [makeCard("p4-s-8", "spades", "8")]),
        basePlayer(5, [makeCard("p5-d-7", "diamonds", "7")]),
      ];
      state.currentTrick = [{
        playerId: 1,
        cards: [makeCard("lead-h-q", "hearts", "Q")],
      }];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 1;
      state.currentTurnId = 3;
    }

    /**
     * 作用：
     * 搭建“同侧已稳住时应尽量保住王和级牌”的测试场景。
     *
     * 为什么这样写：
     * 当前已有通用末局逻辑会倾向提前甩王，但这和“自己走级牌扣底路线”正好相反；
     * 这个样本直接验证新 helper 会优先垫掉低价值副牌，而不是先拆王或级牌。
     *
     * 输入：
     * @param {void} - 场景固定让玩家 4 先手且已被视为闲家同侧。
     *
     * 输出：
     * @returns {void} 直接写入全局 state。
     *
     * 注意：
     * - 通过“叫朋友失败”把非打家全部视为闲家，省去额外站队噪声。
     * - 玩家 3 只有一张副牌小牌可安全垫，应被优先选中。
     */
    function setupPreserveDiscardScenario() {
      resetCommonState();
      state.friendTarget.failed = true;
      state.currentTrick = [{
        playerId: 4,
        cards: [makeCard("lead-d-k", "diamonds", "K")],
      }];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 4;
      state.currentTurnId = 3;
      state.players = [
        basePlayer(1, [makeCard("b-c-7", "clubs", "7")], true),
        basePlayer(2, [makeCard("p2-h-8", "hearts", "8")]),
        basePlayer(3, [
          makeCard("p3-d-3", "diamonds", "3"),
          makeCard("p3-c-2", "clubs", "2"),
          makeCard("p3-bj", "joker", "BJ"),
          makeCard("p3-rj", "joker", "RJ"),
          makeCard("p3-c-a", "clubs", "A"),
          makeCard("p3-c-9", "clubs", "9"),
        ]),
        basePlayer(4, [makeCard("p4-d-k", "diamonds", "K")]),
        basePlayer(5, [makeCard("p5-s-7", "spades", "7")]),
      ];
    }

    /**
     * 作用：
     * 搭建“中级在特殊级应把级牌扣底提升成主目标”的测试场景。
     *
     * 为什么这样写：
     * 用户补充了 "J / Q / K / A" 这类特殊级里，级牌扣底权重应明显提高；
     * 这个样本锁住中级 objective 真的会切到 "grade_bottom"，而不是仍按普通找朋友或跑分处理。
     *
     * 输入：
     * @param {void} - 场景固定由玩家 3 在开局首发。
     *
     * 输出：
     * @returns {void} 直接写入全局 state。
     *
     * 注意：
     * - 玩家 3 明确不持有朋友牌，应被视为暂定闲家。
     * - 当前级别设为 "K"，属于级牌扣底优先级更高的特殊级。
     */
    function setupIntermediateGradeBottomObjectiveScenario() {
      resetCommonState();
      state.aiDifficulty = "intermediate";
      state.levelRank = "K";
      state.playerLevels = { 1: "K", 2: "K", 3: "K", 4: "K", 5: "K" };
      state.players = [
        basePlayer(1, [makeCard("ib-p1-s-9", "spades", "9")], true),
        basePlayer(2, [makeCard("ib-p2-d-8", "diamonds", "8")]),
        basePlayer(3, [
          makeCard("ib-p3-c-k", "clubs", "K"),
          makeCard("ib-p3-c-q", "clubs", "Q"),
          makeCard("ib-p3-c-9", "clubs", "9"),
          makeCard("ib-p3-bj", "joker", "BJ"),
          makeCard("ib-p3-rj", "joker", "RJ"),
          makeCard("ib-p3-s-4", "spades", "4"),
        ]),
        basePlayer(4, [makeCard("ib-p4-h-7", "hearts", "7")]),
        basePlayer(5, [makeCard("ib-p5-d-6", "diamonds", "6")]),
      ];
    }

    /**
     * 作用：
     * 搭建“中级首发应优先吊可消耗主，而不是先拆王或级牌”的测试场景。
     *
     * 为什么这样写：
     * 这组牌同时包含可消耗主、主级牌和双王；
     * 目标是验证中级评分链已经把“先吊普通主、保王和级牌”正式当成可搜索策略。
     *
     * 输入：
     * @param {void} - 场景固定由玩家 3 在开局首发。
     *
     * 输出：
     * @returns {void} 直接写入全局 state。
     *
     * 注意：
     * - 玩家 3 不持有朋友牌，应直接走闲家抢级牌扣底路线。
     * - 当前级别设为 "K"，方便同时检验特殊级优先级。
     */
    function setupIntermediateGradeBottomLeadScenario() {
      setupIntermediateGradeBottomObjectiveScenario();
    }

    /**
     * 作用：
     * 搭建“中级跟牌时应优先保住王和级牌结构”的测试场景。
     *
     * 为什么这样写：
     * 这个样本直接锁住中级跟牌评分会把低价值垫牌排在前面，
     * 避免未来调权重后又回到“为了一手小轮拆王、拆级牌”的旧倾向。
     *
     * 输入：
     * @param {void} - 场景固定由玩家 4 先手，玩家 3 跟牌。
     *
     * 输出：
     * @returns {void} 直接写入全局 state。
     *
     * 注意：
     * - 这里通过 "朋友失败" 把非打家全部视为闲家，减少身份噪声。
     * - 玩家 3 对首门红桃已经断门，因此多个单张都属于合法跟牌候选。
     */
    function setupIntermediateGradeBottomFollowScenario() {
      resetCommonState();
      state.aiDifficulty = "intermediate";
      state.levelRank = "Q";
      state.playerLevels = { 1: "Q", 2: "Q", 3: "Q", 4: "Q", 5: "Q" };
      state.friendTarget.failed = true;
      state.currentTrick = [{
        playerId: 4,
        cards: [makeCard("if-lead-h-k", "hearts", "K")],
      }];
      state.leadSpec = classifyPlay(state.currentTrick[0].cards);
      state.leaderId = 4;
      state.currentTurnId = 3;
      state.players = [
        basePlayer(1, [makeCard("if-p1-c-7", "clubs", "7")], true),
        basePlayer(2, [makeCard("if-p2-h-8", "hearts", "8")]),
        basePlayer(3, [
          makeCard("if-p3-d-3", "diamonds", "3"),
          makeCard("if-p3-c-q", "clubs", "Q"),
          makeCard("if-p3-bj", "joker", "BJ"),
          makeCard("if-p3-rj", "joker", "RJ"),
          makeCard("if-p3-c-a", "clubs", "A"),
          makeCard("if-p3-s-9", "spades", "9"),
        ]),
        basePlayer(4, [makeCard("if-p4-h-k", "hearts", "K")]),
        basePlayer(5, [makeCard("if-p5-s-7", "spades", "7")]),
      ];
    }

    setupStrongGradeBottomLeadScenario();
    const strongProfile = getAiGradeBottomProfile(3);
    assert(strongProfile.potential === "strong", "beginner: should recognize strong grade-bottom potential for non-banker");
    const strongLead = chooseAiLeadPlay(3);
    assert(strongLead.length === 1, "beginner: strong grade-bottom lead should still be a single legal combo");
    assert(strongLead[0].suit === "clubs" && strongLead[0].rank === "Q", "beginner: strong grade-bottom route should spend expendable trump first");

    setupDelayRevealForGradeBottomScenario();
    assert(shouldAiDelayRevealForGradeBottom(3) === true, "beginner: should allow delaying reveal when grade-bottom route is still alive");
    assert(shouldAiRevealFriend(3) === false, "beginner: should lower immediate reveal intent under grade-bottom caution");
    const delayedRevealFollow = getLegalHintForPlayer(3);
    assert(delayedRevealFollow.length === 1, "beginner: delayed reveal follow should still pick one legal card");
    assert(delayedRevealFollow[0].suit === "hearts" && delayedRevealFollow[0].rank === "3", "beginner: delayed reveal should prefer the non-target same-suit card");

    setupPreserveDiscardScenario();
    const preserveCandidates = [
      [state.players[2].hand.find((card) => card.id === "p3-d-3")],
      [state.players[2].hand.find((card) => card.id === "p3-c-2")],
      [state.players[2].hand.find((card) => card.id === "p3-bj")],
    ];
    const preserveChoice = chooseAiGradeBottomPreserveDiscard(3, preserveCandidates, getCurrentWinningPlay());
    assert(preserveChoice.length === 1, "beginner: preserve-discard helper should return one candidate");
    assert(preserveChoice[0].suit === "diamonds" && preserveChoice[0].rank === "3", "beginner: preserve-discard should keep joker and level card for grade-bottom route");

    setupIntermediateGradeBottomObjectiveScenario();
    const intermediateProfile = getAiGradeBottomProfile(3);
    assert(intermediateProfile.specialPriority === true, "intermediate: face-card levels should mark grade-bottom as higher priority");
    assert(shouldAiPursueGradeBottom(3) === true, "intermediate: tentative defender should pursue grade-bottom route in special levels");
    const intermediateObjective = getIntermediateObjective(3, "lead", cloneSimulationState(state));
    assert(intermediateObjective.primary === "grade_bottom", "intermediate: objective should elevate grade-bottom in special levels");

    setupIntermediateGradeBottomLeadScenario();
    const intermediateLeadPlayer = state.players[2];
    const expendableTrumpLead = [intermediateLeadPlayer.hand.find((card) => card.id === "ib-p3-c-q")];
    const gradeTrumpLead = [intermediateLeadPlayer.hand.find((card) => card.id === "ib-p3-c-k")];
    const jokerLead = [intermediateLeadPlayer.hand.find((card) => card.id === "ib-p3-rj")];
    const expendableTrumpScore = scoreIntermediateLeadCandidate(3, expendableTrumpLead, []);
    const gradeTrumpScore = scoreIntermediateLeadCandidate(3, gradeTrumpLead, []);
    const jokerLeadScore = scoreIntermediateLeadCandidate(3, jokerLead, []);
    assert(expendableTrumpScore > gradeTrumpScore, "intermediate: expendable trump lead should outrank exposing level card");
    assert(expendableTrumpScore > jokerLeadScore, "intermediate: expendable trump lead should outrank exposing joker control");

    setupIntermediateGradeBottomFollowScenario();
    const currentWinningPlay = getCurrentWinningPlay();
    const lowDiscard = [state.players[2].hand.find((card) => card.id === "if-p3-d-3")];
    const gradeDiscard = [state.players[2].hand.find((card) => card.id === "if-p3-c-q")];
    const jokerDiscard = [state.players[2].hand.find((card) => card.id === "if-p3-bj")];
    const lowDiscardScore = scoreIntermediateFollowCandidate(3, lowDiscard, currentWinningPlay, true, []);
    const gradeDiscardScore = scoreIntermediateFollowCandidate(3, gradeDiscard, currentWinningPlay, true, []);
    const jokerDiscardScore = scoreIntermediateFollowCandidate(3, jokerDiscard, currentWinningPlay, true, []);
    assert(lowDiscardScore > gradeDiscardScore, "intermediate: low off-suit discard should outrank spending level card during grade-bottom route");
    assert(lowDiscardScore > jokerDiscardScore, "intermediate: low off-suit discard should outrank spending joker control during grade-bottom route");

    globalThis.__aiGradeBottomResults = {
      results: [
        "beginner grade-bottom profile ok",
        "beginner grade-bottom trump lead ok",
        "beginner delayed reveal under grade-bottom ok",
        "beginner grade-bottom preserve discard ok",
        "intermediate grade-bottom objective ok",
        "intermediate grade-bottom lead scoring ok",
        "intermediate grade-bottom follow scoring ok",
      ],
    };
  `;

  vm.runInContext(testSource, context, { filename: "ai-grade-bottom-strategy-inline.js" });
  return context.__aiGradeBottomResults;
}

const context = loadGameContext();
const output = runGradeBottomStrategySuite(context);

console.log("AI grade-bottom strategy regression passed:");
for (const item of output.results) {
  console.log(`- ${item}`);
}
