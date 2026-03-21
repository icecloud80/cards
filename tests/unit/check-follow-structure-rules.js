const fs = require("fs");
const path = require("path");
const vm = require("vm");

/**
 * 作用：
 * 创建一份可直接执行共享牌局逻辑的最小测试上下文。
 *
 * 为什么这样写：
 * 这条回归要直接调用 `validateSelection(...)` 这类共享规则函数，
 * 只靠 headless API 暴露的少量封装不够精细；单独准备一份最小 VM 环境后，
 * 就能稳定复现“跟牌结构是否合法”的边界，而不必真的跑完整局。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {object} 已加载 shared 逻辑的 VM 上下文。
 *
 * 注意：
 * - 这里只保留规则回归所需的最小 DOM / render 桩，不扩展成完整浏览器环境。
 * - 如果后续 shared 入口新增了初始化期依赖，应优先补桩而不是跳过真实文件加载。
 */
function loadGameContext() {
  const elementMap = new Map();

  /**
   * 作用：
   * 按需返回一个最小可用的 DOM 元素桩。
   *
   * 为什么这样写：
   * shared 配置层会在加载阶段缓存大量 `getElementById(...)` 结果；
   * 这里按需懒创建元素，就能避免规则回归因为无关 DOM 节点缺失而报错。
   *
   * 输入：
   * @param {string} id - 当前请求的元素 ID。
   *
   * 输出：
   * @returns {object} 具备最小 `classList` 和文本字段的元素桩。
   *
   * 注意：
   * - 这里只服务单元回归，不实现真实样式和事件行为。
   * - 同一个 `id` 必须返回同一份对象，避免 shared 缓存失效。
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
    path.join(__dirname, "../../src/shared/ai-shared.js"),
    path.join(__dirname, "../../src/shared/ai-beginner.js"),
    path.join(__dirname, "../../src/shared/ai-objectives.js"),
    path.join(__dirname, "../../src/shared/ai-evaluate.js"),
    path.join(__dirname, "../../src/shared/ai-candidates.js"),
    path.join(__dirname, "../../src/shared/ai-simulate.js"),
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
 * 运行“跟牌结构规则”专项回归。
 *
 * 为什么这样写：
 * 这次规则调整的核心不在单纯张数，而在“连对 / 刻子 / 对子”要按什么顺序强制跟；
 * 用一组固定边界样本直接锁住拖拉机、火车 / 宇宙飞船、刻子和推土机，
 * 后续再改 AI 或规则 helper 时，就不会把这些细节悄悄回退。
 *
 * 输入：
 * @param {object} context - `loadGameContext()` 返回的共享 VM 上下文。
 *
 * 输出：
 * @returns {{tractor: string, train: string, spaceship: string, triple: string, bulldozerTriples: string, bulldozerPairs: string}} 本轮回归摘要。
 *
 * 注意：
 * - 所有样本都固定为“同门张数足够”的场景，专门验证结构约束本身。
 * - 这里只测合法性和自动提示，不测试整轮结算归属。
 */
function runSuite(context) {
  const testSource = `
    function assert(condition, message) {
      if (!condition) {
        throw new Error(message);
      }
    }

    function makeCard(id, suit, rank) {
      return { id, suit, rank };
    }

    function resetPlayers() {
      state.gameOver = false;
      state.phase = "playing";
      state.trumpSuit = "hearts";
      state.levelRank = "2";
      state.currentTurnId = 3;
      state.leaderId = 2;
      state.trickNumber = 6;
      state.currentTrickBeatCount = 0;
      state.logs = [];
      state.allLogs = [];
      state.bottomCards = [];
      state.players = [1, 2, 3, 4, 5].map((id) => ({
        id,
        name: "玩家" + id,
        isHuman: id === 1,
        hand: [],
        played: [],
        capturedPoints: 0,
        roundPoints: 0,
        level: "2",
      }));
    }

    function setFollowCase(leadCards, followCards) {
      resetPlayers();
      state.players[1].hand = leadCards.slice();
      state.players[2].hand = followCards.slice();
      state.currentTrick = [{ playerId: 2, cards: leadCards.slice() }];
      state.leadSpec = classifyPlay(leadCards);
    }

    function pickCards(hand, ids) {
      return ids.map((id) => hand.find((card) => card.id === id));
    }

    setFollowCase(
      [
        makeCard("lead-tractor-c4a", "clubs", "4"),
        makeCard("lead-tractor-c4b", "clubs", "4"),
        makeCard("lead-tractor-c5a", "clubs", "5"),
        makeCard("lead-tractor-c5b", "clubs", "5"),
      ],
      [
        makeCard("follow-tractor-c6a", "clubs", "6"),
        makeCard("follow-tractor-c6b", "clubs", "6"),
        makeCard("follow-tractor-c8a", "clubs", "8"),
        makeCard("follow-tractor-c8b", "clubs", "8"),
        makeCard("follow-tractor-c9", "clubs", "9"),
        makeCard("follow-tractor-cJ", "clubs", "J"),
      ]
    );
    let followHand = state.players[2].hand;
    let invalidSelection = pickCards(followHand, ["follow-tractor-c6a", "follow-tractor-c6b", "follow-tractor-c9", "follow-tractor-cJ"]);
    let legalSelection = pickCards(followHand, ["follow-tractor-c6a", "follow-tractor-c6b", "follow-tractor-c8a", "follow-tractor-c8b"]);
    assert(!validateSelection(3, invalidSelection).ok, "首家出拖拉机时，手里有两对就不能只跟一对");
    assert(validateSelection(3, legalSelection).ok, "首家出拖拉机时，手里有两对应允许跟两对");

    setFollowCase(
      [
        makeCard("lead-train-c3a", "clubs", "3"),
        makeCard("lead-train-c3b", "clubs", "3"),
        makeCard("lead-train-c4a", "clubs", "4"),
        makeCard("lead-train-c4b", "clubs", "4"),
        makeCard("lead-train-c5a", "clubs", "5"),
        makeCard("lead-train-c5b", "clubs", "5"),
      ],
      [
        makeCard("follow-train-c6a", "clubs", "6"),
        makeCard("follow-train-c6b", "clubs", "6"),
        makeCard("follow-train-c7a", "clubs", "7"),
        makeCard("follow-train-c7b", "clubs", "7"),
        makeCard("follow-train-c9a", "clubs", "9"),
        makeCard("follow-train-c9b", "clubs", "9"),
        makeCard("follow-train-cJa", "clubs", "J"),
        makeCard("follow-train-cJb", "clubs", "J"),
      ]
    );
    followHand = state.players[2].hand;
    invalidSelection = pickCards(followHand, [
      "follow-train-c6a",
      "follow-train-c6b",
      "follow-train-c9a",
      "follow-train-c9b",
      "follow-train-cJa",
      "follow-train-cJb",
    ]);
    legalSelection = pickCards(followHand, [
      "follow-train-c6a",
      "follow-train-c6b",
      "follow-train-c7a",
      "follow-train-c7b",
      "follow-train-c9a",
      "follow-train-c9b",
    ]);
    assert(!validateSelection(3, invalidSelection).ok, "首家出火车时，手里有拖拉机就不能只散跟三对");
    assert(validateSelection(3, legalSelection).ok, "首家出火车时，应允许先跟拖拉机再补对子");

    setFollowCase(
      [
        makeCard("lead-ship-c3a", "clubs", "3"),
        makeCard("lead-ship-c3b", "clubs", "3"),
        makeCard("lead-ship-c4a", "clubs", "4"),
        makeCard("lead-ship-c4b", "clubs", "4"),
        makeCard("lead-ship-c5a", "clubs", "5"),
        makeCard("lead-ship-c5b", "clubs", "5"),
        makeCard("lead-ship-c6a", "clubs", "6"),
        makeCard("lead-ship-c6b", "clubs", "6"),
      ],
      [
        makeCard("follow-ship-c7a", "clubs", "7"),
        makeCard("follow-ship-c7b", "clubs", "7"),
        makeCard("follow-ship-c8a", "clubs", "8"),
        makeCard("follow-ship-c8b", "clubs", "8"),
        makeCard("follow-ship-c9a", "clubs", "9"),
        makeCard("follow-ship-c9b", "clubs", "9"),
        makeCard("follow-ship-cJa", "clubs", "J"),
        makeCard("follow-ship-cJb", "clubs", "J"),
        makeCard("follow-ship-cQa", "clubs", "Q"),
        makeCard("follow-ship-cQb", "clubs", "Q"),
      ]
    );
    followHand = state.players[2].hand;
    invalidSelection = pickCards(followHand, [
      "follow-ship-c7a",
      "follow-ship-c7b",
      "follow-ship-c8a",
      "follow-ship-c8b",
      "follow-ship-cJa",
      "follow-ship-cJb",
      "follow-ship-cQa",
      "follow-ship-cQb",
    ]);
    legalSelection = pickCards(followHand, [
      "follow-ship-c7a",
      "follow-ship-c7b",
      "follow-ship-c8a",
      "follow-ship-c8b",
      "follow-ship-c9a",
      "follow-ship-c9b",
      "follow-ship-cJa",
      "follow-ship-cJb",
    ]);
    assert(!validateSelection(3, invalidSelection).ok, "首家出宇宙飞船时，手里有火车就不能只跟更短的拖拉机");
    assert(validateSelection(3, legalSelection).ok, "首家出宇宙飞船时，应允许先跟手里的最长火车再补对子");
    state.aiDifficulty = "beginner";
    const hintedShipFollow = getLegalHintForPlayer(3);
    assert(validateSelection(3, hintedShipFollow).ok, "自动提示给出的宇宙飞船跟牌必须保持合法");
    assert(getLongestForcedPairRunLength(hintedShipFollow) >= 3, "自动提示应保留至少一段可跟出的火车结构");

    setFollowCase(
      [
        makeCard("lead-triple-d5a", "diamonds", "5"),
        makeCard("lead-triple-d5b", "diamonds", "5"),
        makeCard("lead-triple-d5c", "diamonds", "5"),
      ],
      [
        makeCard("follow-triple-d7a", "diamonds", "7"),
        makeCard("follow-triple-d7b", "diamonds", "7"),
        makeCard("follow-triple-d9a", "diamonds", "9"),
        makeCard("follow-triple-d9b", "diamonds", "9"),
        makeCard("follow-triple-dJ", "diamonds", "J"),
      ]
    );
    followHand = state.players[2].hand;
    invalidSelection = pickCards(followHand, ["follow-triple-d7a", "follow-triple-d9a", "follow-triple-dJ"]);
    legalSelection = pickCards(followHand, ["follow-triple-d7a", "follow-triple-d7b", "follow-triple-dJ"]);
    assert(!validateSelection(3, invalidSelection).ok, "首家出刻子时，没有刻子但有对子时不能全贴单");
    assert(validateSelection(3, legalSelection).ok, "首家出刻子时，有两对也只需要先跟一对");

    setFollowCase(
      [
        makeCard("lead-bulldozer-s3a", "spades", "3"),
        makeCard("lead-bulldozer-s3b", "spades", "3"),
        makeCard("lead-bulldozer-s3c", "spades", "3"),
        makeCard("lead-bulldozer-s4a", "spades", "4"),
        makeCard("lead-bulldozer-s4b", "spades", "4"),
        makeCard("lead-bulldozer-s4c", "spades", "4"),
      ],
      [
        makeCard("follow-bulldozer-s6a", "spades", "6"),
        makeCard("follow-bulldozer-s6b", "spades", "6"),
        makeCard("follow-bulldozer-s6c", "spades", "6"),
        makeCard("follow-bulldozer-s8a", "spades", "8"),
        makeCard("follow-bulldozer-s8b", "spades", "8"),
        makeCard("follow-bulldozer-s8c", "spades", "8"),
        makeCard("follow-bulldozer-s9a", "spades", "9"),
        makeCard("follow-bulldozer-s9b", "spades", "9"),
        makeCard("follow-bulldozer-sQ", "spades", "Q"),
      ]
    );
    followHand = state.players[2].hand;
    invalidSelection = pickCards(followHand, [
      "follow-bulldozer-s6a",
      "follow-bulldozer-s6b",
      "follow-bulldozer-s6c",
      "follow-bulldozer-s9a",
      "follow-bulldozer-s9b",
      "follow-bulldozer-sQ",
    ]);
    legalSelection = pickCards(followHand, [
      "follow-bulldozer-s6a",
      "follow-bulldozer-s6b",
      "follow-bulldozer-s6c",
      "follow-bulldozer-s8a",
      "follow-bulldozer-s8b",
      "follow-bulldozer-s8c",
    ]);
    assert(!validateSelection(3, invalidSelection).ok, "首家出推土机时，手里有两副刻子就不能只跟一副刻子");
    assert(validateSelection(3, legalSelection).ok, "首家出推土机时，有两副刻子应允许跟两副刻子");

    setFollowCase(
      [
        makeCard("lead-bulldozer-h7a", "diamonds", "7"),
        makeCard("lead-bulldozer-h7b", "diamonds", "7"),
        makeCard("lead-bulldozer-h7c", "diamonds", "7"),
        makeCard("lead-bulldozer-h8a", "diamonds", "8"),
        makeCard("lead-bulldozer-h8b", "diamonds", "8"),
        makeCard("lead-bulldozer-h8c", "diamonds", "8"),
        makeCard("lead-bulldozer-h9a", "diamonds", "9"),
        makeCard("lead-bulldozer-h9b", "diamonds", "9"),
        makeCard("lead-bulldozer-h9c", "diamonds", "9"),
      ],
      [
        makeCard("follow-bulldozer-dJa", "diamonds", "J"),
        makeCard("follow-bulldozer-dJb", "diamonds", "J"),
        makeCard("follow-bulldozer-dQa", "diamonds", "Q"),
        makeCard("follow-bulldozer-dQb", "diamonds", "Q"),
        makeCard("follow-bulldozer-dKa", "diamonds", "K"),
        makeCard("follow-bulldozer-dKb", "diamonds", "K"),
        makeCard("follow-bulldozer-dA", "diamonds", "A"),
        makeCard("follow-bulldozer-d10", "diamonds", "10"),
        makeCard("follow-bulldozer-d3", "diamonds", "3"),
        makeCard("follow-bulldozer-d4", "diamonds", "4"),
        makeCard("follow-bulldozer-d5", "diamonds", "5"),
      ]
    );
    followHand = state.players[2].hand;
    invalidSelection = pickCards(followHand, [
      "follow-bulldozer-dJa",
      "follow-bulldozer-dJb",
      "follow-bulldozer-dQa",
      "follow-bulldozer-dKa",
      "follow-bulldozer-dA",
      "follow-bulldozer-d10",
      "follow-bulldozer-d3",
      "follow-bulldozer-d4",
      "follow-bulldozer-d5",
    ]);
    legalSelection = pickCards(followHand, [
      "follow-bulldozer-dJa",
      "follow-bulldozer-dJb",
      "follow-bulldozer-dQa",
      "follow-bulldozer-dQb",
      "follow-bulldozer-dA",
      "follow-bulldozer-d10",
      "follow-bulldozer-d3",
      "follow-bulldozer-d4",
      "follow-bulldozer-d5",
    ]);
    assert(!validateSelection(3, invalidSelection).ok, "首家出长推土机时，没有刻子但有三对时不能只跟一对");
    assert(validateSelection(3, legalSelection).ok, "首家出长推土机时，没有刻子时跟到两对就够，不需要凑三对");

    globalThis.__followStructureRuleResults = {
      tractor: "two-pair fallback locked",
      train: "tractor-first fallback locked",
      spaceship: "longest-train fallback locked",
      triple: "single-pair fallback locked",
      bulldozerTriples: "two-triple fallback locked",
      bulldozerPairs: "two-pair cap locked",
    };
  `;

  vm.runInContext(testSource, context, { filename: "follow-structure-rules-inline.js" });
  return context.__followStructureRuleResults;
}

const context = loadGameContext();
const output = runSuite(context);

console.log("Follow-structure rule regression passed:");
console.log(`- tractor: ${output.tractor}`);
console.log(`- train: ${output.train}`);
console.log(`- spaceship: ${output.spaceship}`);
console.log(`- triple: ${output.triple}`);
console.log(`- bulldozer triples: ${output.bulldozerTriples}`);
console.log(`- bulldozer pairs: ${output.bulldozerPairs}`);
