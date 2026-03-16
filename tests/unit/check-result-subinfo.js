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

    const cases = [
      {
        name: "banker big win shows big win and level up",
        outcome: { winner: "banker", bankerLevels: 3, defenderLevels: 0 },
        humanWon: true,
        humanLevelBefore: "2",
        humanLevelAfter: "5",
        bottomResult: null,
        expected: ["获胜", "大光", "升3级"],
      },
      {
        name: "banker small win shows small win and level up",
        outcome: { winner: "banker", bankerLevels: 2, defenderLevels: 0 },
        humanWon: true,
        humanLevelBefore: "2",
        humanLevelAfter: "4",
        bottomResult: null,
        expected: ["获胜", "小光", "升2级"],
      },
      {
        name: "defender level-up win shows level gain",
        outcome: { winner: "defender", bankerLevels: 0, defenderLevels: 1 },
        humanWon: true,
        humanLevelBefore: "9",
        humanLevelAfter: "10",
        bottomResult: null,
        expected: ["获胜", "升1级"],
      },
      {
        name: "bottom-penalty loss shows penalty and level drop",
        outcome: { winner: "defender", bankerLevels: 0, defenderLevels: 0 },
        humanWon: false,
        humanLevelBefore: "6",
        humanLevelAfter: "5",
        bottomResult: { penalty: { levels: 1, label: "单张主牌扣底" } },
        expected: ["失败", "扣底", "降1级"],
      },
    ];

    const results = cases.map((testCase) => {
      const actual = getResultSummaryTags(
        testCase.outcome,
        testCase.humanWon,
        testCase.humanLevelBefore,
        testCase.humanLevelAfter,
        testCase.bottomResult
      );
      assertDeepEqual(actual, testCase.expected, testCase.name);
      return { name: testCase.name, actual };
    });

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

console.log("Result subinfo regression passed:");
for (const result of output.results) {
  console.log(`- ${result.name}: ${result.actual.join(" / ")}`);
}
