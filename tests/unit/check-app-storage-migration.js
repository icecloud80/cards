const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

const APP_SETTINGS_STORAGE_KEY = "five-friends-app-settings-v1";
const APP_PROGRESS_STORAGE_KEY = "five-friends-app-progress-v1";
const APP_ROUND_STORAGE_KEY = "five-friends-app-round-v1";
const CARD_FACE_STORAGE_KEY = "five-friends-card-face-mobile-v1";
const PROGRESS_COOKIE_KEY = "five-friends-progress-mobile-v1";

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * `main.js` 与共享状态渲染会频繁访问 `classList`；
 * 统一在测试里保留这组最小接口后，native 与 web 两条存储路径都能在同一份 VM 上下文里稳定启动。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add:Function,remove:Function,toggle:Function,contains:Function}} 可复用的类名桩对象。
 *
 * 注意：
 * - `toggle` 必须兼容第二个布尔参数。
 * - 这里只实现本回归实际会用到的最小能力。
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
 * 创建一个可绑定点击事件的元素桩对象。
 *
 * 为什么这样写：
 * 这条回归需要让 `main.js` 在无浏览器环境下完整挂起事件监听；
 * 只要元素支持最小的属性、监听器和 `.click()` 语义，就足以覆盖存储迁移相关逻辑。
 *
 * 输入：
 * @param {string} identifier - 当前元素的标识符。
 *
 * 输出：
 * @returns {object} 具备最小 DOM 交互能力的元素桩。
 *
 * 注意：
 * - `closest()` 这里只返回 `null`，因为本回归不会触发复杂事件代理。
 * - `.click()` 需要尊重 `disabled`，避免测试误绕过按钮禁用态。
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
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
      return child;
    },
    setAttribute() {},
    getAttribute() {
      return null;
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
    focus() {},
    select() {},
  };
}

/**
 * 作用：
 * 创建一份可用于 shared + main 轻量启动的 VM 上下文。
 *
 * 为什么这样写：
 * 这次改动跨越 `config.js / game.js / main.js`，直接把真实脚本装进 VM 能更接近运行态；
 * 同时又能精确控制 `localStorage`、`cookie` 和 `Capacitor Preferences`，便于分别验证 Web 与 native 分支。
 *
 * 输入：
 * @param {{native?:boolean,localStorageEntries?:Array<[string,string]>,cookie?:string,preferenceEntries?:Array<[string,string]>}} [options={}] - 当前上下文的存储预置。
 *
 * 输出：
 * @returns {{context:object,elements:Map<string,object>,localStorageMap:Map<string,string>,preferenceMap:Map<string,string>,document:object}} 供断言使用的 VM 环境。
 *
 * 注意：
 * - native 场景只通过 `window.Capacitor.isNativePlatform()` 切换，不加载真实插件实现。
 * - 这里的 `Preferences` 存储值都按字符串 map 模拟，和原生插件接口保持一致。
 */
