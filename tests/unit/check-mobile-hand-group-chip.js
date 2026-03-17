const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * shared 层在渲染手牌时会频繁读写 `classList`；
 * 这里复用轻量桩实现，可以让测试专注在 mobile 花色标签文案，而不必引入完整浏览器环境。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 供元素桩使用的类名接口。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只保留当前测试会用到的最小行为。
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
 * 创建一个足够支撑 shared UI 渲染的元素桩。
 *
 * 为什么这样写：
 * 这条回归只关心手游手牌分组标签里是否还带计数；
 * 统一用可写的元素桩就能跑到真实 `renderHand`，同时保持测试上下文很轻。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 带有最小字段和方法的 DOM 元素桩。
 *
 * 注意：
 * - 给 `innerHTML` 加 setter 是为了兼容 shared 层用它清空旧节点。
 * - `appendChild` 需要保留顺序，方便后面直接检查第一个子节点是不是花色标签。
 */
function createElementStub(identifier) {
  const element = {
    id: identifier,
    dataset: {},
    children: [],
    style: {
      setProperty(name, value) {
        this[name] = value;
      },
    },
    value: "",
    disabled: false,
    hidden: false,
    className: "",
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

  let innerHtmlValue = "";
  Object.defineProperty(element, "innerHTML", {
    get() {
      return innerHtmlValue;
    },
    set(value) {
      innerHtmlValue = String(value);
      if (value === "") {
        this.children = [];
      }
    },
  });

  let textContentValue = "";
  Object.defineProperty(element, "textContent", {
    get() {
      return textContentValue;
    },
    set(value) {
      textContentValue = String(value);
    },
  });

  return element;
}

/**
 * 作用：
 * 加载指定平台的 shared UI 测试上下文。
 *
 * 为什么这样写：
 * 这次需求明确只改 mobile，而 PC 不能跟着退化；
 * 同一个 helper 分别加载 mobile / pc 平台脚本后，就能直接对比两端是否仍走各自的标签文案策略。
 *
 * 输入：
 * @param {"mobile"|"pc"} platform - 当前要加载的平台。
 *
 * 输出：
 * @returns {{setupGame: Function, renderHand: Function, getPlayer: Function, buildHandGroupChipMarkup: Function, state: object, document: object}} 当前平台对应的真实接口集合。
 *
 * 注意：
 * - `.table` 查询需要返回元素桩，避免布局相关逻辑取空。
 * - `isHumanTurnActive` 这里只保留最小真值实现，够本测试使用即可。
 */
function loadUiContext(platform) {
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
    path.join(__dirname, `../../src/platform/${platform}.js`),
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

  return vm.runInContext("({ setupGame, renderHand, getPlayer, buildHandGroupChipMarkup, state, document })", context);
}

/**
 * 作用：
 * 执行手游手牌花色标签回归断言。
 *
 * 为什么这样写：
 * 用户要求 mobile 手牌区只保留花色文字，不再显示后面的张数；
 * 同时 PC 仍然需要数字帮助快速读牌，所以这里要同时锁住“mobile 无计数、PC 继续有计数”这两个结果。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - mobile 断言基于真实 `renderHand` 结果，而不是只测字符串 helper。
 * - PC 这里只锁住标签 helper 仍然带计数，避免误把整条桌面牌轨需求删掉。
 */
function main() {
  const mobile = loadUiContext("mobile");
  mobile.setupGame();

  const mobileHuman = mobile.getPlayer(1);
  mobile.state.phase = "playing";
  mobile.state.currentTurnId = 2;
  mobileHuman.hand = [
    { id: "m-rj", suit: "joker", rank: "RJ" },
    { id: "m-ha", suit: "hearts", rank: "A" },
    { id: "m-h9", suit: "hearts", rank: "9" },
    { id: "m-ck", suit: "clubs", rank: "K" },
  ];
  mobile.renderHand();

  const handGroups = mobile.document.getElementById("handGroups").children;
  assert.equal(handGroups.length > 0, true, "mobile 手牌区应渲染至少一个花色分组");
  for (const wrapper of handGroups) {
    const chip = wrapper.children[0];
    assert.equal(Boolean(chip), true, "每个手游手牌分组都应保留花色标签节点");
    assert.equal(chip.innerHTML.includes("group-chip-count"), false, "手游手牌分组标签不应再渲染计数节点");
  }

  const pc = loadUiContext("pc");
  const pcChipMarkup = pc.buildHandGroupChipMarkup("黑桃", 4, true);
  assert.equal(pcChipMarkup.includes("group-chip-count"), true, "PC 花色标签仍应保留计数节点");

  const mobileChipMarkup = mobile.buildHandGroupChipMarkup("黑桃", 4, false);
  assert.equal(mobileChipMarkup, "<span>黑桃</span>", "手游花色标签 helper 应只输出花色文字");
}

main();
