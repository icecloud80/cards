const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("node:perf_hooks");

const DEFAULT_SHARED_SOURCE_FILES = [
  path.join(__dirname, "../../src/shared/config.js"),
  path.join(__dirname, "../../src/shared/rules.js"),
  path.join(__dirname, "../../src/shared/text.js"),
  path.join(__dirname, "../../src/shared/game.js"),
  path.join(__dirname, "../../src/shared/ai-shared.js"),
  path.join(__dirname, "../../src/shared/ai-beginner.js"),
  path.join(__dirname, "../../src/shared/ai-simulate.js"),
  path.join(__dirname, "../../src/shared/ai-objectives.js"),
  path.join(__dirname, "../../src/shared/ai-evaluate.js"),
  path.join(__dirname, "../../src/shared/ai-candidates.js"),
  path.join(__dirname, "../../src/shared/ai-intermediate.js"),
  path.join(__dirname, "../../src/shared/ai.js"),
];

/**
 * 作用：
 * 将任意 seed 输入稳定映射成 32 位无符号整数。
 *
 * 为什么这样写：
 * 回归脚本既要支持数字 seed，也要支持字符串 seed，统一哈希后更方便复现和派生子 seed。
 *
 * 输入：
 * @param {string|number} seedInput - 本次回归传入的种子原始值。
 *
 * 输出：
 * @returns {number} 可用于伪随机数生成器初始化的 32 位整数种子。
 *
 * 注意：
 * - 相同输入必须返回相同结果。
 * - 返回值需要避免为 0，以减少某些 PRNG 的退化情况。
 */
function hashSeedInput(seedInput) {
  const raw = String(seedInput ?? "headless-regression");
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

/**
 * 作用：
 * 生成一个可复现的伪随机数函数。
 *
 * 为什么这样写：
 * 游戏洗牌、AI 亮主/反主意愿都依赖 `Math.random`，固定种子后才能稳定复盘失败局。
 *
 * 输入：
 * @param {string|number} seedInput - 本次回归使用的随机种子。
 *
 * 输出：
 * @returns {() => number} 一个返回 `[0, 1)` 浮点数的随机函数。
 *
 * 注意：
 * - 不要替换成依赖系统时间的实现，否则同一回归无法重放。
 * - 该实现偏向“稳定复现”，不是密码学随机。
 */
function createSeededRandom(seedInput) {
  let state = hashSeedInput(seedInput);
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 作用：
 * 创建一个最小可用的 `classList` 桩对象。
 *
 * 为什么这样写：
 * 游戏结算和日志按钮会调用 `classList.add/remove/toggle/contains`，headless 场景需要保留这些接口。
 *
 * 输入：
 * @param {string[]} [initialValues=[]] - 初始类名列表。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function, toString: Function}} 可模拟 DOMTokenList 行为的对象。
 *
 * 注意：
 * - `toggle` 需要兼容带第二个参数的浏览器语义。
 * - 这里只保留测试所需的最小能力，不要扩展成完整 DOM 实现。
 */
function createClassListStub(initialValues = []) {
  const values = new Set(initialValues);
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
    toString() {
      return [...values].join(" ");
    },
  };
}

/**
 * 作用：
 * 创建一个可复用的 DOM 元素桩对象。
 *
 * 为什么这样写：
 * `config.js` 会在加载阶段缓存大量 DOM 节点，统一元素桩可以避免 headless 回归在任何按钮/面板字段上报空指针。
 *
 * 输入：
 * @param {string} identifier - 节点 ID 或标签名，用于调试时标识来源。
 *
 * 输出：
 * @returns {object} 具备常见 DOM 属性和方法的最小元素对象。
 *
 * 注意：
 * - 返回对象会被多次复用，所以字段必须可变。
 * - 这里的 `click`/`focus`/`select` 都是空实现，仅用于兼容业务代码。
 */
