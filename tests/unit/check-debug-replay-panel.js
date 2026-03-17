const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * debug 面板渲染会频繁切换类名状态；
 * 用统一桩对象就能在不引入完整浏览器的前提下，稳定复用真实共享脚本。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 类名读写桩。
 *
 * 注意：
 * - `toggle` 需要兼容带第二个布尔参数的浏览器语义。
 * - 这里只实现本测试会触达的最小接口。
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
 * 创建一个足够支撑共享 UI 渲染的 DOM 元素桩。
 *
 * 为什么这样写：
 * 这条回归既要看静态 HTML，也要调用真实的复盘 helper 和 `renderReplayPanel()`；
 * 元素桩需要同时兼容 `value / textContent / classList / style.setProperty` 这些最常用接口。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 最小可用的元素桩对象。
 *
 * 注意：
 * - `setAttribute` 需要把值同步回对象字段，方便断言读取。
 * - 这里只做最小兼容，不扩展成完整 DOM。
 */
function createElementStub(identifier) {
  const listeners = new Map();
  return {
    id: identifier,
    dataset: {},
    parentElement: {
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 1280, height: 720 };
      },
    },
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
    offsetWidth: 320,
    offsetHeight: 180,
    offsetParent: {},
    classList: createClassListStub(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    click() {
      const handler = listeners.get("click");
      if (typeof handler === "function") {
        handler({ target: this });
      }
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 320, height: 180 };
    },
    setPointerCapture() {},
    releasePointerCapture() {},
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
 * 加载包含真实 PC 共享脚本的复盘测试上下文。
 *
 * 为什么这样写：
 * 这次要验证的是“设置菜单复盘入口 + 开局恢复 helper + 面板反馈文案”整条链路；
 * 直接在 VM 里跑生产脚本，才能确保断言覆盖到真实初始化与渲染逻辑。
 *
 * 输入：
 * @param {void} - 通过固定脚本路径加载 PC 运行时所需文件。
 *
 * 输出：
 * @returns {{setupGame: Function, applyDebugReplaySeedReplay: Function, applyDebugOpeningCodeReplay: Function, renderReplayPanel: Function, renderToolbarMenu: Function, state: object, dom: object}} 当前回归需要的真实接口。
 *
 * 注意：
 * - `dispatchEvent` 需要提供空实现，兼容共享 `render()` 的快照广播。
 * - 这里只加载 PC 分支，不覆盖 mobile。
 */
function loadDebugReplayContext() {
  const elements = new Map();
  let clipboardText = "";

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
        async writeText(text) {
          clipboardText = String(text);
        },
        async readText() {
          return clipboardText;
        },
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
    path.join(__dirname, "../../src/shared/layout.js"),
    path.join(__dirname, "../../src/shared/main.js"),
  ];

  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  vm.runInContext(`
    function isHumanTurnActive() {
      return !state.gameOver && state.phase === "playing" && state.currentTurnId === 1;
    }
  `, context);

  const runtime = vm.runInContext(`({
    setupGame,
    applyDebugReplaySeedReplay,
    applyDebugOpeningCodeReplay,
    copyCurrentReplayBundleToClipboard,
    pasteReplayBundleFromClipboardToReplayDrafts,
    primeReplayPanelDraftsFromCurrentRound,
    renderReplayPanel,
    renderToolbarMenu,
    state,
    dom
  })`, context);

  runtime.getClipboardText = () => clipboardText;
  runtime.setClipboardText = (value) => {
    clipboardText = String(value);
  };
  return runtime;
}

/**
 * 作用：
 * 执行 PC 设置菜单“复盘”面板的专项回归断言。
 *
 * 为什么这样写：
 * 这次需求不只是往菜单里加一个按钮，而是要真的能从复盘面板恢复一局的初始状态；
 * 需要一条回归把静态入口、helper 行为和关键反馈文案一起锁住，避免后续只剩空壳 UI。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 断言全部通过后正常退出。
 *
 * 注意：
 * - “按回放种子重开”只保证随机链路重置到同一 seed，不保证一定和旧开局码一致。
 * - “按开局码重开”必须把首抓玩家与玩家等级一并恢复。
 */
