const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * 共享脚本会频繁调用 `classList.add/remove/toggle/contains`；
 * 这条回归只关心 PC 叫朋友窗口的状态切换，不需要完整浏览器实现，
 * 但仍要保证类名读写行为和真实 DOM 足够接近。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可供元素桩复用的类名对象。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只实现本测试会用到的最小接口，避免把测试环境做得过重。
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
 * 创建一个足够支撑共享脚本加载的 DOM 元素桩。
 *
 * 为什么这样写：
 * 这条回归要跑到真实的 `game.js + ui.js`，
 * 但只会触发顶部朋友牌、叫朋友面板和基础渲染逻辑；
 * 用轻量元素桩就能锁住业务行为，同时避免引入完整浏览器环境。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 具备最小字段和方法的元素桩对象。
 *
 * 注意：
 * - `style.setProperty` 需要可写，避免布局代码报错。
 * - `appendChild` / `setAttribute` / `querySelector` 都只需满足本测试的最小兼容。
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
    setAttribute(name, value) {
      this[name] = value;
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
 * 加载一份包含真实 PC 共享脚本的测试上下文。
 *
 * 为什么这样写：
 * 本次要验证的是“叫朋友 30 秒窗口”和“顶部朋友牌重开一次”的真实业务链路；
 * 直接用 VM 跑生产脚本，能确保断言的就是线上逻辑，而不是测试里手写的一份复制品。
 *
 * 输入：
 * @param {void} - 通过固定脚本路径加载 PC 平台所需文件。
 *
 * 输出：
 * @returns {{setupGame: Function, startCallingFriendPhase: Function, confirmFriendTargetSelection: Function, reopenFriendSelection: Function, canRetargetFriendSelection: Function, getFriendRetargetCountdownSeconds: Function, renderFriendPanel: Function, renderFriendPicker: Function, state: object, document: object}} 当前测试所需的真实接口。
 *
 * 注意：
 * - 这里只加载桌面端平台脚本，避免把移动端分支也带进来。
 * - `document.querySelector(".table")` 必须返回元素桩，避免布局相关逻辑取空。
 */
function loadPcFriendRetargetContext() {
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
    path.join(__dirname, "../../src/platform/pc.js"),
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

  return vm.runInContext(`({
    setupGame,
    startCallingFriendPhase,
    confirmFriendTargetSelection,
    reopenFriendSelection,
    canRetargetFriendSelection,
    getFriendRetargetCountdownSeconds,
    renderFriendPanel,
    renderFriendPicker,
    state,
    document
  })`, context);
}

/**
 * 作用：
 * 读取 PC 运行态页面源码，用来校验静态文案是否已同步。
 *
 * 为什么这样写：
 * 用户这次明确要把桌面端“找朋友”界面改成“叫朋友”；
 * 这类静态标题和按钮文案最稳的锁法，就是直接从 HTML 源码断言。
 *
 * 输入：
 * @param {void} - 通过固定路径读取 `index1.html`。
 *
 * 输出：
 * @returns {string} PC 页面完整源码字符串。
 *
 * 注意：
 * - 这里只校验 PC 页面，不覆盖 mobile。
 * - 找不到关键文案时必须直接失败，避免 UI 文案回退。
 */
function readPcHtml() {
  return fs.readFileSync(path.join(__dirname, "../../index1.html"), "utf8");
}

/**
 * 作用：
 * 执行 PC 叫朋友窗口与顶部重改入口的回归断言。
 *
 * 为什么这样写：
 * 这次需求同时涉及静态文案、面板读秒、顶部可重改一次，以及二次确认后恢复普通首手计时；
 * 需要一条专项回归把整条交互链路串起来，避免后续重构时只保住其中一半。
 *
 * 输入：
 * @param {void} - 通过内部上下文直接驱动真实共享脚本。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里不模拟真实秒表流逝，只验证窗口初始化、状态切换和文案渲染。
 * - “重改一次”必须在第二次确认后失效，并回到普通 15 秒首手倒计时。
 */
function main() {
  const html = readPcHtml();
  const context = loadPcFriendRetargetContext();

  assert.equal(html.includes('<div class="label">叫朋友</div>'), true, "PC 叫朋友面板标题应改为“叫朋友”");
  assert.equal(html.includes('>确认叫朋友</button>'), true, "PC 叫朋友面板确认按钮应改为“确认叫朋友”");

  context.setupGame();
  context.startCallingFriendPhase();
  context.renderFriendPicker();

  assert.equal(context.state.phase, "callingFriend", "打家叫朋友阶段应进入 callingFriend");
  assert.equal(context.getFriendRetargetCountdownSeconds(), 30, "叫朋友面板应初始化 30 秒倒计时窗口");
  assert.equal(context.document.getElementById("autoFriendBtn").textContent.includes("30秒"), true, "推荐按钮应显示 30 秒倒计时");

  context.confirmFriendTargetSelection({
    occurrence: 1,
    suit: "hearts",
    rank: "A",
  });
  context.renderFriendPanel();

  assert.equal(context.state.phase, "playing", "首次确认叫朋友后应进入正式出牌阶段");
  assert.equal(context.state.countdown, 30, "首轮首手在可重改窗口内应沿用 30 秒读秒");
  assert.equal(context.canRetargetFriendSelection(), true, "首次确认后应允许在顶部朋友牌上再改一次");
  assert.equal(context.document.getElementById("friendCardMount").classList.contains("editable"), true, "顶部朋友牌在窗口内应显示可点击态");
  assert.equal(context.document.getElementById("friendState").textContent.includes("可改"), true, "顶部朋友牌状态应提示当前仍可重改");

  assert.equal(context.reopenFriendSelection(), true, "顶部朋友牌应能在读秒内重开一次编辑面板");
  assert.equal(context.state.phase, "callingFriend", "重开后应回到 callingFriend 面板");
  assert.equal(context.state.friendRetargetUsed, true, "顶部重改入口只应记录为已使用一次");

  context.confirmFriendTargetSelection({
    occurrence: 2,
    suit: "clubs",
    rank: "K",
  });
  context.renderFriendPanel();

  assert.equal(context.state.phase, "playing", "二次确认后应重新回到正式出牌阶段");
  assert.equal(context.state.countdown, 15, "用掉唯一一次重改机会后，首轮首手应恢复普通 15 秒读秒");
  assert.equal(context.canRetargetFriendSelection(), false, "二次确认后不应再允许继续重改");
  assert.equal(context.getFriendRetargetCountdownSeconds(), 0, "二次确认后应清空朋友重改窗口倒计时");
  assert.equal(context.document.getElementById("friendCardMount").classList.contains("editable"), false, "顶部朋友牌在机会用完后应恢复纯展示态");
  assert.equal(context.document.getElementById("friendLabel").textContent.includes("第二张"), true, "二次确认后顶部朋友牌应展示新的目标牌");
}

main();
