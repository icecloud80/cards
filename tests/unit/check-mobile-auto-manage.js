const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * mobile 托管回归既要加载 shared 脚本，也要允许按钮状态切换；
 * 这里保留最小 `classList` 实现，就能在无浏览器环境下验证三态托管逻辑。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可供 DOM 桩复用的类名对象。
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
 * 创建一个足够支撑 mobile + shared 脚本加载的元素桩对象。
 *
 * 为什么这样写：
 * 这条回归只需要验证托管按钮和共享状态机，不需要真实浏览器布局；
 * 统一用轻量元素桩，可以避免因为缺失 DOM API 而让测试偏离核心目标。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 带最小字段和事件能力的元素桩对象。
 *
 * 注意：
 * - `setAttribute` 需要把值写回对象，方便断言按钮状态。
 * - `querySelector` 与 `querySelectorAll` 这里只返回空集合即可。
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
      return this.attributes[name];
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
 * 构建一份能执行 shared 托管状态机的 mobile 测试上下文。
 *
 * 为什么这样写：
 * 用户这次要求的是“mobile 托管也要改成三态”，
 * 所以不仅要锁住 `index2.html` 的桥接代码，还要确认 mobile 平台实际共用的 shared 状态机确实保留
 * `关闭 / 本局托管 / 跨局托管` 的生命周期。
 *
 * 输入：
 * @param {void} - 通过内部固定脚本路径加载 mobile 环境。
 *
 * 输出：
 * @returns {{state: object, setupGame: Function, getPlayer: Function, getAutoManageMode: Function, getAutoManageModeLabel: Function, getNextAutoManageMode: Function, applyAutoManagedState: Function}} 托管回归需要的真实接口集合。
 *
 * 注意：
 * - `render` 会被替换成 no-op，避免本测试被完整 UI 渲染噪音干扰。
 * - `document.querySelector(".table")` 需要返回元素桩，防止布局相关逻辑取空。
 */
function loadMobileAutoManageContext() {
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
    path.join(__dirname, "../../src/platform/mobile.js"),
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

  vm.runInContext("render = function renderNoop() {};", context);

  return vm.runInContext("({ state, setupGame, getPlayer, getAutoManageMode, getAutoManageModeLabel, getNextAutoManageMode, applyAutoManagedState })", context);
}

/**
 * 作用：
 * 执行 mobile 三态托管回归断言。
 *
 * 为什么这样写：
 * 这次修的是“shared 已经三态，但 mobile 壳层还停留在二态”的对齐问题；
 * 因此测试既要锁住 `index2.html` 的桥接入口，也要锁住 shared 生命周期里的“本局重置 / 跨局保留”。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - `round` 必须在新局开始时回到关闭。
 * - `persistent` 必须跨局保留，并继续让玩家 1 维持托管。
 */
function main() {
  const indexHtml = fs.readFileSync(path.join(__dirname, "../../index2.html"), "utf8");
  assert.match(indexHtml, /id="mobileAutoBtn"[^>]*aria-label="托管：关闭"[^>]*title="托管：关闭"/, "mobile 顶部托管按钮默认文案应回到关闭状态");
  assert.equal(indexHtml.includes("mobile-icon-btn.persistent"), true, "mobile 顶部托管按钮应给跨局托管提供独立样式");
  assert.equal(indexHtml.includes("function syncMobileAutoManagedButton()"), true, "mobile 壳层应通过专用 helper 同步三态托管按钮");
  assert.equal(indexHtml.includes("getAutoManageModeLabel"), true, "mobile 壳层应复用 shared 托管模式文案 helper");
  assert.match(indexHtml, /getNextAutoManageMode\(\)[\s\S]*applyAutoManagedState\(nextMode\)/, "mobile 点击托管按钮时应按 shared 三态顺序循环");

  const context = loadMobileAutoManageContext();
  context.setupGame();
  assert.equal(context.getAutoManageMode(), "off", "新局默认应从关闭托管开始");
  assert.equal(context.getAutoManageModeLabel(), "关闭", "关闭态文案应稳定返回关闭");
  assert.equal(context.getNextAutoManageMode(), "round", "关闭后第一次点击应进入本局托管");

  context.applyAutoManagedState("round");
  assert.equal(context.getAutoManageMode(), "round", "本局托管应写回共享状态");
  assert.equal(context.getPlayer(1).isHuman, false, "本局托管应立即让玩家 1 交给 AI 接管");
  assert.equal(context.getAutoManageModeLabel(), "本局托管", "round 模式文案应稳定返回本局托管");

  context.setupGame();
  assert.equal(context.getAutoManageMode(), "off", "进入下一局时本局托管应自动回到关闭");
  assert.equal(context.getPlayer(1).isHuman, true, "本局托管跨局后应恢复为人类控制");

  context.applyAutoManagedState("persistent");
  assert.equal(context.getAutoManageMode(), "persistent", "跨局托管应写回共享状态");
  assert.equal(context.getAutoManageModeLabel(), "跨局托管", "persistent 模式文案应稳定返回跨局托管");
  assert.equal(context.getPlayer(1).isHuman, false, "跨局托管应立即接管当前玩家");

  context.setupGame();
  assert.equal(context.getAutoManageMode(), "persistent", "跨局托管进入下一局后必须继续保留");
  assert.equal(context.getPlayer(1).isHuman, false, "跨局托管跨局后玩家 1 仍应继续交给 AI");
}

main();
