const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * 这条回归既要加载共享脚本，又要触发按钮点击后的重渲染；
 * 保留 `classList` 的最小行为后，就能把测试聚焦在“重置本局是否保级且可触发”。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可复用的类名桩对象。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只实现本测试实际会用到的最小能力。
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
 * 创建一个足够支撑 shared + main 加载的元素桩对象。
 *
 * 为什么这样写：
 * “重置本局”回归既要验证共享状态机，也要真实触发按钮监听器；
 * 统一元素桩后，PC 和 mobile 都能共用同一套加载逻辑。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 一个带最小属性和点击能力的元素桩对象。
 *
 * 注意：
 * - `setAttribute` 需要写回属性，方便断言 aria / title 是否被同步。
 * - `querySelector("img")` 这里只返回 `null`，让测试保持在行为层，不耦合真实 DOM 结构。
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
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
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
    focus() {},
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
 * 为指定平台加载一套可执行 shared 重置逻辑的测试上下文。
 *
 * 为什么这样写：
 * 用户这次要的是“PC 和 mobile 的顶栏按钮都能重置本局且保级”；
 * 用真实脚本加载两端平台壳，再点击共享 `newGameBtn`，才能同时锁住功能和跨端一致性。
 *
 * 输入：
 * @param {"pc"|"mobile"} platform - 当前要模拟的平台。
 *
 * 输出：
 * @returns {{state: object, dom: object, getPlayer: Function}} 当前测试需要的业务接口集合。
 *
 * 注意：
 * - `setTimeout` 与 `setInterval` 只返回句柄，不自动执行，避免发牌流程在后台跑完。
 * - `document.querySelector(".table")` 必须返回元素桩，避免布局相关代码取空。
 */
function loadRoundResetContext(platform) {
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

  return vm.runInContext("({ state, dom, getPlayer })", context);
}

/**
 * 作用：
 * 断言指定平台的“重置本局”按钮会保留等级并重新进入发牌。
 *
 * 为什么这样写：
 * 这次需求的核心不是单纯“有个按钮”，而是“重洗当前局、但不能把长期等级清掉”；
 * 把平台差异压成同一条断言 helper 后，PC 和 mobile 都能共享相同验收口径。
 *
 * 输入：
 * @param {"pc"|"mobile"} platform - 当前要验证的平台。
 *
 * 输出：
 * @returns {void} 断言通过后正常退出。
 *
 * 注意：
 * - 这里校验的是共享状态机行为，不检查具体像素布局。
 * - 必须同时确认 `state.playerLevels` 和 `state.players[].level` 都保持不变，避免只保住一层状态。
 */
function assertRoundResetKeepsLevels(platform) {
  const context = loadRoundResetContext(platform);
  const expectedLevels = {
    1: "8",
    2: "Q",
    3: "A",
    4: "5",
    5: "-2",
  };

  context.state.playerLevels = { ...expectedLevels };
  context.state.showToolbarMenu = true;
  context.state.showLastTrick = true;
  context.dom.resultOverlay.classList.add("show");

  context.dom.newGameBtn.click();

  assert.equal(context.state.phase, "dealing", `${platform} 点击重置本局后应立即回到发牌阶段`);
  assert.deepEqual(context.state.playerLevels, expectedLevels, `${platform} 重置本局后应保留当前等级进度`);
  assert.equal(context.getPlayer(1).level, expectedLevels[1], `${platform} 重置本局后玩家1显示等级应保持不变`);
  assert.equal(context.getPlayer(3).level, expectedLevels[3], `${platform} 重置本局后其他玩家显示等级也应保持不变`);
  assert.equal(context.state.showToolbarMenu, false, `${platform} 重置本局后应收起局内菜单状态`);
  assert.equal(context.state.showLastTrick, false, `${platform} 重置本局后应关闭上一轮回看状态`);
  assert.equal(context.dom.resultOverlay.classList.contains("show"), false, `${platform} 重置本局前若有结果弹窗，应先收起旧弹窗`);
  assert.equal(context.dom.newGameBtn.title, "重置本局", `${platform} 的图标按钮应暴露明确的重置文案`);
}

/**
 * 作用：
 * 断言 PC 与 mobile 的顶栏源码都把“重置本局”按钮插到正确位置。
 *
 * 为什么这样写：
 * 这次用户明确指定了按钮顺序和图标资源；
 * 直接检查 HTML 源码里的顺序约束，可以防止后续改模板时又把按钮挪错位或换错图。
 *
 * 输入：
 * @param {void} - 通过固定路径读取 HTML 源码。
 *
 * 输出：
 * @returns {void} 所有顺序断言通过后正常退出。
 *
 * 注意：
 * - 这里只验证关键锚点顺序与图标资源，不做完整 DOM 解析。
 * - 正则使用跨行匹配，避免 HTML 换行导致误报。
 */
function assertTopbarMarkupOrder() {
  const pcHtml = fs.readFileSync(path.join(__dirname, "../../index1.html"), "utf8");
  const mobileHtml = fs.readFileSync(path.join(__dirname, "../../index2.html"), "utf8");

  assert.match(
    pcHtml,
    /id="toggleLastTrickBtn"[\s\S]*id="newGameBtn"[\s\S]*icon_new_game\.png[\s\S]*id="toggleRulesBtn"/,
    "PC 顶栏应把重置本局按钮放在上一轮与设置之间，并使用 icon_new_game.png"
  );
  assert.match(
    mobileHtml,
    /id="mobileLastTrickBtn"[\s\S]*id="newGameBtn"[\s\S]*icon_new_game\.png[\s\S]*id="mobileMenuBtn"/,
    "mobile 顶栏应把重置本局按钮放在上一轮与设置之间，并使用 icon_new_game.png"
  );
  assert.doesNotMatch(
    mobileHtml,
    /<div class="score-actions">[\s\S]*id="newGameBtn"/,
    "mobile 旧的文字版新牌局按钮应从底部快捷操作区移除，避免和顶栏入口重复"
  );
}

/**
 * 作用：
 * 执行“重置本局”按钮的跨端回归断言。
 *
 * 为什么这样写：
 * 这次改动同时涉及 HTML 位置、共享点击逻辑和等级保留规则；
 * 把三部分集中在同一条小回归里，可以更快拦住后续回退。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里不替代真实浏览器 smoke，主要用于锁住共享逻辑与关键 DOM 锚点。
 * - 若后续再改按钮 ID 或布局顺序，需要同步更新本回归。
 */
function main() {
  assertTopbarMarkupOrder();
  assertRoundResetKeepsLevels("pc");
  assertRoundResetKeepsLevels("mobile");
}

main();
