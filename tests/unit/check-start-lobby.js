const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * `config.js` 和 `game.js` 在加载过程中会访问 `classList`，这里需要提供最小兼容实现，
 * 让测试可以只关注开始界面显示条件，而不必引入完整 DOM 环境。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可复用的类名桩。
 *
 * 注意：
 * - 这里只保留本测试需要的最小接口。
 * - `toggle` 需要兼容第二个布尔参数。
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
 * 创建一个最小可用的 DOM 元素桩对象。
 *
 * 为什么这样写：
 * 共享脚本采用浏览器全局脚本风格，加载时会缓存大量 DOM 节点；
 * 用统一元素桩可以让测试只验证开始界面显示逻辑，不受真实浏览器限制。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 一个带最小属性和方法的元素桩。
 *
 * 注意：
 * - 文本、样式和类名字段都需要可写。
 * - 这里只实现测试会用到的最小能力。
 */
function createElementStub(identifier) {
  return {
    id: identifier,
    dataset: {},
    style: {},
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
 * 为指定平台加载一套最小游戏上下文。
 *
 * 为什么这样写：
 * `shouldShowPcReadyLobby()` 依赖 `APP_PLATFORM` 和全局 `state`；
 * 这里直接用 VM 加载真实脚本，能以最低成本验证新 UI 规则没有被改坏。
 *
 * 输入：
 * @param {"pc"|"mobile"} platform - 本次上下文要模拟的平台。
 *
 * 输出：
 * @returns {{setupGame: Function, shouldShowPcReadyLobby: Function, shouldShowPcToolbarMenu: Function, state: object}} 供断言使用的真实业务接口。
 *
 * 注意：
 * - 只加载这条规则所需的最小脚本集合，避免把无关 UI 依赖也拉进来。
 * - `document.querySelector(".table")` 会返回一个元素桩，避免布局代码报空。
 */
function loadLobbyContext(platform) {
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
    render() {},
    renderScorePanel() {},
    renderHand() {},
    renderCenterPanel() {},
    renderBottomRevealCenter() {},
    renderLastTrick() {},
    renderLogs() {},
    updateActionHint() {},
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
    CustomEvent: function CustomEvent(type, eventOptions = {}) {
      return { type, detail: eventOptions.detail };
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
    Math,
  };
  context.window = context;
  context.globalThis = context;

  vm.createContext(context);

  const files = [
    path.join(__dirname, "../../src/platform", `${platform}.js`),
    path.join(__dirname, "../../src/shared/config.js"),
    path.join(__dirname, "../../src/shared/rules.js"),
    path.join(__dirname, "../../src/shared/text.js"),
    path.join(__dirname, "../../src/shared/game.js"),
  ];

  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  return vm.runInContext("({ setupGame, shouldShowPcReadyLobby, shouldShowPcToolbarMenu, state })", context);
}

/**
 * 作用：
 * 断言 PC 开始界面的显示条件符合预期。
 *
 * 为什么这样写：
 * 这次桌面端新增了 ready 阶段的独立开始界面，后续如果有人改 ready 流程，
 * 很容易把显示条件误改掉，需要一条小回归把平台和阶段边界锁住。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 断言通过后退出。
 *
 * 注意：
 * - 这里只验证显示条件，不验证具体 DOM 样式。
 * - mobile 必须始终返回 `false`，避免把 PC 开始界面带到手机端。
 */
function main() {
  const pc = loadLobbyContext("pc");
  pc.setupGame();
  assert.equal(pc.shouldShowPcReadyLobby(), true, "PC 在 ready 阶段应显示开始界面");
  assert.equal(pc.shouldShowPcToolbarMenu(), false, "PC 在 ready 阶段不应显示更多功能菜单");

  pc.state.phase = "dealing";
  assert.equal(pc.shouldShowPcReadyLobby(), false, "PC 离开 ready 阶段后不应继续显示开始界面");
  assert.equal(pc.shouldShowPcToolbarMenu(), false, "PC 未展开菜单时不应显示更多功能菜单");

  pc.state.showToolbarMenu = true;
  assert.equal(pc.shouldShowPcToolbarMenu(), true, "PC 在局中展开菜单后应显示更多功能菜单");

  pc.state.phase = "ready";
  pc.state.gameOver = true;
  assert.equal(pc.shouldShowPcReadyLobby(), false, "PC 若处于 gameOver，不应显示开始界面");
  assert.equal(pc.shouldShowPcToolbarMenu(), false, "PC 若处于 gameOver，不应显示更多功能菜单");

  const mobile = loadLobbyContext("mobile");
  mobile.setupGame();
  assert.equal(mobile.shouldShowPcReadyLobby(), false, "mobile 不应显示 PC 开始界面");
  mobile.state.phase = "playing";
  mobile.state.showToolbarMenu = true;
  assert.equal(mobile.shouldShowPcToolbarMenu(), false, "mobile 不应显示 PC 的更多功能菜单");
}

main();