async function main() {
  const html = fs.readFileSync(path.join(__dirname, "../../index1.html"), "utf8");
  const mobileHtml = fs.readFileSync(path.join(__dirname, "../../index2.html"), "utf8");
  const mobileAppHtml = fs.readFileSync(path.join(__dirname, "../../index-app.html"), "utf8");
  const context = loadDebugReplayContext();

  assert.match(html, /id="menuReplayBtn"/, "PC 设置菜单里应提供复盘按钮");
  assert.match(html, /id="replaySeedInput"/, "PC 复盘面板应提供回放种子输入框");
  assert.match(html, /id="replayOpeningCodeInput"/, "PC 复盘面板应提供开局码输入框");
  assert.match(html, /id="replayPasteBtn"/, "PC 复盘面板应提供“点此粘贴”按钮");
  assert.match(html, />Debug</, "PC 设置菜单里的调试入口初始文案应固定为 Debug");
  assert.match(html, />仅按回放种子重开</, "PC 复盘面板应明确区分 seed-only 重开");
  assert.match(html, />按开局码 \+ 种子重开</, "PC 复盘面板应提供按开局码加种子重开的按钮");
  assert.match(html, />点此粘贴</, "PC 复盘面板应提供点此粘贴入口");
  assert.match(mobileHtml, /id="mobileMenuCopyReplayBtn"/, "手游浏览器页设置菜单应提供复制复盘码按钮");
  assert.match(mobileAppHtml, /id="mobileMenuCopyReplayBtn"/, "手游 App 页设置菜单应提供复制复盘码按钮");

  context.setupGame("debug-panel-source");
  const sourceOpeningCode = context.state.openingCode;
  const sourceFirstDealPlayerId = context.state.nextFirstDealPlayerId;
  const sourcePlayerLevels = { ...context.state.playerLevels };
  const sourceAiDifficulty = context.state.aiDifficulty;

  context.state.showReplayPanel = true;
  context.renderReplayPanel();
  assert.equal(
    context.dom.replayCurrentSeed.textContent.includes("debug-panel-source"),
    true,
    "复盘面板应显示当前局使用的回放种子"
  );
  assert.equal(
    context.dom.replayCurrentOpeningCode.textContent.includes("当前开局码"),
    true,
    "复盘面板应显示当前局开局码摘要"
  );
  assert.equal(
    context.dom.replayPanel.classList.contains("hidden"),
    false,
    "打开复盘时应显示复盘面板"
  );
  assert.equal(
    context.dom.replaySeedInput.value,
    "",
    "未经过菜单入口预填时，复盘输入框应保持当前草稿值"
  );

  context.state.showToolbarMenu = true;
  context.state.phase = "dealing";
  context.renderToolbarMenu();
  assert.equal(
    context.dom.toggleDebugBtn.textContent,
    "Debug",
    "设置菜单里的调试入口文案应始终统一为 Debug"
  );
  assert.equal(
    context.dom.menuReplayBtn.textContent.includes("收起复盘"),
    true,
    "设置菜单里的复盘按钮应根据当前状态显示收起文案"
  );
  context.state.debugReplaySeedDraft = "old-seed";
  context.state.debugOpeningCodeDraft = "OLDCODE";
  context.dom.menuReplayBtn.click();
  assert.equal(context.state.showReplayPanel, false, "再次点击复盘按钮时应收起面板");
  context.dom.menuReplayBtn.click();
  assert.equal(context.state.showReplayPanel, true, "从设置菜单重新点开复盘时应再次显示面板");
  assert.equal(
    context.state.debugReplaySeedDraft,
    "debug-panel-source",
    "从设置菜单打开复盘时应预填当前局回放种子"
  );
  assert.equal(
    context.state.debugOpeningCodeDraft,
    sourceOpeningCode,
    "从设置菜单打开复盘时应预填当前局开局码"
  );
  assert.equal(
    context.dom.replaySeedInput.value,
    "debug-panel-source",
    "复盘面板里的回放种子输入框应显示当前局值"
  );
  assert.equal(
    context.dom.replayOpeningCodeInput.value,
    sourceOpeningCode,
    "复盘面板里的开局码输入框应显示当前局值"
  );
  assert.equal(context.state.debugReplayStatusText, "", "重新打开复盘时应清空旧状态提示");

  const copyReplayCodeResult = await context.copyCurrentReplayBundleToClipboard();
  assert.equal(copyReplayCodeResult.ok, true, "复制复盘码应成功");
  assert.equal(
    context.getClipboardText(),
    `debug-panel-source + ${sourceOpeningCode}`,
    "复制复盘码时应把回放种子和开局码按紧凑格式写入剪贴板"
  );

  context.state.debugReplaySeedDraft = "";
  context.state.debugOpeningCodeDraft = "";
  context.setClipboardText(`debug-panel-source + ${sourceOpeningCode}`);
  const pasteReplayCodeResult = await context.pasteReplayBundleFromClipboardToReplayDrafts();
  assert.equal(pasteReplayCodeResult.ok, true, "点此粘贴应能从剪贴板恢复复盘码");
  assert.equal(
    context.state.debugReplaySeedDraft,
    "debug-panel-source",
    "点此粘贴后应把回放种子写回复盘草稿"
  );
  assert.equal(
    context.state.debugOpeningCodeDraft,
    sourceOpeningCode,
    "点此粘贴后应把开局码写回复盘草稿"
  );
  assert.equal(
    context.state.debugReplayStatusText.includes("已从剪贴板带入复盘码"),
    true,
    "点此粘贴成功后应给出明确反馈"
  );

  context.setClipboardText("not-a-valid-replay-bundle");
  const invalidPasteResult = await context.pasteReplayBundleFromClipboardToReplayDrafts();
  assert.equal(invalidPasteResult.ok, false, "无效复盘码不应被写回复盘草稿");
  assert.equal(
    context.state.debugReplayStatusText.includes("剪贴板内容无效"),
    true,
    "无效复盘码应给出错误提示"
  );

  assert.equal(context.applyDebugReplaySeedReplay("debug-panel-manual-seed"), true, "按回放种子重开应成功");
  assert.equal(context.state.phase, "dealing", "按回放种子重开后应直接进入发牌阶段");
  assert.equal(context.state.replaySeed, "debug-panel-manual-seed", "按回放种子重开应写入显式 seed");
  assert.equal(context.state.showReplayPanel, true, "按回放种子重开后应重新打开复盘面板");
  assert.equal(
    context.state.debugReplayStatusText.includes("debug-panel-manual-seed"),
    true,
    "按回放种子重开后应写入成功反馈"
  );
  assert.equal(
    context.state.debugReplayStatusText.includes("不保证恢复同一手牌"),
    true,
    "seed-only 成功反馈应提示这不是完整开局恢复"
  );
  assert.equal(
    context.state.debugReplayStatusText.includes("开始发牌"),
    true,
    "按回放种子重开后应明确提示已经开始发牌"
  );

  context.state.playerLevels = { 1: "A", 2: "K", 3: "Q", 4: "J", 5: "10" };
  context.state.nextFirstDealPlayerId = 5;
  context.state.aiDifficulty = "advanced";

  assert.equal(
    context.applyDebugOpeningCodeReplay(sourceOpeningCode, "debug-panel-opening-seed"),
    true,
    "按开局码重开应成功"
  );
  assert.equal(context.state.phase, "dealing", "按开局码重开后应直接进入发牌阶段");
  assert.equal(context.state.openingCode, sourceOpeningCode, "按开局码重开后应恢复原开局码");
  assert.equal(context.state.replaySeed, "debug-panel-opening-seed", "按开局码重开时应接入显式回放种子");
  assert.equal(context.state.showReplayPanel, true, "按开局码重开后应重新打开复盘面板");
  assert.equal(
    JSON.stringify(context.state.playerLevels),
    JSON.stringify(sourcePlayerLevels),
    "按开局码重开后应恢复 5 位玩家等级"
  );
  assert.equal(context.state.nextFirstDealPlayerId, sourceFirstDealPlayerId, "按开局码重开后应恢复首抓玩家");
  assert.equal(context.state.aiDifficulty, sourceAiDifficulty, "按开局码重开后应恢复原局 AI 难度");
  assert.equal(
    context.state.debugReplayStatusText.includes("已按开局码重开并开始发牌"),
    true,
    "按开局码重开后应写入成功反馈"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
