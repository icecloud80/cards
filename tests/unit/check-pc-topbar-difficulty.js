const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * 共享脚本在渲染过程中会频繁访问 `classList`；
 * 这条回归只关心 PC 顶栏难度显示，不需要完整浏览器，但仍要保证类名接口足够兼容。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可供元素桩复用的类名对象。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只实现本测试会触发的最小接口。
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
 * 这条回归只需要跑到真实的 `renderScorePanel()`；
 * 用统一元素桩就能覆盖顶栏难度显示链路，同时避免引入浏览器环境。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 具备最小字段和方法的元素桩对象。
 *
 * 注意：
 * - `setAttribute` 需要记录属性值，方便断言 `aria-label`。
 * - `querySelector("img")` 默认返回 `null` 即可，满足这条回归。
 */
function createElementStub(identifier) {
  const attributes = new Map();
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
    title: "",
    disabled: false,
    hidden: false,
    classList: createClassListStub(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
      this[name] = value;
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
  };
}

/**
 * 作用：
 * 载入一份包含真实 PC 共享脚本的测试上下文。
 *
 * 为什么这样写：
 * 顶栏难度来自共享状态 `state.aiDifficulty`，并通过共享渲染层写回 DOM；
 * 直接运行真实脚本，才能锁住“设置值变化 -> 顶栏短标签变化”这条业务链。
 *
 * 输入：
 * @param {void} - 通过固定脚本路径加载 PC 运行时所需脚本。
 *
 * 输出：
 * @returns {{setupGame: Function, renderHud: Function, renderFriendPanel: Function, renderScorePanel: Function, state: object, document: object}} 当前回归需要的真实接口集合。
 *
 * 注意：
 * - `document.querySelector(".table")` 必须返回元素桩，避免布局逻辑取空。
 * - 这里只验证难度显示，不检查其他顶栏文案。
 */
function loadPcTopbarContext() {
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

  return vm.runInContext("({ setupGame, renderHud, renderFriendPanel, renderScorePanel, state, document })", context);
}

/**
 * 作用：
 * 校验 PC 顶栏已经补入与手游一致的难度短标签，并同步锁住主牌与朋友状态的关键信息。
 *
 * 为什么这样写：
 * 这次改动除了补“难度”外，还要求 PC 顶栏在无主时展示真实亮牌、把 `打 玩家X` 修正成 `打家 玩家X`，
 * 同时让朋友状态在已站队后直接带出玩家名；
 * 把这几项集中锁在同一条小回归里，可以更快发现 PC 和手游顶部状态再次分叉。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里只验证 PC 顶栏结构和关键文案，不做像素级布局截图断言。
 * - 紧凑短标签必须沿用 `初 / 中 / 高`，和手游保持一致。
 */
function main() {
  const indexHtml = fs.readFileSync(path.join(__dirname, "../../index1.html"), "utf8");
  assert.match(indexHtml, /<span class="topbar-summary-label">难度<\/span>/, "PC 顶栏左侧统计应补入“难度”标题");
  assert.match(indexHtml, /id="topbarDifficulty"/, "PC 顶栏应提供独立的难度值节点");
  assert.match(indexHtml, /\.topbar-friend-card \.friend-card::after\s*\{\s*display:\s*none;\s*\}/, "PC 顶部朋友牌应去掉全局橘色强调描边，只保留纯牌面");
  assert.match(indexHtml, /\.topbar-trump-badge\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*58px;[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;/, "PC 顶栏主牌卡位应改成和朋友牌一致的尺寸，并去掉外层卡框");
  assert.match(indexHtml, /\.topbar-trump-card\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*58px;[\s\S]*border:\s*0;/, "PC 顶栏主牌小卡位应和朋友牌保持同尺寸牌面");

  const context = loadPcTopbarContext();
  context.setupGame();

  context.renderScorePanel();
  assert.equal(context.document.getElementById("topbarDifficulty").textContent, "初", "PC 顶栏默认应显示初级难度短标签");
  assert.equal(context.document.getElementById("topbarDifficulty").title, "AI难度：初级", "PC 顶栏难度应保留完整提示文案");

  context.state.aiDifficulty = "intermediate";
  context.renderScorePanel();
  assert.equal(context.document.getElementById("topbarDifficulty").textContent, "中", "PC 顶栏应把中级难度压缩成“中”");

  context.state.aiDifficulty = "advanced";
  context.renderScorePanel();
  assert.equal(context.document.getElementById("topbarDifficulty").textContent, "高", "PC 顶栏应把高级难度压缩成“高”");

  context.state.phase = "playing";
  context.state.bankerId = 3;
  context.state.currentTurnId = 1;
  context.state.declaration = {
    playerId: 3,
    suit: "notrump",
    rank: "2",
    count: 2,
    cards: [{ suit: "joker", rank: "RJ", img: "./cards/joker-RJ.svg" }],
  };
  context.state.friendTarget = {
    label: "第二张方块A",
    occurrence: 2,
    suit: "diamonds",
    rank: "A",
    matchesSeen: 2,
    revealed: true,
    revealedBy: 4,
    failed: false,
  };

  context.renderHud();
  context.renderFriendPanel();

  assert.equal(context.document.getElementById("bankerLabel").textContent, "打家 玩家3", "PC 顶栏主牌副标题应明确写成“打家 玩家X”");
  assert.equal(context.document.getElementById("friendState").textContent, "已站队 玩家4", "PC 顶栏朋友状态在已站队后应直接带出玩家名");
  assert.equal(context.document.getElementById("topbarTrumpBadge").children.length, 1, "PC 顶栏无主时应渲染真实亮牌，而不是只显示“无”字");
  assert.equal(context.document.getElementById("topbarTrumpBadge").children[0].getAttribute("aria-label"), "大王", "PC 顶栏无主状态应展示触发亮牌的真实王");
}

main();
