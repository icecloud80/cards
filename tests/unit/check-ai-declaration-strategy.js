const fs = require("fs");
const path = require("path");
const vm = require("vm");

/**
 * 作用：
 * 加载测试亮主与反主启发式所需的牌局上下文。
 *
 * 为什么这样写：
 * 这组回归只验证自动亮主 / 自动反主的轻量策略门槛，
 * 不需要完整 UI，也不需要加载全部 AI 文件，保持上下文最小即可。
 *
 * 输入：
 * @param {void} - 通过固定文件列表构造测试运行环境。
 *
 * 输出：
 * @returns {object} 已经加载好共享逻辑的 VM 上下文。
 *
 * 注意：
 * - 这里仍会加载 `game.js`，因为自动亮主与反主入口定义在该文件中。
 * - 需要提供空的 `render` 等函数，避免测试因 UI 依赖中断。
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
  context.autoPlayCurrentTurn = function autoPlayCurrentTurn() {};

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

/**
 * 作用：
 * 运行初级亮主 / 反主启发式回归套件。
 *
 * 为什么这样写：
 * 这次改动的目标是给初级 AI 增加两条很轻量的自动决策门槛，
 * 因此回归重点也应聚焦在“是否会自动亮 / 自动反”的边界上。
 *
 * 输入：
 * @param {object} context - 已加载共享牌局逻辑的 VM 上下文。
 *
 * 输出：
 * @returns {object} 包含测试结果摘要的对象。
 *
 * 注意：
 * - 套件同时覆盖初级被门槛拦住与中级不受门槛影响两类情况。
 * - 测试直接调用 `maybeAutoDeclare` 与 `getAutoCounterDeclarationForPlayer`，避免依赖计时器随机性。
 */
