const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名桩对象。
 *
 * 为什么这样写：
 * 共享脚本加载时会访问 `classList`，但这条回归只关心节奏设置与定时器，
 * 不需要引入完整 DOM；提供最小实现即可稳定跑通脚本初始化。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可复用的类名桩。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只保留本测试会触达的最小接口。
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
 * `config.js` 和 `main.js` 会缓存大量节点并绑定事件；
 * 这里只需要 value、disabled 和监听能力，便于验证节奏设置是否同步到多个入口。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 一个带最小字段和方法的元素桩。
 *
 * 注意：
 * - `addEventListener` 只做记录，不在本测试里主动触发。
 * - `querySelector` 与 `querySelectorAll` 返回空即可。
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
 * 创建一套只返回固定随机值的数学桩对象。
 *
 * 为什么这样写：
 * 节奏档位里有区间随机延迟；把 `Math.random()` 固定成 0 后，
 * 我们就能稳定断言每个档位都取到各自的最小值。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {Math} 一个覆写了 `random()` 的数学对象。
 *
 * 注意：
 * - 只重写 `random`，其余方法继续复用原生 `Math`。
 * - 固定返回 0 代表始终取区间最小值。
 */
function createMathStub() {
  return Object.assign(Object.create(Math), {
    random() {
      return 0;
    },
  });
}

/**
 * 作用：
 * 加载一套最小可运行的节奏设置上下文。
 *
 * 为什么这样写：
 * 本次改动横跨共享配置、局内定时器和设置入口同步；
 * 直接在 VM 中加载真实脚本，可以最低成本验证“选档位 -> 写状态 -> 影响计时器”整条链路。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{api: object, timers: number[]}} 暴露节奏相关接口与记录到的超时毫秒值。
 *
 * 注意：
 * - `setTimeout` 只记录毫秒值，不真正执行回调。
 * - 这条回归固定使用 PC 平台，避免引入手游壳层脚本干扰。
 */
function createPaceContext() {
  const elements = new Map();
  const timers = [];

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
    renderLastTrick() {},
    renderBottomPanel() {},
    renderBottomRevealCenter() {},
    renderLogs() {},
    updateActionHint() {},
    updateResultCountdownLabel() {},
    makeFloatingPanel() {},
    getLayoutElements() {
      return [];
    },
    makeLayoutEditable() {},
    applySavedLayoutState() {},
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
    setTimeout(handler, delay) {
      timers.push(delay);
      return timers.length;
    },
    clearTimeout() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
    Math: createMathStub(),
  };
  context.window = context;
  context.globalThis = context;

  vm.createContext(context);

  const files = [
    path.join(__dirname, "../../src/platform/pc.js"),
    path.join(__dirname, "../../src/shared/config.js"),
    path.join(__dirname, "../../src/shared/rules.js"),
    path.join(__dirname, "../../src/shared/game.js"),
    path.join(__dirname, "../../src/shared/main.js"),
  ];

  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  const api = vm.runInContext(
    "({ state, dom, setAiPace, getAiPaceProfile, getAiPaceDelay, startTurn, queueDealStep, getAiPaceLabel })",
    context
  );

  /**
   * 作用：
   * 把“局内 seeded random”固定到最小值测试口径。
   *
   * 为什么这样写：
   * 共享运行态现在会在开局后初始化 `state.roundRandom`；
   * 这条回归只关心节奏档位映射，不关心真正的 seed 分布，因此继续把随机源钉成 `0`，
   * 就能稳定复用原有“区间延迟应取最小值”的断言口径。
   *
   * 输入：
   * @param {void} - 直接改写测试上下文里的共享状态。
   *
   * 输出：
   * @returns {void} 不返回额外结果。
   *
   * 注意：
   * - 这里只影响本测试 VM，不会改真实运行态逻辑。
   * - 必须在返回 API 前设置，避免后续断言读到 seed 随机值。
   */
  api.state.roundRandom = function roundRandomStub() {
    return 0;
  };

  return { api, timers };
}

