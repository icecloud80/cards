const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * 共享脚本在加载、渲染和事件响应里都会读写 `classList`；
 * 这里保留最小实现，就能把回归重点放在“亮牌候选项是否完整列出”本身，
 * 不需要引入真正的浏览器环境。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可复用的类名桩对象。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只实现本测试会用到的最小接口。
 */
function createClassListStub() {
  const values = new Set();
  return {
    add(...tokens) {
      tokens.forEach((token) => values.add(token));
    },
    remove(...tokens) {
      tokens.forEach((token) => values.delete(token));
    },
    toggle(token, force) {
      if (typeof force === "boolean") {
        if (force) {
          values.add(token);
        } else {
          values.delete(token);
        }
        return force;
      }
      if (values.has(token)) {
        values.delete(token);
        return false;
      }
      values.add(token);
      return true;
    },
    contains(token) {
      return values.has(token);
    },
  };
}

/**
 * 作用：
 * 创建一个带事件监听能力的最小 DOM 元素桩对象。
 *
 * 为什么这样写：
 * 这条回归除了检查候选项文本，还要模拟“点击候选项再点击亮主按钮”的真实操作链；
 * 因此元素桩不仅要能存文本，还要能把监听器记下来并主动触发。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 一个带最小字段、事件监听和触发方法的元素桩对象。
 *
 * 注意：
 * - `style.setProperty` 必须存在，因为手牌渲染会写重叠变量。
 * - `trigger` 只服务本测试，不属于生产代码接口。
 */
