const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * 共享脚本在加载和渲染时都会访问 `classList`；
 * 这里保留最小实现，就能在无浏览器环境下验证 mobile 渲染结构是否被 PC 改动误伤。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可复用的类名桩对象。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只实现本测试用到的最小接口。
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
 * 生成一个足够支撑共享脚本加载的元素桩。
 *
 * 为什么这样写：
 * 这条回归只关心手游共享渲染产出的 HTML 结构和文本，
 * 不需要真实浏览器布局；统一元素桩可以把测试聚焦在结构是否被改坏。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 一个带最小字段和方法的元素桩对象。
 *
 * 注意：
 * - `innerHTML`、`textContent` 和 `classList` 都需要可写。
 * - `querySelector` 这里不做复杂解析，因为本测试直接检查字符串结果。
 */
function createElementStub(identifier) {
  return {
    id: identifier,
    dataset: {},
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
    setAttribute() {},
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
 * 载入一份 mobile 共享渲染测试上下文。
 *
 * 为什么这样写：
 * 这次问题来自 `src/shared/ui.js` 的共享层回归，
 * 直接用 VM 加载真实脚本，才能确保我们验证的是手游真实会吃到的 DOM 结构。
 *
 * 输入：
 * @param {void} - 通过内部固定脚本路径加载 mobile 环境。
 *
 * 输出：
 * @returns {{setupGame: Function, document: object}} 当前测试需要的真实接口集合。
 *
 * 注意：
 * - `document.querySelector(".table")` 必须返回元素桩，避免布局相关逻辑报空。
 * - 这里只验证结构，不需要额外注入 PC 专用节点。
 */
function loadMobileUiContext() {
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

  return vm.runInContext("({ setupGame, document })", context);
}

/**
 * 作用：
 * 执行 mobile 共享层隔离回归断言。
 *
 * 为什么这样写：
 * 这轮 PC 的共享层改动曾把手游出牌区和玩家面板结构带坏；
 * 这里把手游仍需依赖的几个关键结构锁住，后续只要有人再把 PC DOM 结构扩散到 mobile，就会立即报错。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里只验证手游依赖的 DOM 结构是否还在，不检查样式像素。
 * - 断言优先覆盖 `.label`、`role-badge / seat-stats` 和 `handSummary` 三个关键依赖点。
 */
function main() {
  const context = loadMobileUiContext();
  context.setupGame();

  const trickSpot = context.document.getElementById("trickSpot-1");
  const playerSeat = context.document.getElementById("playerSeat-1");
  const handSummary = context.document.getElementById("handSummary");

  assert.equal(trickSpot.innerHTML.includes('class="label"'), true, "手游出牌区应继续保留 `.label` 标题结构");
  assert.equal(trickSpot.innerHTML.includes("spot-head"), false, "手游出牌区不应吃到 PC 的 `spot-head` 结构");
  assert.equal(playerSeat.innerHTML.includes("role-badge"), true, "手游玩家面板应继续保留 `role-badge` 结构");
  assert.equal(playerSeat.innerHTML.includes("seat-stats"), true, "手游玩家面板应继续保留手牌/分数统计结构");
  assert.equal(handSummary.textContent.length > 0, true, "手游手牌区应继续写入操作摘要文案");
}

main();
