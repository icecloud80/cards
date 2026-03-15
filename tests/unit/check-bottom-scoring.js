const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 加载运行牌局逻辑所需的测试上下文。
function loadGameContext() {
  const elementMap = new Map();

  /**
   * 作用：
   * 为依赖 DOM 的牌局逻辑提供最小可用的测试元素。
   *
   * 为什么这样写：
   * 这组回归只关心规则和结算，不需要真实页面；用轻量假元素就能稳定跑通 VM 上下文里的 UI 依赖。
   *
   * 输入：
   * @param {string} id - 业务里需要访问的元素 ID
   *
   * 输出：
   * @returns {object} 带有最小字段集的伪 DOM 元素
   *
   * 注意：
   * - 这里只提供测试用的最小接口，不要把它当成真实浏览器行为
   * - 新增 UI 依赖时报错时，再补对应字段即可
   */
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

// 运行扣底计分回归测试。
function runSuite(context) {
  const testSource = `
    // 断言条件成立。
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    // 创建测试用牌对象。
    function makeCard(id, suit, rank) {
      return { id, suit, rank };
    }

    // 创建测试用玩家对象。
    function makePlayer(id, hand = []) {
      return {
        id,
        name: "玩家" + id,
        hand,
        played: [],
        capturedPoints: 0,
        roundPoints: 0,
        level: "2",
        isHuman: id === 1,
      };
    }

    // 断言倍率信息符合预期。
    function assertBottomScoreInfo(name, cards, expectedMultiplier) {
      const info = getBottomScoreInfo(cards);
      assert(info.multiplier === expectedMultiplier, name + " multiplier expected " + expectedMultiplier + " but got " + info.multiplier);
    }

    // 重置最小结算状态。
    function resetSettlementState(bottomCards) {
      state.gameOver = false;
      state.phase = "playing";
      state.bankerId = 1;
      state.currentTurnId = 2;
      state.leaderId = 2;
      state.trickNumber = 11;
      state.currentTrick = [];
      state.currentTrickBeatCount = 0;
      state.leadSpec = null;
      state.lastTrick = null;
      state.bottomCards = bottomCards;
      state.centerAnnouncementQueue = [];
      state.centerAnnouncement = null;
      state.centerAnnouncementTimer = null;
      state.logs = [];
      state.allLogs = [];
      state.defenderPoints = 0;
      state.friendTarget = { failed: true };
      state.hiddenFriendId = null;
      state.playerLevels = { 1: "2", 2: "2", 3: "2", 4: "2", 5: "2" };
      state.players = [1, 2, 3, 4, 5].map((id) => makePlayer(id, []));
      render = function render() {};
      startResultCountdown = function startResultCountdown() {};
    }

    // 构造一轮末手并直接触发结算，返回底牌加分。
    function resolveFinalBottomWith(cards) {
      const bottomCards = [
        makeCard("bottom-5", "clubs", "5"),
        makeCard("bottom-10", "diamonds", "10"),
      ];
      resetSettlementState(bottomCards);
      state.currentTrick = [
        { playerId: 2, cards: cards },
        { playerId: 3, cards: cards.map((card, index) => makeCard("follower-a-" + index, "hearts", "3")) },
        { playerId: 4, cards: cards.map((card, index) => makeCard("follower-b-" + index, "hearts", "4")) },
        { playerId: 5, cards: cards.map((card, index) => makeCard("follower-c-" + index, "hearts", "6")) },
        { playerId: 1, cards: cards.map((card, index) => makeCard("follower-d-" + index, "hearts", "7")) },
      ];
      state.leadSpec = classifyPlay(cards);
      resolveTrick({ skipResolveDelay: true });
      return {
        defenderPoints: state.defenderPoints,
        logs: [...state.allLogs],
      };
    }

    assertBottomScoreInfo("single", [makeCard("sA", "spades", "A")], 2);
    assertBottomScoreInfo("pair", [makeCard("p7-1", "clubs", "7"), makeCard("p7-2", "clubs", "7")], 4);
    assertBottomScoreInfo("triple", [makeCard("t9-1", "hearts", "9"), makeCard("t9-2", "hearts", "9"), makeCard("t9-3", "hearts", "9")], 6);
    assertBottomScoreInfo("tractor", [
      makeCard("tr7-1", "clubs", "7"),
      makeCard("tr7-2", "clubs", "7"),
      makeCard("tr8-1", "clubs", "8"),
      makeCard("tr8-2", "clubs", "8"),
    ], 8);
    assertBottomScoreInfo("train", [
      makeCard("tn7-1", "diamonds", "7"),
      makeCard("tn7-2", "diamonds", "7"),
      makeCard("tn8-1", "diamonds", "8"),
      makeCard("tn8-2", "diamonds", "8"),
      makeCard("tn9-1", "diamonds", "9"),
      makeCard("tn9-2", "diamonds", "9"),
    ], 16);
    assertBottomScoreInfo("bulldozer", [
      makeCard("bd7-1", "spades", "7"),
      makeCard("bd7-2", "spades", "7"),
      makeCard("bd7-3", "spades", "7"),
      makeCard("bd8-1", "spades", "8"),
      makeCard("bd8-2", "spades", "8"),
      makeCard("bd8-3", "spades", "8"),
    ], 18);
    assertBottomScoreInfo("throw single plus tractor", [
      makeCard("th7-1", "clubs", "7"),
      makeCard("th7-2", "clubs", "7"),
      makeCard("th8-1", "clubs", "8"),
      makeCard("th8-2", "clubs", "8"),
      makeCard("th9-1", "clubs", "9"),
    ], 8);
    assertBottomScoreInfo("throw tractor plus triple", [
      makeCard("mix7-1", "diamonds", "7"),
      makeCard("mix7-2", "diamonds", "7"),
      makeCard("mix8-1", "diamonds", "8"),
      makeCard("mix8-2", "diamonds", "8"),
      makeCard("mix9-1", "diamonds", "9"),
      makeCard("mix9-2", "diamonds", "9"),
      makeCard("mix9-3", "diamonds", "9"),
    ], 8);

    const tractorSettlement = resolveFinalBottomWith([
      makeCard("settle7-1", "clubs", "7"),
      makeCard("settle7-2", "clubs", "7"),
      makeCard("settle8-1", "clubs", "8"),
      makeCard("settle8-2", "clubs", "8"),
    ]);
    assert(tractorSettlement.defenderPoints === 120, "tractor bottom settlement should add 15 * 8 = 120 points");
    assert(tractorSettlement.logs.some((item) => item.includes("拖拉机扣 x8")), "tractor settlement log should mention tractor x8");

    const throwSettlement = resolveFinalBottomWith([
      makeCard("throw7-1", "clubs", "7"),
      makeCard("throw7-2", "clubs", "7"),
      makeCard("throw8-1", "clubs", "8"),
      makeCard("throw8-2", "clubs", "8"),
      makeCard("throw9-1", "clubs", "9"),
    ]);
    assert(throwSettlement.defenderPoints === 120, "throw settlement should follow the best component multiplier");
    assert(throwSettlement.logs.some((item) => item.includes("甩牌扣（按拖拉机扣） x8")), "throw settlement log should mention the derived throw multiplier");

    globalThis.__bottomScoringResults = {
      tractorSettlementPoints: tractorSettlement.defenderPoints,
      throwSettlementPoints: throwSettlement.defenderPoints,
    };
  `;

  vm.runInContext(testSource, context, { filename: "bottom-scoring-inline.js" });
  return context.__bottomScoringResults;
}

const context = loadGameContext();
const output = runSuite(context);

console.log("Bottom scoring regression passed:");
console.log(`- tractor settlement points: ${output.tractorSettlementPoints}`);
console.log(`- throw settlement points: ${output.throwSettlementPoints}`);
