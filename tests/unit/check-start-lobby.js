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
    title: "",
    listeners: {},
    attributes: {},
    classList: createClassListStub(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      this[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    removeEventListener(type) {
      delete this.listeners[type];
    },
    dispatchEvent(event) {
      const handler = this.listeners[event?.type];
      if (handler) {
        handler.call(this, event);
      }
      return true;
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
    click() {
      if (this.disabled) return;
      const handler = this.listeners.click;
      if (handler) {
        handler.call(this, { currentTarget: this, target: this, preventDefault() {} });
      }
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
    Event: function Event(type) {
      return { type };
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
    CustomEvent: function CustomEvent(type, eventOptions = {}) {
      return { type, detail: eventOptions.detail };
    },
    makeFloatingPanel() {},
    getLayoutElements() {
      return [];
    },
    makeLayoutEditable() {},
    applySavedLayoutState() {},
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
    path.join(__dirname, "../../src/platform", `${platform}.js`),
    path.join(__dirname, "../../src/shared/config.js"),
    path.join(__dirname, "../../src/shared/rules.js"),
    path.join(__dirname, "../../src/shared/text.js"),
    path.join(__dirname, "../../src/shared/game.js"),
    path.join(__dirname, "../../src/shared/ui.js"),
    path.join(__dirname, "../../src/shared/main.js"),
  ];

  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  return vm.runInContext("({ document, dom, render, setupGame, refreshSavedProgressAvailability, continueSavedProgressFromReadyEntry, openRulesHelpPanel, shouldShowPcReadyLobby, shouldShowPcToolbarMenu, state })", context);
}

/**
 * 作用：
 * 生成一段可被 `loadProgressFromCookie()` 正常读取的进度 cookie 文本。
 *
 * 为什么这样写：
 * “继续游戏”入口是否可点、点击后能否真正继续，都依赖真实 cookie 内容；
 * 这里复用生产格式生成测试值，能避免单测自己发明一套和运行态不一致的存档结构。
 *
 * 输入：
 * @param {Record<string, string>} levels - 本次要写入 cookie 的玩家等级映射。
 * @param {"pc"|"mobile"} [platform="pc"] - 当前要模拟的平台键值。
 *
 * 输出：
 * @returns {string} 可直接写入 `document.cookie` 的进度 cookie 文本。
 *
 * 注意：
 * - key 名必须和生产常量 `five_friends_progress` 保持一致。
 * - 这里只生成单条 cookie 文本，不负责追加其它 cookie 字段。
 */
function buildSavedProgressCookie(levels, platform = "pc") {
  return `five-friends-progress-${platform}-v1=${encodeURIComponent(JSON.stringify({
    playerLevels: levels,
    savedAt: 1234567890,
  }))}`;
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
  pc.render();
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

  const savedLevels = {
    1: "9",
    2: "J",
    3: "Q",
    4: "K",
    5: "A",
  };

  pc.state.gameOver = false;
  pc.document.cookie = buildSavedProgressCookie(savedLevels, "pc");
  pc.refreshSavedProgressAvailability();
  pc.setupGame();
  pc.render();
  assert.equal(pc.dom.startLobbyContinueBtn.disabled, false, "PC 开始界面的继续游戏在有存档时应可点击");
  pc.dom.startLobbyContinueBtn.click();
  assert.equal(pc.state.phase, "dealing", "PC 点击继续游戏后应立即进入发牌阶段");
  assert.equal(JSON.stringify(pc.state.playerLevels), JSON.stringify(savedLevels), "PC 点击继续游戏后应恢复存档等级");

  pc.setupGame();
  pc.render();
  pc.dom.startLobbyRulesBtn.click();
  assert.equal(pc.state.showRulesPanel, true, "PC 首页查看规则按钮应打开规则帮助面板");
  assert.equal(pc.dom.rulesPanel.classList.contains("hidden"), false, "PC 首页查看规则按钮打开后，规则面板不应继续隐藏");

  const mobile = loadLobbyContext("mobile");
  mobile.setupGame();
  assert.equal(mobile.shouldShowPcReadyLobby(), false, "mobile 不应显示 PC 开始界面");
  mobile.state.phase = "playing";
  mobile.state.showToolbarMenu = true;
  assert.equal(mobile.shouldShowPcToolbarMenu(), false, "mobile 不应显示 PC 的更多功能菜单");
}

main();