function loadAppStorageContext(options = {}) {
  const elements = new Map();
  const localStorageMap = new Map(options.localStorageEntries || []);
  const preferenceMap = new Map(options.preferenceEntries || []);

  function getElement(identifier) {
    if (!elements.has(identifier)) {
      elements.set(identifier, createElementStub(identifier));
    }
    return elements.get(identifier);
  }

  const document = {
    cookie: options.cookie || "",
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
      getItem(key) {
        return localStorageMap.has(key) ? localStorageMap.get(key) : null;
      },
      setItem(key, value) {
        localStorageMap.set(key, String(value));
      },
      removeItem(key) {
        localStorageMap.delete(key);
      },
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
    render() {},
    renderScorePanel() {},
    renderHand() {},
    renderCenterPanel() {},
    updateActionHint() {},
    renderBottomRevealCenter() {},
    renderLastTrick() {},
    renderLogs() {},
    renderToolbarMenu() {},
    renderDebugPanel() {},
    renderReplayPanel() {},
    renderBottomPanel() {},
    renderFriendPicker() {},
    copyResultLog() {},
    downloadResultLog() {},
    pasteReplayBundleFromClipboardToReplayDrafts: async function pasteReplayBundleFromClipboardToReplayDrafts() {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
  };

  if (options.native) {
    context.Capacitor = {
      isNativePlatform() {
        return true;
      },
      Plugins: {
        Preferences: {
          async get({ key }) {
            return { value: preferenceMap.has(key) ? preferenceMap.get(key) : null };
          },
          async set({ key, value }) {
            preferenceMap.set(key, String(value));
          },
          async remove({ key }) {
            preferenceMap.delete(key);
          },
        },
      },
    };
  }

  context.window = context;
  context.globalThis = context;

  vm.createContext(context);
  const files = [
    path.join(__dirname, "../../src/platform/mobile.js"),
    path.join(__dirname, "../../src/shared/config.js"),
    path.join(__dirname, "../../src/shared/rules.js"),
    path.join(__dirname, "../../src/shared/text.js"),
    path.join(__dirname, "../../src/shared/game.js"),
    path.join(__dirname, "../../src/shared/main.js"),
  ];
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  const api = vm.runInContext(`({
    state,
    setAiDifficulty,
    setAiPace,
    applyAutoManagedState,
    startNewProgress,
    getPreferredReplayDraftSource
  })`, context);

  return {
    context: api,
    elements,
    localStorageMap,
    preferenceMap,
    document,
  };
}

/**
 * 作用：
 * 等待当前 VM 上下文里的异步存储任务全部跑完。
 *
 * 为什么这样写：
 * 这轮存储迁移大量使用 `Promise` 异步写入 `Preferences`；
 * 在断言前主动冲刷微任务队列，可以避免把“尚未写完”误判成逻辑错误。
 *
 * 输入：
 * @param {{state:object}} context - 已加载完成的 VM 上下文。
 *
 * 输出：
 * @returns {Promise<void>} 当前已排队的异步任务完成后结束。
 *
 * 注意：
 * - `appStorageHydrationPromise` 可能为空，调用方需要允许这种情况。
 * - 连续跑两轮 `Promise.resolve()` 是为了覆盖“事件里 fire-and-forget 再次排队”的场景。
 */
async function flushStorageTasks(context) {
  await context.state.appStorageHydrationPromise;
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * 作用：
 * 把玩家等级对象编码成当前仓库 cookie 使用的 payload。
 *
 * 为什么这样写：
 * native 迁移回归需要从旧 cookie 导入等级进度；
 * 用和运行态同口径的结构预制 cookie 后，才能真实覆盖“旧 Web 数据迁移进 App 存储”的链路。
 *
 * 输入：
 * @param {object} playerLevels - 当前要写入 cookie 的玩家等级集合。
 *
 * 输出：
 * @returns {string} 可直接塞进 `document.cookie` 的文本。
 *
 * 注意：
 * - 这里只生成单条 cookie，不拼其他属性。
 * - payload 结构必须保留 `savedAt`，与运行态写法保持一致。
 */
function buildProgressCookie(playerLevels) {
  const payload = encodeURIComponent(JSON.stringify({
    playerLevels,
    savedAt: 1,
  }));
  return `${PROGRESS_COOKIE_KEY}=${payload}`;
}

async function main() {
  {
    const nativeContext = loadAppStorageContext({
      native: true,
      localStorageEntries: [[CARD_FACE_STORAGE_KEY, "modern-sprite"]],
      cookie: buildProgressCookie({ 1: "A", 2: "K", 3: "Q", 4: "J", 5: "10" }),
    });

    await flushStorageTasks(nativeContext.context);

    const storedSettings = JSON.parse(nativeContext.preferenceMap.get(APP_SETTINGS_STORAGE_KEY));
    const storedProgress = JSON.parse(nativeContext.preferenceMap.get(APP_PROGRESS_STORAGE_KEY));
    assert.equal(storedSettings.cardFaceKey, "modern-sprite", "native migration should import card face into Preferences");
    assert.deepEqual(
      storedProgress.playerLevels,
      { 1: "A", 2: "K", 3: "Q", 4: "J", 5: "10" },
      "native migration should import player levels into Preferences",
    );
    assert.equal(nativeContext.context.state.hasSavedProgress, true, "native runtime should surface migrated progress as continue-able");

    nativeContext.context.setAiDifficulty("advanced");
    nativeContext.context.setAiPace("fast");
    nativeContext.context.applyAutoManagedState("persistent");
    await flushStorageTasks(nativeContext.context);

    const updatedSettings = JSON.parse(nativeContext.preferenceMap.get(APP_SETTINGS_STORAGE_KEY));
    assert.equal(updatedSettings.aiDifficulty, "advanced", "native settings should persist updated AI difficulty");
    assert.equal(updatedSettings.aiPace, "fast", "native settings should persist updated AI pace");
    assert.equal(updatedSettings.autoManageMode, "persistent", "native settings should persist persistent auto-manage mode");

    nativeContext.context.startNewProgress(true);
    await flushStorageTasks(nativeContext.context);

    const recentRound = JSON.parse(nativeContext.preferenceMap.get(APP_ROUND_STORAGE_KEY));
    assert.equal(typeof recentRound.openingCode, "string", "native recent-round storage should save opening code");
    assert.equal(recentRound.openingCode.length > 0, true, "native recent-round opening code should be non-empty");
    assert.equal(typeof recentRound.replaySeed, "string", "native recent-round storage should save replay seed");
    assert.equal(recentRound.replaySeed.length > 0, true, "native recent-round replay seed should be non-empty");

    const preferredReplayBundle = nativeContext.context.getPreferredReplayDraftSource();
    assert.equal(preferredReplayBundle.openingCode, recentRound.openingCode, "native replay drafts should prefer persisted recent opening code");
    assert.equal(preferredReplayBundle.replaySeed, recentRound.replaySeed, "native replay drafts should prefer persisted recent replay seed");
  }

  {
    const webContext = loadAppStorageContext();
    await flushStorageTasks(webContext.context);

    webContext.context.setAiDifficulty("advanced");
    webContext.context.setAiPace("fast");
    webContext.context.applyAutoManagedState("persistent");
    await flushStorageTasks(webContext.context);

    assert.equal(webContext.preferenceMap.size, 0, "web runtime should not write native Preferences storage");
    assert.equal(webContext.localStorageMap.has(APP_SETTINGS_STORAGE_KEY), false, "web runtime should not create app settings keys in localStorage");
    assert.equal(webContext.localStorageMap.has(APP_PROGRESS_STORAGE_KEY), false, "web runtime should not create app progress keys in localStorage");
    assert.equal(webContext.localStorageMap.has(APP_ROUND_STORAGE_KEY), false, "web runtime should not create app round keys in localStorage");

    webContext.context.startNewProgress();
    await flushStorageTasks(webContext.context);
    assert.equal(
      webContext.document.cookie.includes(PROGRESS_COOKIE_KEY),
      true,
      "web runtime should keep using cookie for progress persistence",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
