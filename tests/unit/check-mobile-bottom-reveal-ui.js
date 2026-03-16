const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * 手游翻底公示层的共享渲染会频繁调用 `classList.toggle/add/remove`；
 * 这里保留最小实现，就能在无浏览器环境下锁住新按钮态和面板显隐逻辑。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可供元素桩复用的类名对象。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只实现当前回归会用到的最小接口。
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
 * 生成一个足够支撑 mobile 共享脚本加载的元素桩。
 *
 * 为什么这样写：
 * 这条回归只关心翻底公示层的 DOM 状态，不需要真实浏览器布局；
 * 用轻量元素桩即可覆盖按钮属性、面板显隐和卡位生成数量。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 带有最小字段和方法的元素桩对象。
 *
 * 注意：
 * - `setAttribute/getAttribute` 需要成对实现，方便检查无障碍文案。
 * - `style.setProperty` 保留为空写入接口，避免共享脚本报错。
 */
function createElementStub(identifier) {
  const attributes = new Map();
  return {
    id: identifier,
    dataset: {},
    className: "",
    style: {
      setProperty(name, value) {
        this[name] = value;
      },
    },
    children: [],
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    hidden: false,
    classList: createClassListStub(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
  };
}

/**
 * 作用：
 * 载入一份只服务手游翻底公示回归的真实共享脚本上下文。
 *
 * 为什么这样写：
 * 这轮改动同时动了 `index2.html` 结构和 `src/shared/ui.js` 渲染；
 * 直接加载真实脚本，才能确保按钮读秒态和卡位渲染没有在共享层里走样。
 *
 * 输入：
 * @param {void} - 通过内部固定路径加载 mobile 环境。
 *
 * 输出：
 * @returns {{setupGame: Function, renderBottomRevealCenter: Function, state: object, document: object}} 当前测试需要的真实接口集合。
 *
 * 注意：
 * - `document.querySelector(".table")` 必须返回元素桩，避免布局相关逻辑报空。
 * - 这里只验证结构和渲染状态，不做像素级样式断言。
 */
function loadMobileBottomRevealContext() {
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
  ];

  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  vm.runInContext(`
    function isHumanTurnActive() {
      return !state.gameOver && state.phase === "playing" && state.currentTurnId === 1;
    }
  `, context);

  return vm.runInContext("({ setupGame, renderBottomRevealCenter, state, document })", context);
}

/**
 * 作用：
 * 创建一张适合手游翻底公示回归使用的测试牌。
 *
 * 为什么这样写：
 * 公示渲染只依赖花色、点数和唯一 ID；
 * 用统一工厂函数能让 7 张底牌样本更紧凑，也更容易看懂断言含义。
 *
 * 输入：
 * @param {string} suit - 当前牌的花色。
 * @param {string} rank - 当前牌的点数。
 * @param {number} index - 当前牌在样本里的顺序号。
 *
 * 输出：
 * @returns {{id: string, suit: string, rank: string}} 可直接塞进 `state.bottomCards` 的测试牌对象。
 *
 * 注意：
 * - 这里不需要图片路径，展示层会自己根据牌面主题解析资源。
 * - `id` 只要在样本里唯一即可。
 */
function createBottomCard(suit, rank, index) {
  return {
    id: `bottom-mobile-${index}`,
    suit,
    rank,
  };
}

/**
 * 作用：
 * 执行手游翻底公示 UI 回归断言。
 *
 * 为什么这样写：
 * 这次需求明确要求手机端把翻底公示改成更轻的浮层、牌位上移，
 * 并把读秒按钮放到底牌下方、另补一个右上角 `X`；如果后续有人把结构改回旧版，
 * 这条回归会第一时间提示按钮和渲染状态退化。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里只锁结构和渲染状态，不检查具体像素位置。
 * - `is-urgent` 断言用于保证剩余 5 秒时仍会切到强调态。
 */
function main() {
  const html = fs.readFileSync(path.join(__dirname, "../../index2.html"), "utf8");
  assert.equal(html.includes('class="bottom-reveal-kicker">翻底公示</span>'), true, "手游翻底公示层应补入阶段短标签");
  assert.equal(html.includes('id="closeBottomRevealPanelBtn"'), true, "手游翻底公示层应保留右上角独立 X 关闭按钮");
  assert.equal(html.includes('aria-label="关闭翻底展示面板"'), true, "手游翻底公示层右上角 X 按钮应保留独立关闭语义");
  assert.match(
    html,
    /\.bottom-reveal-panel-close\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*0;[\s\S]*right:\s*0;/,
    "手游翻底公示层右上角 X 按钮应固定在 panel 的右上角"
  );
  assert.match(
    html,
    /id="closeBottomRevealBtn"[\s\S]*bottom-reveal-close-label">关闭<\/span>[\s\S]*id="bottomRevealTimer"[\s\S]*s\)<\/span>/,
    "手游翻底公示层应把关闭按钮改成 `关闭 \\(12s\\)` 这种一体化读秒样式"
  );
  assert.equal(
    html.indexOf('id="bottomRevealCards"') < html.indexOf('id="closeBottomRevealBtn"'),
    true,
    "手游翻底公示层里底牌区应排在读秒关闭按钮上方"
  );

  const context = loadMobileBottomRevealContext();
  context.setupGame();
  context.state.phase = "bottomReveal";
  context.state.countdown = 17;
  context.state.bottomRevealMessage = "无人亮主，由玩家1翻底定主。";
  context.state.declaration = {
    suit: "diamonds",
    rank: "2",
    revealCount: 2,
  };
  context.state.bottomRevealCount = 2;
  context.state.bottomCards = [
    createBottomCard("diamonds", "2", 0),
    createBottomCard("spades", "A", 1),
    createBottomCard("clubs", "K", 2),
    createBottomCard("hearts", "10", 3),
    createBottomCard("spades", "9", 4),
    createBottomCard("clubs", "7", 5),
    createBottomCard("hearts", "5", 6),
  ];

  context.renderBottomRevealCenter();

  const bottomRevealCenter = context.document.getElementById("bottomRevealCenter");
  const closeButton = context.document.getElementById("closeBottomRevealBtn");
  const bottomRevealText = context.document.getElementById("bottomRevealText");
  const bottomRevealTimer = context.document.getElementById("bottomRevealTimer");
  const bottomRevealCards = context.document.getElementById("bottomRevealCards");

  assert.equal(bottomRevealCenter.classList.contains("hidden"), false, "进入翻底阶段后应显示手游翻底公示层");
  assert.equal(bottomRevealText.textContent, "无人亮主，由玩家1翻底定主。", "手游翻底公示层应写入最新说明文案");
  assert.equal(bottomRevealTimer.textContent, "17", "关闭按钮内的读秒应同步当前倒计时");
  assert.equal(closeButton.dataset.countdown, "17", "关闭按钮应同步写入当前倒计时数据");
  assert.equal(closeButton.classList.contains("is-urgent"), false, "倒计时还充足时不应提前切到紧急态");
  assert.equal(closeButton.getAttribute("aria-label")?.includes("17 秒"), true, "关闭按钮的无障碍文案应带上当前倒计时");
  assert.equal(bottomRevealCards.children.length, 7, "手游翻底公示层应继续保留 7 个固定底牌卡位");

  context.state.countdown = 5;
  context.renderBottomRevealCenter();
  assert.equal(closeButton.classList.contains("is-urgent"), true, "剩余 5 秒及以下时关闭按钮应切到紧急态");
}

main();
