const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * 共享脚本加载和渲染时都会访问 `classList`；
 * 这里保留最小实现，就能在无浏览器环境下验证手游开局入口是否仍可工作。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可复用的类名桩对象。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只实现本测试需要的最小接口。
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
 * 创建一个足够支撑 shared + mobile 启动逻辑的元素桩对象。
 *
 * 为什么这样写：
 * 这条回归要模拟手游页面点“开始游戏”时对隐藏原始按钮的转发，
 * 因此元素既要记录监听器，也要支持 `.click()` 主动触发绑定逻辑。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 一个带最小字段和事件能力的元素桩对象。
 *
 * 注意：
 * - `dispatchEvent` 只触发同名监听器，满足这条回归即可。
 * - `querySelector` 与 `querySelectorAll` 返回空即可，不做复杂 DOM 解析。
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
    listeners: {},
    classList: createClassListStub(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute() {},
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
 * 载入一份真实的手游共享脚本上下文。
 *
 * 为什么这样写：
 * 这次问题发生在 `renderCenterPanel()` 与 `main.js` 的按钮桥接上，
 * 直接用 VM 加载真实脚本，才能确认修复后 ready 阶段真的能从按钮点击进入发牌。
 *
 * 输入：
 * @param {void} - 通过内部固定脚本路径加载 mobile 环境。
 *
 * 输出：
 * @returns {{state: object, dom: object, setupGame: Function, render: Function}} 供断言使用的真实接口集合。
 *
 * 注意：
 * - `document.querySelector(".table")` 必须返回元素桩，避免布局代码报空。
 * - `setTimeout` 这里只记录句柄，不自动执行回调，避免把发牌流程直接跑完。
 */
function loadMobileStartContext() {
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

  return vm.runInContext("({ state, dom, setupGame, render, startNewProgress, continueSavedProgress })", context);
}

/**
 * 作用：
 * 执行手游 ready 阶段开始入口回归断言。
 *
 * 为什么这样写：
 * 手游壳层已经改成直接调用共享开局 helper；
 * 只要 ready 阶段的 helper 不能正常推进到发牌，手机端就会出现“点开始没反应”。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 断言全部通过后正常退出。
 *
 * 注意：
 * - 这里只锁住手游 ready 阶段的共享开局入口，不检查 PC 的独立开始界面。
 * - 若后续再次改 shared 开局 helper 的边界，这条回归必须能第一时间报错。
 */
function main() {
  const context = loadMobileStartContext();
  context.setupGame();
  context.render();

  assert.equal(context.state.phase, "ready", "手游上下文初始化后应停留在 ready 阶段");
  context.continueSavedProgress(true);
  assert.equal(context.state.phase, "ready", "无存档时继续游戏 helper 不应误把手游上下文推进到发牌阶段");

  context.startNewProgress(true);

  assert.equal(context.state.phase, "dealing", "调用手游开局 helper 后应立即进入发牌阶段");
}

main();