function createElementStub(identifier) {
  const listeners = new Map();
  return {
    id: identifier,
    dataset: {},
    style: {
      setProperty() {},
    },
    children: [],
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    hidden: false,
    className: "",
    type: "",
    title: "",
    classList: createClassListStub(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    addEventListener(type, handler) {
      const bucket = listeners.get(type) || [];
      bucket.push(handler);
      listeners.set(type, bucket);
    },
    removeEventListener(type, handler) {
      const bucket = listeners.get(type) || [];
      listeners.set(type, bucket.filter((entry) => entry !== handler));
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    trigger(type, event = {}) {
      const bucket = listeners.get(type) || [];
      bucket.forEach((handler) => handler(event));
    },
  };
}

/**
 * 作用：
 * 加载一份包含真实共享脚本和点击绑定的 mobile 测试上下文。
 *
 * 为什么这样写：
 * 这次需求同时涉及规则枚举、UI 渲染和按钮交互；
 * 直接把 `game.js / ui.js / main.js` 一起加载进 VM，
 * 才能确保我们验证的是手游真实会走到的那条链路，而不是手写一份近似逻辑。
 *
 * 输入：
 * @param {void} - 通过内部固定脚本路径加载 mobile 环境。
 *
 * 输出：
 * @returns {{setupGame: Function, renderHand: Function, renderCenterPanel: Function, getAvailableSetupOptionsForPlayer: Function, getSetupOptionKey: Function, formatDeclaration: Function, getPlayer: Function, state: object, document: object}} 当前测试需要的真实接口集合。
 *
 * 注意：
 * - `document.querySelector(".table")` 必须返回元素桩，避免布局相关代码取空。
 * - 要加载 `main.js`，否则 `declareBtn` 和候选列表不会绑定真实点击事件。
 */
function loadMobileDeclarationContext() {
  const elements = new Map();

  function getElement(identifier) {
    if (!elements.has(identifier)) {
      elements.set(identifier, createElementStub(identifier));
    }
    return elements.get(identifier);
  }

  const document = {
    cookie: "",
    body: getElement("body"),
    getElementById(identifier) {
      return getElement(identifier);
    },
    querySelector(selector) {
      return selector === ".table" ? getElement("table") : null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tagName) {
      return createElementStub(tagName);
    },
    addEventListener() {},
    removeEventListener() {},
    execCommand() {
      return true;
    },
  };

  const context = {
    console,
    document,
    window: null,
    globalThis: null,
    CustomEvent: function CustomEvent(type, eventOptions = {}) {
      return { type, detail: eventOptions.detail };
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    navigator: {
      clipboard: {
        async writeText() {},
      },
    },
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {},
    },
    Blob: class BlobStub {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    Math,
  };
  context.window = context;
  context.globalThis = context;

  vm.createContext(context);

  const files = [
    path.join(__dirname, "../../src/platform/mobile.js"),
    path.join(__dirname, "../../src/shared/config.js"),
    path.join(__dirname, "../../src/shared/rules.js"),
    path.join(__dirname, "../../src/shared/text.js"),
    path.join(__dirname, "../../src/shared/game.js"),
    path.join(__dirname, "../../src/shared/ui.js"),
    path.join(__dirname, "../../src/shared/layout.js"),
    path.join(__dirname, "../../src/shared/main.js"),
  ];

  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  return vm.runInContext(
    "({ setupGame, renderHand, renderCenterPanel, getAvailableSetupOptionsForPlayer, getSetupOptionKey, formatDeclaration, getPlayer, state, document })",
    context
  );
}

/**
 * 作用：
 * 生成一张最小可用的测试牌对象。
 *
 * 为什么这样写：
 * 亮牌规则和 UI 这里只依赖 `id / suit / rank` 三个字段；
 * 用一个小 helper 统一造牌，能让测试场景更聚焦，不需要携带无关展示字段。
 *
 * 输入：
 * @param {string} id - 当前测试牌的唯一标识。
 * @param {string} suit - 当前测试牌的业务花色。
 * @param {string} rank - 当前测试牌的业务点数。
 *
 * 输出：
 * @returns {{id: string, suit: string, rank: string}} 可直接写入玩家手牌的最小测试牌对象。
 *
 * 注意：
 * - 这里只服务声明阶段，不额外补图片等展示字段。
 * - `id` 必须唯一，避免候选项 key 冲突。
 */
function makeCard(id, suit, rank) {
  return { id, suit, rank };
}

/**
 * 作用：
 * 把玩家1的手牌和声明阶段重置到指定测试场景。
 *
 * 为什么这样写：
 * 这条回归需要连续验证“无人亮主时列全选项”和“有人已亮后只列合法覆盖项”两种局面；
 * 单独抽成 helper 后，切换场景时就不用重复散落赋值。
 *
 * 输入：
 * @param {object} context - 当前 VM 上下文里暴露出的真实接口集合。
 * @param {object[]} hand - 要写给玩家1的测试手牌。
 * @param {?object} declaration - 当前牌桌已有的亮主；传 `null` 表示暂无。
 *
 * 输出：
 * @returns {void} 直接覆写当前共享状态。
 *
 * 注意：
 * - 这里会同步重置 `selectedSetupOptionKey`，避免上一场景的选择残留。
 * - 若存在当前亮主，需要同时同步 `levelRank` 和 `trumpSuit`。
 */
function seedDeclarationScenario(context, hand, declaration = null) {
  const human = context.getPlayer(1);
  human.hand = hand;
  context.state.phase = "dealing";
  context.state.gameOver = false;
  context.state.awaitingHumanDeclaration = false;
  context.state.selectedSetupOptionKey = null;
  context.state.declaration = declaration;
  context.state.levelRank = declaration?.rank || null;
  context.state.trumpSuit = declaration?.suit || "hearts";
}

/**
 * 作用：
 * 执行“亮牌候选项必须完整列出且可直接点击执行”的回归断言。
 *
 * 为什么这样写：
 * 这次改动的核心风险有两个：
 * 一是 3 张同花色级牌时，UI 只给 3 张方案、不把 2 张方案列出来；
 * 二是列表虽然渲染出来了，但点击亮牌按钮后仍保留旧的二次确认，而不是直接按所点方案亮主。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 所有断言通过后正常退出。
 *
 * 注意：
 * - 断言同时覆盖“完整列项”“只列合法覆盖项”“小王无主可直接点击执行”三件事。
 * - 这里用 mobile 上下文验证，因为用户反馈和目标交互都直接来自手机版。
 */
function main() {
  const context = loadMobileDeclarationContext();
  context.setupGame();

  seedDeclarationScenario(context, [
    makeCard("spade-1", "spades", "2"),
    makeCard("spade-2", "spades", "2"),
    makeCard("spade-3", "spades", "2"),
    makeCard("heart-1", "hearts", "2"),
    makeCard("heart-2", "hearts", "2"),
    makeCard("bj-1", "joker", "BJ"),
    makeCard("bj-2", "joker", "BJ"),
  ]);

  const allOptionLabels = context.getAvailableSetupOptionsForPlayer(1, "dealing").map((entry) => context.formatDeclaration(entry));
  assert.equal(
    JSON.stringify(allOptionLabels),
    JSON.stringify(["黑桃 2 x3", "2张小王", "黑桃 2 x2", "红桃 2 x2"]),
    "无人亮主时，应把当前所有合法亮牌选项都列给玩家，包括 3 张方案里的 2 张拆分选项"
  );

  context.renderHand();
  context.renderCenterPanel();
  const handSummary = context.document.getElementById("handSummary");
  const setupOptions = context.document.getElementById("setupOptions");
  const declareBtn = context.document.getElementById("declareBtn");
  assert.equal(handSummary.textContent.includes("黑桃 2 x3"), true, "手牌摘要应列出 3 张级牌亮主选项");
  assert.equal(handSummary.textContent.includes("黑桃 2 x2"), true, "手牌摘要应列出同花色级牌的 2 张亮主选项");
  assert.equal(handSummary.textContent.includes("2张小王"), true, "手牌摘要应列出小王无主选项");
  assert.equal(setupOptions.hidden, false, "有可亮方案时应显示候选列表");
  assert.equal(setupOptions.innerHTML.includes("亮主："), true, "亮主候选区左侧应带上清晰的“亮主：”前缀");
  assert.equal(setupOptions.innerHTML.includes("setup-option-card-stack"), true, "候选按钮应把声明方案压成叠牌预览");
  assert.equal(setupOptions.innerHTML.includes("setup-option-card"), true, "候选按钮应渲染缩略牌堆");
  assert.equal(setupOptions.innerHTML.includes("card-face-sprite") || setupOptions.innerHTML.includes("setup-option-card-face"), true, "候选按钮应显示真实牌面而不是纯文本");
  assert.equal(setupOptions.innerHTML.includes("2张小王"), false, "候选按钮不应再保留无主方案长文案");
  assert.equal(setupOptions.innerHTML.includes(">无<"), true, "候选按钮应用短标签表达无主");
  assert.equal(setupOptions.innerHTML.includes("亮黑桃 2 x2"), false, "候选按钮不应再使用长句式亮主文案");
  assert.equal(setupOptions.innerHTML.includes("可亮选项"), false, "亮主阶段不应再额外显示“可亮选项”标题");
  assert.equal(declareBtn.hidden, true, "亮主阶段不应再保留单独的确认亮主按钮");

  context.state.awaitingHumanDeclaration = true;
  context.renderHand();
  context.renderCenterPanel();
  assert.equal(
    context.document.getElementById("setupOptions").innerHTML.includes("不亮"),
    true,
    "等待补亮时，候选区应提供明确的“不亮”按钮"
  );

  context.document.getElementById("setupOptions").trigger("click", {
    target: {
      closest(selector) {
        if (selector !== "button[data-setup-pass]") return null;
        return { dataset: { setupPass: "declare" } };
      },
    },
  });

  assert.equal(context.state.phase, "bottomReveal", "点击“不亮”后应立即进入翻底定主展示阶段");
  assert.equal(context.state.awaitingHumanDeclaration, false, "点击“不亮”后应结束补亮等待状态");

  seedDeclarationScenario(context, [
    makeCard("spade-1", "spades", "2"),
    makeCard("spade-2", "spades", "2"),
    makeCard("spade-3", "spades", "2"),
    makeCard("heart-1", "hearts", "2"),
    makeCard("heart-2", "hearts", "2"),
    makeCard("bj-1", "joker", "BJ"),
    makeCard("bj-2", "joker", "BJ"),
  ], {
    playerId: 2,
    suit: "hearts",
    rank: "2",
    count: 2,
    cards: [makeCard("current-heart-1", "hearts", "2"), makeCard("current-heart-2", "hearts", "2")],
  });

  context.renderHand();
  context.renderCenterPanel();
  const legalOverrideLabels = context.getAvailableSetupOptionsForPlayer(1, "dealing").map((entry) => context.formatDeclaration(entry));
  assert.equal(
    JSON.stringify(legalOverrideLabels),
    JSON.stringify(["黑桃 2 x3", "2张小王"]),
    "已有两张花色主时，候选列表只应保留真正能压过去的亮牌方案"
  );
  assert.equal(context.document.getElementById("setupOptions").innerHTML.includes("黑桃 2 x2"), false, "被当前亮主压住的同档方案不应继续显示");

  const smallJokerOption = context.getAvailableSetupOptionsForPlayer(1, "dealing").find((entry) => entry.suit === "notrump" && entry.count === 2);
  const smallJokerKey = context.getSetupOptionKey(smallJokerOption);
  context.document.getElementById("setupOptions").trigger("click", {
    target: {
      closest(selector) {
        if (selector !== "button[data-setup-option-key]") return null;
        return { dataset: { setupOptionKey: smallJokerKey } };
      },
    },
  });

  assert.equal(context.state.declaration?.suit, "notrump", "确认亮主后应按玩家改选结果落成无主");
  assert.equal(context.state.declaration?.count, 2, "确认亮主后应保留玩家选择的 2 张无主档位");
  assert.equal(
    JSON.stringify((context.state.declaration?.cards || []).map((card) => card.rank)),
    JSON.stringify(["BJ", "BJ"]),
    "确认亮主后应使用玩家选中的两张小王作为无主声明牌"
  );
}

main();
