const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 加载运行牌局逻辑所需的测试上下文。
function loadGameContext() {
  const elementMap = new Map();
  // 获取元素。
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

// 运行当前测试套件。
function runSuite(context) {
  const testSource = `
    // 断言两个值的结构内容完全一致。
    function assertDeepEqual(actual, expected, message) {
      const actualJson = JSON.stringify(actual);
      const expectedJson = JSON.stringify(expected);
      if (actualJson !== expectedJson) {
        throw new Error(message + "\\nexpected: " + expectedJson + "\\nactual:   " + actualJson);
      }
    }

    // 断言条件成立。
    function assert(condition, message) {
      if (!condition) {
        throw new Error(message);
      }
    }

    const headlineCases = [
      {
        name: "banker big win shows headline flavor",
        outcome: { winner: "banker", bankerLevels: 3, defenderLevels: 0 },
        humanWon: true,
        humanLevelBefore: "2",
        humanLevelAfter: "5",
        expected: "大光 - 打家升3级",
      },
      {
        name: "defender win without level-up shows banker down",
        outcome: { winner: "defender", bankerLevels: 0, defenderLevels: 0 },
        humanWon: true,
        humanLevelBefore: "6",
        humanLevelAfter: "6",
        expected: "打家下台",
      },
      {
        name: "defender level-up win shows defender headline",
        outcome: { winner: "defender", bankerLevels: 0, defenderLevels: 1 },
        humanWon: true,
        humanLevelBefore: "6",
        humanLevelAfter: "7",
        expected: "闲家升1级",
      },
      {
        name: "banker loss without self level drop shows banker level-up summary",
        outcome: { winner: "banker", bankerLevels: 1, defenderLevels: 0 },
        humanWon: false,
        humanLevelBefore: "6",
        humanLevelAfter: "6",
        expected: "打家升1级",
      },
      {
        name: "banker small loss shows small-win headline",
        outcome: { winner: "banker", bankerLevels: 2, defenderLevels: 0 },
        humanWon: false,
        humanLevelBefore: "6",
        humanLevelAfter: "6",
        expected: "小光 - 打家升2级",
      },
      {
        name: "bottom-penalty loss shows level drop headline",
        outcome: { winner: "defender", bankerLevels: 0, defenderLevels: 0 },
        humanWon: false,
        humanLevelBefore: "6",
        humanLevelAfter: "5",
        expected: "降1级",
      },
    ];

    const results = headlineCases.map((testCase) => {
      const actual = getResultHeadlineDetail(
        testCase.outcome,
        testCase.humanWon,
        testCase.humanLevelBefore,
        testCase.humanLevelAfter
      );
      assert(actual === testCase.expected, testCase.name + "\\nexpected: " + testCase.expected + "\\nactual:   " + actual);
      return { name: testCase.name, actual };
    });

    state.players = [
      { id: 1, name: "玩家1" },
      { id: 2, name: "玩家2" },
      { id: 3, name: "玩家3" },
    ];
    state.bankerId = 1;
    state.hiddenFriendId = 2;
    state.friendTarget = { failed: false };

    const settlementListHtml = buildResultLevelListHtml(
      { winner: "banker", bankerLevels: 1, defenderLevels: 0 },
      { 1: "2", 2: "10", 3: "3" },
      { 1: "3", 2: "10", 3: "2" }
    );
    assert(settlementListHtml.includes("级别结算"), "result list should include a section title");
    assert(settlementListHtml.includes("玩家1"), "result list should include banker player name");
    assert(settlementListHtml.includes(">打家<"), "result list should include banker camp chip");
    assert(settlementListHtml.includes("Lv2"), "result list should include banker level before");
    assert(settlementListHtml.includes("Lv3"), "result list should include banker level after");
    assert(settlementListHtml.includes("玩家2"), "result list should include friend player name");
    assert(settlementListHtml.includes(">朋友<"), "result list should include friend camp chip");
    assert(settlementListHtml.includes("Lv10"), "result list should include friend level values");
    assert(settlementListHtml.includes("玩家3"), "result list should include defender player name");
    assert(settlementListHtml.includes(">闲家<"), "result list should include defender camp chip");
    assert(settlementListHtml.includes("<svg"), "result list should include level arrow icon markup");
    assert(settlementListHtml.includes(">升级<"), "result list should mark upgrade-style outcomes");
    assert(settlementListHtml.includes(">降级<"), "result list should mark level drops");

    // 回归对局日志导出，确认末尾会补入最终胜负界面的完整摘要。
    state.allLogs = ["玩家1 吊主", "玩家2 甩牌失败"];
    state.bottomCards = [
      { suit: "hearts", rank: "A" },
      { suit: "spades", rank: "K" },
    ];
    dom.resultTitle.textContent = "获胜 - 打家升1级";
    dom.resultBody.textContent = "打家方获胜，闲家总分 80。";
    state.resultScreenExportLines = buildResultScreenExportLines(
      dom.resultTitle.textContent,
      dom.resultBody.textContent,
      { winner: "banker", bankerLevels: 1, defenderLevels: 0 },
      { 1: "2", 2: "10", 3: "3" },
      { 1: "3", 2: "10", 3: "2" }
    );
    const resultLogText = getResultLogText();
    const bottomCardsText = state.bottomCards.map(shortCardLabel).join("、");
    assert(resultLogText.includes("全局播报：\\n1. 玩家1 吊主\\n2. 玩家2 甩牌失败"), "result log should keep the broadcast section before the final screen summary");
    assert(resultLogText.includes("最终胜负界面："), "result log should append the final result screen section");
    assert(resultLogText.includes("- 标题：获胜 - 打家升1级"), "result log should include the final result title");
    assert(resultLogText.includes("- 正文：打家方获胜，闲家总分 80。"), "result log should include the final result body");
    assert(resultLogText.includes("1. 玩家1 - 打家 - Lv2 -> Lv3升级"), "result log should include per-player settlement rows from the final screen");
    assert(resultLogText.trim().endsWith("- 底牌展示：" + bottomCardsText), "result log should end with the revealed bottom cards from the final screen");

    const underThresholdBottomPenaltyOutcome = getOutcome(110, {
      bottomPenalty: { levels: 2, label: "两张主级牌扣底" },
    });
    assert(underThresholdBottomPenaltyOutcome.winner === "banker", "successful bottom penalty under 120 should not auto-award defenders");
    assert(underThresholdBottomPenaltyOutcome.bankerLevels === 1, "successful bottom penalty under 120 should keep the normal banker level gain tier");

    const thresholdBottomPenaltyOutcome = getOutcome(120, {
      bottomPenalty: { levels: 2, label: "两张主级牌扣底" },
    });
    assert(thresholdBottomPenaltyOutcome.winner === "defender", "bottoming to 120 or above should still let defenders win");
    assert(thresholdBottomPenaltyOutcome.defenderLevels === 0, "120-164 points should still be a non-level-up defender win");

    globalThis.__resultSubinfoResults = { results };
  `;

  vm.runInContext(testSource, context, { filename: "result-subinfo-inline.js" });
  return context.__resultSubinfoResults;
}

const context = loadGameContext();
const output = runSuite(context);

console.log("Result settlement summary regression passed:");
for (const result of output.results) {
  console.log(`- ${result.name}: ${result.actual}`);
}