/**
 * 作用：
 * 运行 AI 节奏设置回归断言。
 *
 * 为什么这样写：
 * 这次需求同时新增 4 档节奏 UI 和共享定时逻辑；
 * 用一条小回归锁住默认档、档位同步、定时器映射和 HTML 入口，能防止后续有人只改了一半。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 断言全部通过后直接退出。
 *
 * 注意：
 * - `瞬` 必须大于 0ms，避免把定时器误改成同步执行。
 * - `慢` 必须继续对应当前线上体验，不能偷偷漂移。
 */
function main() {
  const { api, timers } = createPaceContext();
  const pcHtml = fs.readFileSync(path.join(__dirname, "../../index1.html"), "utf8");
  const mobileHtml = fs.readFileSync(path.join(__dirname, "../../index2.html"), "utf8");

  assert.equal(api.state.aiPace, "slow", "默认节奏应保持慢档");
  assert.equal(api.getAiPaceLabel("instant"), "瞬", "瞬档标签应可正常读取");
  assert.equal(api.getAiPaceProfile("slow").turnDelay.min, 900, "慢档 AI 出牌最短等待应保持当前 900ms");
  assert.equal(api.getAiPaceProfile("slow").trickPauseDelay, 2400, "慢档每轮停顿应保持当前 2400ms");

  api.setAiPace("fast");
  assert.equal(api.state.aiPace, "fast", "设置节奏后应写入共享状态");
  assert.equal(api.dom.aiPaceSelect.value, "fast", "主设置入口应同步显示 fast");
  assert.equal(api.dom.menuAiPaceSelect.value, "fast", "PC 菜单入口应同步显示 fast");

  api.state.players = [
    { id: 1, isHuman: true, hand: [] },
    { id: 2, isHuman: false, hand: [] },
  ];
  api.state.currentTurnId = 2;

  timers.length = 0;
  api.startTurn();
  assert.equal(timers[0], api.getAiPaceProfile("fast").turnDelay.min, "fast 档 AI 出牌延迟应取 fast 配置");

  api.setAiPace("instant");
  timers.length = 0;
  api.startTurn();
  assert.equal(timers[0], api.getAiPaceProfile("instant").turnDelay.min, "瞬档 AI 出牌延迟应取 instant 配置");
  assert(timers[0] > 0, "瞬档延迟也必须大于 0ms");
  assert(timers[0] < api.getAiPaceProfile("fast").turnDelay.min, "瞬档应明显快于 fast 档");

  api.setAiPace("medium");
  timers.length = 0;
  api.queueDealStep();
  assert.equal(timers[0], api.getAiPaceProfile("medium").dealStepDelay, "发牌步进应跟随当前节奏档位");
  assert.equal(api.getAiPaceDelay("counterActionDelay", "slow"), api.getAiPaceProfile("slow").counterActionDelay.min, "区间延迟应在固定随机桩下稳定取最小值");

  assert(pcHtml.includes('id="aiPaceSelect"'), "PC 开始界面应提供节奏选择");
  assert(pcHtml.includes('id="menuAiPaceSelect"'), "PC 更多菜单应提供节奏选择");
  assert(mobileHtml.includes('id="mobileAiPaceButtons"'), "手游开始页应提供和 PC 一样的节奏按钮组");
  assert(mobileHtml.includes('id="mobileMenuAiPaceButtons"'), "手游设置页应提供和 PC 一样的节奏按钮组");
  assert(mobileHtml.includes('id="mobileAiPaceSelect"'), "手游开始页应保留隐藏节奏镜像节点");
  assert(mobileHtml.includes('id="mobileMenuAiPaceSelect"'), "手游设置页应保留隐藏节奏镜像节点");
  assert(mobileHtml.includes('id="aiPaceSelect"'), "手游壳层应保留共享节奏选择镜像节点");
}

main();