function runDeclarationStrategySuite(context) {
  const testSource = `
    /**
     * 作用：
     * 断言测试条件是否成立。
     *
     * 为什么这样写：
     * 让测试失败时直接给出语义明确的错误信息，便于定位哪条 heuristic 失效。
     *
     * 输入：
     * @param {boolean} condition - 断言是否成立。
     * @param {string} message - 断言失败时抛出的提示信息。
     *
     * 输出：
     * @returns {void} 条件成立时不返回值。
     *
     * 注意：
     * - 只要条件为假就立即抛错，避免后续状态继续污染。
     */
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    /**
     * 作用：
     * 构造测试用牌对象。
     *
     * 为什么这样写：
     * 亮主与反主测试只依赖花色和点数，不需要真实图片与额外展示字段。
     *
     * 输入：
     * @param {string} id - 牌对象的唯一标识。
     * @param {string} suit - 牌的花色。
     * @param {string} rank - 牌的点数。
     *
     * 输出：
     * @returns {object} 最小可用的测试牌对象。
     *
     * 注意：
     * - id 仍需稳定，便于调试状态快照。
     */
    function makeCard(id, suit, rank) {
      return { id, suit, rank };
    }

    /**
     * 作用：
     * 构造测试用玩家对象。
     *
     * 为什么这样写：
     * 自动亮主与自动反主会直接读取玩家手牌、身份和等级，
     * 这里统一生成最小玩家结构，减少场景样板代码。
     *
     * 输入：
     * @param {number} id - 玩家 ID。
     * @param {object[]} hand - 玩家当前手牌。
     * @param {boolean} isHuman - 是否视作人类玩家。
     *
     * 输出：
     * @returns {object} 可直接写入 state.players 的测试玩家对象。
     *
     * 注意：
     * - 这里固定把等级写成 2，与本套件场景保持一致。
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
     * 重置声明阶段测试共用状态。
     *
     * 为什么这样写：
     * 亮主与反主门槛依赖玩家等级、当前亮主、阶段和 AI 难度，
     * 统一重置能避免不同场景相互污染。
     *
     * 输入：
     * @param {string} difficulty - 本场景要使用的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接就地重置全局 state。
     *
     * 注意：
     * - 默认把玩家 1 视为人类，其余为 AI。
     * - 未显式使用的状态也会重置到稳定值，降低回归脆弱性。
     */
    function resetDeclarationState(difficulty) {
      state.gameOver = false;
      state.phase = "dealing";
      state.aiDifficulty = difficulty;
      state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
      state.trumpSuit = "hearts";
      state.levelRank = null;
      state.declaration = null;
      state.currentTurnId = 2;
      state.leaderId = 2;
      state.currentTrick = [];
      state.leadSpec = null;
      state.bottomCards = [];
      state.dealCards = [];
      state.dealIndex = 0;
      state.counterPasses = 0;
      state.awaitingHumanDeclaration = false;
      state.showDebugPanel = false;
      state.lastAiDecision = null;
      state.aiDecisionHistory = [];
      state.aiDecisionHistorySeq = 0;
      state.players = [
        basePlayer(1, [], true),
        basePlayer(2, []),
        basePlayer(3, []),
        basePlayer(4, []),
        basePlayer(5, []),
      ];
    }

    /**
     * 作用：
     * 搭建“短主不应自动亮主”的场景。
     *
     * 为什么这样写：
     * 需要验证初级 AI 不会因为只有一组合法级牌就立刻亮短主，
     * 同时保证中级仍能按原逻辑拿到该合法方案。
     *
     * 输入：
     * @param {string} difficulty - 场景使用的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接把测试手牌写入玩家 2。
     *
     * 注意：
     * - 这里的方块主总数只有 2 张级牌，不满足“大于 7 张”也不满足“达到手牌 1/4”。
     */
    function setupWeakSuitDeclareScenario(difficulty) {
      resetDeclarationState(difficulty);
      state.players[1].hand = sortHand([
        makeCard("d2-1", "diamonds", "2"),
        makeCard("d2-2", "diamonds", "2"),
        makeCard("c7", "clubs", "7"),
        makeCard("h8", "hearts", "8"),
        makeCard("s9", "spades", "9"),
        makeCard("ck", "clubs", "K"),
        makeCard("ha", "hearts", "A"),
        makeCard("s5", "spades", "5"),
        makeCard("c4", "clubs", "4"),
        makeCard("h6", "hearts", "6"),
        makeCard("c6", "clubs", "6"),
        makeCard("s8", "spades", "8"),
      ]);
    }

    /**
     * 作用：
     * 搭建“已有足够主牌时可以自动亮主”的场景。
     *
     * 为什么这样写：
     * 需要验证新增门槛不是一刀切，而是仍允许初级在明显长主时正常自动亮主。
     *
     * 输入：
     * @param {string} difficulty - 场景使用的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接把测试手牌写入玩家 2。
     *
     * 注意：
     * - 这里按黑桃为主时共有 10 张主牌，满足初级自动亮主门槛。
     */
    function setupStrongSuitDeclareScenario(difficulty) {
      resetDeclarationState(difficulty);
      state.players[1].hand = sortHand([
        makeCard("s2-1", "spades", "2"),
        makeCard("s2-2", "spades", "2"),
        makeCard("s3", "spades", "3"),
        makeCard("s4", "spades", "4"),
        makeCard("s5", "spades", "5"),
        makeCard("s6", "spades", "6"),
        makeCard("s7", "spades", "7"),
        makeCard("s8", "spades", "8"),
        makeCard("s9", "spades", "9"),
        makeCard("s10", "spades", "10"),
        makeCard("dk", "diamonds", "K"),
        makeCard("ca", "clubs", "A"),
      ]);
    }

    /**
     * 作用：
     * 搭建“中级应延迟低价值两张亮主”的场景。
     *
     * 为什么这样写：
     * 中级第一阶段需要允许低价值两张方案继续等牌，
     * 这里用早期手牌和很弱的方块两张级牌，验证自动流程会先观望。
     *
     * 输入：
     * @param {void} - 场景固定使用中级 AI。
     *
     * 输出：
     * @returns {void} 直接写入玩家 2 的测试手牌。
     *
     * 注意：
     * - 玩家 2 当前只有 8 张牌，说明后面仍有大量摸牌空间。
     * - 这组牌只有两张方块级牌，没有额外主控与长套支撑。
     */
    function setupIntermediateDelayDeclareScenario() {
      resetDeclarationState("intermediate");
      state.players[1].hand = sortHand([
        makeCard("d2-1", "diamonds", "2"),
        makeCard("d2-2", "diamonds", "2"),
        makeCard("c7", "clubs", "7"),
        makeCard("h8", "hearts", "8"),
        makeCard("s9", "spades", "9"),
        makeCard("ck", "clubs", "K"),
        makeCard("ha", "hearts", "A"),
        makeCard("s5", "spades", "5"),
      ]);
    }

    /**
     * 作用：
     * 搭建“中级应在同档位里选择更好主种”的场景。
     *
     * 为什么这样写：
     * 旧逻辑在同档位里基本只受花色枚举顺序影响，
     * 这里同时给出梅花和红桃两组两张级牌，验证中级会选主控更强的红桃。
     *
     * 输入：
     * @param {void} - 场景固定使用中级 AI。
     *
     * 输出：
     * @returns {void} 直接写入玩家 2 的测试手牌。
     *
     * 注意：
     * - 红桃方案额外带有长套和高张，应该比梅花方案更适合坐庄。
     * - 这手牌长度较高，主要是为了让红桃方案的评分明显高于延迟阈值。
     */
    function setupIntermediatePreferBetterSuitScenario() {
      resetDeclarationState("intermediate");
      state.players[1].hand = sortHand([
        makeCard("c2-1", "clubs", "2"),
        makeCard("c2-2", "clubs", "2"),
        makeCard("h2-1", "hearts", "2"),
        makeCard("h2-2", "hearts", "2"),
        makeCard("ha", "hearts", "A"),
        makeCard("hk", "hearts", "K"),
        makeCard("hq", "hearts", "Q"),
        makeCard("hj", "hearts", "J"),
        makeCard("h10", "hearts", "10"),
        makeCard("h9", "hearts", "9"),
        makeCard("h8", "hearts", "8"),
        makeCard("ca", "clubs", "A"),
        makeCard("c6", "clubs", "6"),
        makeCard("dk", "diamonds", "K"),
        makeCard("sA", "spades", "A"),
        makeCard("s9", "spades", "9"),
      ]);
    }

    /**
     * 作用：
     * 搭建“常主不足时不应自动反无主”的场景。
     *
     * 为什么这样写：
     * 用户要求初级 AI 反无主至少持有 4 张常主，
     * 这里需要验证只有两王时会被策略门槛拦下。
     *
     * 输入：
     * @param {string} difficulty - 场景使用的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接写入当前亮主和玩家 2 手牌。
     *
     * 注意：
     * - 当前亮主设置成花色主，确保两张王形成的无主方案是合法覆盖。
     */
    function setupWeakNoTrumpCounterScenario(difficulty) {
      resetDeclarationState(difficulty);
      state.phase = "countering";
      state.declaration = { playerId: 3, suit: "clubs", rank: "2", count: 2, cards: [] };
      state.players[1].hand = sortHand([
        makeCard("bj-1", "joker", "BJ"),
        makeCard("bj-2", "joker", "BJ"),
        makeCard("c9", "clubs", "9"),
        makeCard("d9", "diamonds", "9"),
        makeCard("h8", "hearts", "8"),
        makeCard("s8", "spades", "8"),
        makeCard("ck", "clubs", "K"),
        makeCard("ha", "hearts", "A"),
      ]);
    }

    /**
     * 作用：
     * 搭建“常主足够时可以自动反无主”的场景。
     *
     * 为什么这样写：
     * 需要验证 4 张及以上常主不会被新门槛误杀，保证初级仍能在明显强无主时出手。
     *
     * 输入：
     * @param {string} difficulty - 场景使用的 AI 难度。
     *
     * 输出：
     * @returns {void} 直接写入当前亮主和玩家 2 手牌。
     *
     * 注意：
     * - 这里的 5 张常主由两张大王和三张级牌组成。
     */
    function setupStrongNoTrumpCounterScenario(difficulty) {
      resetDeclarationState(difficulty);
      state.phase = "countering";
      state.declaration = { playerId: 3, suit: "clubs", rank: "2", count: 2, cards: [] };
      state.players[1].hand = sortHand([
        makeCard("bj-1", "joker", "BJ"),
        makeCard("bj-2", "joker", "BJ"),
        makeCard("d2-1", "diamonds", "2"),
        makeCard("h2-1", "hearts", "2"),
        makeCard("s2-1", "spades", "2"),
        makeCard("c9", "clubs", "9"),
        makeCard("d9", "diamonds", "9"),
        makeCard("h8", "hearts", "8"),
      ]);
    }

    /**
     * 作用：
     * 搭建“中级应放弃低收益反主”的场景。
     *
     * 为什么这样写：
     * 中级第一阶段的反主策略重点，是避免“能反就反”。
     * 这里让当前亮主已经是低一档的无主，而玩家 2 只多出一档王张升级空间，
     * 验证自动流程会判断这次“只升一点档”的反无主收益不足而放弃。
     *
     * 输入：
     * @param {void} - 场景固定使用中级 AI。
     *
     * 输出：
     * @returns {void} 直接写入当前亮主和玩家 2 测试手牌。
     *
     * 注意：
     * - 当前亮主是两张黑王无主，玩家 2 手里有两张红王。
     * - 这种反主虽然合法，但除了档位更高，几乎拿不到额外主牌结构收益。
     */
    function setupIntermediateWeakCounterScenario() {
      resetDeclarationState("intermediate");
      state.phase = "countering";
      state.declaration = { playerId: 3, suit: "notrump", rank: "2", count: 2, cards: [
        makeCard("bj-1", "joker", "BJ"),
        makeCard("bj-2", "joker", "BJ"),
      ] };
      state.players[1].hand = sortHand([
        makeCard("rj-1", "joker", "RJ"),
        makeCard("rj-2", "joker", "RJ"),
        makeCard("c9", "clubs", "9"),
        makeCard("c8", "clubs", "8"),
        makeCard("h9", "hearts", "9"),
        makeCard("h8", "hearts", "8"),
        makeCard("s9", "spades", "9"),
        makeCard("s8", "spades", "8"),
      ]);
    }

    const results = [];

    setupWeakSuitDeclareScenario("beginner");
    assert(getBestDeclarationForPlayer(2)?.suit === "diamonds", "beginner: legal best declaration should still be diamonds");
    assert(getAutoDeclarationForPlayer(2) === null, "beginner: short-suit declaration should be blocked by heuristic");
    maybeAutoDeclare(2);
    assert(state.declaration === null, "beginner: maybeAutoDeclare should not commit blocked short-suit declaration");
    results.push("beginner short-suit auto declare blocked");

    setupIntermediateDelayDeclareScenario();
    assert(getBestDeclarationForPlayer(2)?.suit === "diamonds", "intermediate: legal best declaration should still be diamonds");
    assert(getAutoDeclarationForPlayer(2) === null, "intermediate: low-value two-card declaration should be delayed");
    results.push("intermediate weak two-card declare delayed");

    setupIntermediatePreferBetterSuitScenario();
    assert(getBestDeclarationForPlayer(2)?.suit === "clubs", "intermediate: legal best declaration still follows old suit order baseline");
    assert(getAutoDeclarationForPlayer(2)?.suit === "hearts", "intermediate: auto declaration should prefer stronger same-tier heart trump");
    results.push("intermediate better-suit declaration chosen");

    setupStrongSuitDeclareScenario("beginner");
    assert(getAutoDeclarationForPlayer(2)?.suit === "spades", "beginner: long-suit declaration should pass heuristic");
    results.push("beginner long-suit auto declare allowed");

    setupWeakNoTrumpCounterScenario("beginner");
    assert(getCounterDeclarationForPlayer(2)?.suit === "notrump", "beginner: legal no-trump counter should still exist");
    assert(getAutoCounterDeclarationForPlayer(2) === null, "beginner: no-trump counter should require at least five common trumps");
    results.push("beginner weak no-trump counter blocked");

    setupStrongNoTrumpCounterScenario("beginner");
    assert(getAutoCounterDeclarationForPlayer(2)?.suit === "notrump", "beginner: strong no-trump counter should pass common-trump heuristic");
    results.push("beginner strong no-trump counter allowed");

    setupIntermediateWeakCounterScenario();
    assert(getCounterDeclarationForPlayer(2)?.suit === "notrump", "intermediate: legal counter option should still be no-trump");
    assert(getAutoCounterDeclarationForPlayer(2) === null, "intermediate: low-upgrade counter should be skipped");
    results.push("intermediate weak counter skipped");

    setupIntermediatePreferBetterSuitScenario();
    state.showDebugPanel = true;
    maybeAutoDeclare(2);
    assert(state.aiDecisionHistory.length === 1, "intermediate: declare debug should record one setup snapshot");
    assert(state.aiDecisionHistory[0].mode === "declare", "intermediate: declare debug snapshot should use declare mode");
    assert(state.aiDecisionHistory[0].candidateEntries.length >= 2, "intermediate: declare debug snapshot should preserve candidate list");
    results.push("intermediate declare debug snapshot ok");

    setupIntermediateWeakCounterScenario();
    state.showDebugPanel = true;
    state.currentTurnId = 2;
    startCounterTurn();
    assert(state.aiDecisionHistory.length === 1, "intermediate: counter debug should record one setup snapshot");
    assert(state.aiDecisionHistory[0].mode === "counter", "intermediate: counter debug snapshot should use counter mode");
    assert(state.aiDecisionHistory[0].selectedCards.length === 0, "intermediate: skipped counter should record empty selected cards");
    results.push("intermediate counter debug snapshot ok");

    globalThis.__declarationStrategyResults = { results };
  `;

  vm.runInContext(testSource, context, { filename: "ai-declaration-strategy-inline.js" });
  return context.__declarationStrategyResults;
}

const context = loadGameContext();
const output = runDeclarationStrategySuite(context);

console.log("AI declaration strategy regression passed:");
for (const result of output.results) {
  console.log("- " + result);
}
