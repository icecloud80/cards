const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * 共享 UI 脚本会反复读写 `classList`；
 * 这条回归只想验证上一轮回看布局，不需要完整浏览器，因此保留最小实现即可。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 供元素桩复用的类名对象。
 *
 * 注意：
 * - `toggle` 需要兼容浏览器的第二个布尔参数。
 * - 这里只实现当前回归会触达的最小接口。
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
 * 创建可供共享 UI 脚本使用的最小元素桩。
 *
 * 为什么这样写：
 * `renderLastTrick()` 会读取文本、样式和类名字段；
 * 统一复用轻量 DOM 桩，可以直接加载真实脚本而不引入额外依赖。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 含最小字段与方法的元素桩。
 *
 * 注意：
 * - `setAttribute` 需要把值同步回对象字段，方便后续断言。
 * - 这里只覆盖本回归需要的最小 DOM 接口。
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
 * 加载一份带真实共享脚本的上一轮回看测试上下文。
 *
 * 为什么这样写：
 * 这次要锁住的是“共享渲染 helper + 三端样式约定”整条链路；
 * 直接在 VM 里跑生产脚本，才能保证断言命中的就是当前运行态实际逻辑。
 *
 * 输入：
 * @param {void} - 通过固定脚本路径加载 PC 环境需要的共享文件。
 *
 * 输出：
 * @returns {{setupGame: Function, renderLastTrick: Function, state: object, dom: object}} 当前回归需要的真实接口。
 *
 * 注意：
 * - `dispatchEvent` 需要提供空实现，兼容共享 `render()` 的快照广播。
 * - 这里只加载 PC 平台脚本，因为上一轮回看 DOM 由共享层统一生成。
 */
function loadLastTrickContext() {
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

  return vm.runInContext("({ setupGame, renderLastTrick, state, dom })", context);
}

/**
 * 作用：
 * 验证上一轮回看已经改成更紧凑的横排布局。
 *
 * 为什么这样写：
 * 这次需求的核心是减少上一轮回看在 PC / mobile / App 里的纵向占用；
 * 因此需要同时锁住共享 markup 和三套页面样式，避免后续只改一端或退回旧的竖排堆叠。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 回归只验证布局结构，不验证具体牌面资源主题。
 * - 共享 markup 必须继续兼容 mobile 直接复用 PC 回看内容的现有实现。
 */
function main() {
  const pcHtml = fs.readFileSync(path.join(__dirname, "../../index1.html"), "utf8");
  const mobileHtml = fs.readFileSync(path.join(__dirname, "../../index2.html"), "utf8");
  const appHtml = fs.readFileSync(path.join(__dirname, "../../index-app.html"), "utf8");
  const context = loadLastTrickContext();

  assert.match(
    pcHtml,
    /\.last-trick-entry\s*\{[\s\S]*grid-template-columns:\s*minmax\(68px,\s*auto\)\s+minmax\(0,\s*1fr\)/,
    "PC 上一轮回看应把玩家摘要和牌列压成横向双栏"
  );
  assert.match(
    mobileHtml,
    /\.mobile-last-trick-cards\s+\.last-trick-entry\s*\{[\s\S]*grid-template-columns:\s*minmax\(52px,\s*auto\)\s+minmax\(0,\s*1fr\)/,
    "mobile 上一轮回看应继续沿用紧凑横排布局"
  );
  assert.match(
    appHtml,
    /\.mobile-last-trick-cards\s+\.last-trick-entry\s*\{[\s\S]*grid-template-columns:\s*minmax\(52px,\s*auto\)\s+minmax\(0,\s*1fr\)/,
    "App 上一轮回看应继续沿用紧凑横排布局"
  );

  context.setupGame("last-trick-compact-layout");
  context.state.showLastTrick = true;
  context.state.lastTrick = {
    trickNumber: 4,
    winnerId: 2,
    points: 25,
    plays: context.state.players.map((player, index) => ({
      playerId: player.id,
      cards: player.hand.slice(0, index % 2 === 0 ? 2 : 1),
    })),
  };

  context.renderLastTrick();

  assert.equal(
    context.dom.lastTrickCards.innerHTML.includes('class="last-trick-entry-summary"'),
    true,
    "共享上一轮回看 markup 应补入左侧玩家摘要容器"
  );
  assert.equal(
    context.dom.lastTrickCards.innerHTML.includes('class="spot-row last-trick-entry-cards"'),
    true,
    "共享上一轮回看 markup 应把牌列标成独立横向轨道"
  );
  assert.equal(
    context.dom.lastTrickCards.innerHTML.includes('style="margin-top:10px;"'),
    false,
    "共享上一轮回看不应继续依赖旧的内联纵向间距样式"
  );
  assert.equal(
    (context.dom.lastTrickCards.innerHTML.match(/class="last-trick-entry"/g) || []).length,
    5,
    "共享上一轮回看应按五位玩家依次渲染紧凑条目"
  );
}

main();