function createElementStub(identifier) {
  const attributes = new Map();
  return {
    id: identifier,
    tagName: String(identifier || "div").toUpperCase(),
    dataset: {},
    style: {},
    children: [],
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    hidden: false,
    checked: false,
    classList: createClassListStub(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
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
    click() {},
    focus() {},
    select() {},
  };
}

/**
 * 作用：
 * 创建一个不会自动执行回调的定时器桩。
 *
 * 为什么这样写：
 * headless 回归要用同步循环主动推进状态机，不能让真实 `setTimeout/setInterval` 在后台异步改状态。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{setTimeout: Function, clearTimeout: Function, setInterval: Function, clearInterval: Function, getPendingCount: Function}} 定时器 API 集合。
 *
 * 注意：
 * - 这里会记录挂起中的 timer 数量，方便分析某次回归是否残留异常定时器。
 * - 不要在这个层面偷偷执行回调，否则会破坏 runner 的可控性。
 */
function createNoopTimerApi() {
  let nextTimerId = 1;
  const pendingTimers = new Map();

  function registerTimer(kind, callback, delay) {
    const timerId = nextTimerId;
    nextTimerId += 1;
    pendingTimers.set(timerId, { kind, callback, delay });
    return timerId;
  }

  return {
    setTimeout(callback, delay = 0) {
      return registerTimer("timeout", callback, delay);
    },
    clearTimeout(timerId) {
      pendingTimers.delete(timerId);
    },
    setInterval(callback, delay = 0) {
      return registerTimer("interval", callback, delay);
    },
    clearInterval(timerId) {
      pendingTimers.delete(timerId);
    },
    getPendingCount() {
      return pendingTimers.size;
    },
  };
}

/**
 * 作用：
 * 创建一个会采集 warn/error 的控制台包装器。
 *
 * 为什么这样写：
 * 回归不仅要判断能否打完，还要把 AI 卡死、非法状态等告警沉淀到分析报告里。
 *
 * 输入：
 * @param {Console} [baseConsole=console] - 可选的底层控制台对象。
 *
 * 输出：
 * @returns {{console: object, capture: {warnings: string[], errors: string[]}}} 包装后的控制台与采集结果。
 *
 * 注意：
 * - `log/info/debug` 默认静默，避免测试输出被海量日志淹没。
 * - warn/error 会转成字符串，便于后续写入 JSON 和 Markdown。
 */
function createConsoleCapture(baseConsole = console) {
  const warnings = [];
  const errors = [];

  function stringifyArgs(args) {
    return args.map((value) => {
      if (typeof value === "string") {
        return value;
      }
      try {
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }).join(" ");
  }

  return {
    console: {
      log() {},
      info() {},
      debug() {},
      warn(...args) {
        warnings.push(stringifyArgs(args));
      },
      error(...args) {
        errors.push(stringifyArgs(args));
      },
      dir(...args) {
        warnings.push(stringifyArgs(args));
      },
      time: baseConsole.time ? baseConsole.time.bind(baseConsole) : () => {},
      timeEnd: baseConsole.timeEnd ? baseConsole.timeEnd.bind(baseConsole) : () => {},
    },
    capture: {
      warnings,
      errors,
    },
  };
}

/**
 * 作用：
 * 加载一套带种子、无 UI、无真实定时器的游戏 VM 上下文。
 *
 * 为什么这样写：
 * 现有业务代码是浏览器全局脚本风格，使用 VM 注入最小浏览器环境可以最大限度复用真实规则与 AI 逻辑。
 *
 * 输入：
 * @param {object} [options={}] - 上下文加载配置。
 * @param {string|number} [options.seed="headless-regression"] - 本局使用的随机种子。
 * @param {string[]} [options.files] - 自定义要加载的源码文件列表。
 *
 * 输出：
 * @returns {{context: object, capture: {warnings: string[], errors: string[]}, timers: object, elements: Map<string, object>}} 供 runner 使用的完整上下文。
 *
 * 注意：
 * - 返回的 `context` 会直接暴露真实游戏函数，请只在单局生命周期内使用。
 * - 若后续新增共享脚本文件，需要同步更新默认文件列表。
 */
function loadHeadlessGameContext(options = {}) {
  const seed = options.seed ?? "headless-regression";
  const random = createSeededRandom(seed);
  const math = Object.create(Math);
  math.random = random;

  const timers = createNoopTimerApi();
  const { console: capturedConsole, capture } = createConsoleCapture(options.baseConsole);
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
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById(identifier) {
      return getElement(identifier);
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
    console: capturedConsole,
    Math: math,
    performance,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
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
        return "blob:headless-regression";
      },
      revokeObjectURL() {},
    },
    Blob: class BlobStub {
      constructor(parts, blobOptions = {}) {
        this.parts = parts;
        this.type = blobOptions.type || "";
      }
    },
    CustomEvent: function CustomEvent(type, eventOptions = {}) {
      return { type, detail: eventOptions.detail };
    },
    document,
  };

  context.window = context;
  context.globalThis = context;
  context.render = function render() {};
  context.renderScorePanel = function renderScorePanel() {};
  context.renderHand = function renderHand() {};
  context.renderCenterPanel = function renderCenterPanel() {};
  context.updateActionHint = function updateActionHint() {};
  context.renderBottomRevealCenter = function renderBottomRevealCenter() {};
  context.renderLastTrick = function renderLastTrick() {};
  context.renderLogs = function renderLogs() {};

  vm.createContext(context);
  const files = Array.isArray(options.files) && options.files.length > 0
    ? options.files
    : DEFAULT_SHARED_SOURCE_FILES;
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  const api = vm.runInContext(`({
    state,
    Math,
    setupGame,
    startDealing,
    dealOneCard,
    finishDealingPhase,
    getBestDeclarationForPlayer,
    canOverrideDeclaration,
    declareTrump,
    getCounterDeclarationForPlayer,
    counterDeclare,
    passCounterForCurrentPlayer,
    getBuryHintForPlayer,
    completeBurying,
    getFriendPickerRecommendation,
    chooseFriendTarget,
    confirmFriendTargetSelection,
    getLegalHintForPlayer,
    findLegalSelectionBySearch,
    buildForcedFollowFallback,
    findEmergencyLegalSelection,
    playCards,
    getPlayer,
    getBottomResultSummary,
    getOutcome,
    getResultLogText
  })`, context);

  return {
    context: api,
    capture,
    timers,
    elements,
  };
}

module.exports = {
  loadHeadlessGameContext,
};
