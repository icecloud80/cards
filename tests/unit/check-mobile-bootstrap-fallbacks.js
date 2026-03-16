const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * `index2.html` 的移动端壳层脚本会频繁读写 `classList`；
 * 这里保留最小实现，就能在无浏览器环境下验证启动兜底逻辑是否仍可执行。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可复用的类名桩对象。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只实现本测试启动阶段会用到的最小接口。
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
 * 创建一个足够支撑移动端壳层脚本启动的元素桩。
 *
 * 为什么这样写：
 * 这条回归只关心 `index2.html` 内联脚本在低配 WebView 能否完成初始化，
 * 不需要真实布局；统一元素桩可以把测试焦点收敛在“会不会白屏报错”。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 一个带最小字段和方法的元素桩对象。
 *
 * 注意：
 * - `textContent`、`innerHTML`、`dataset` 和 `classList` 都需要可写。
 * - `querySelectorAll` 默认返回空数组，足够覆盖本测试的启动路径。
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
    childElementCount: 0,
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    hidden: false,
    classList: createClassListStub(),
    appendChild(child) {
      this.children.push(child);
      this.childElementCount = this.children.length;
      return child;
    },
    setAttribute() {},
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
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 360, height: 640 };
    },
  };
}

/**
 * 作用：
 * 从 `index2.html` 中提取移动端壳层的最后一段内联脚本。
 *
 * 为什么这样写：
 * 这次回归要验证的正是页面自身的 bootstrap 逻辑，
 * 直接抽取真实内联脚本执行，才能确保测试覆盖到浏览器真正会跑的那段代码。
 *
 * 输入：
 * @param {string} html - `index2.html` 完整源码字符串。
 *
 * 输出：
 * @returns {string} 最后一段内联脚本源码。
 *
 * 注意：
 * - 这里只提取最后一个内联 `<script>`，不执行前面的外链脚本标签。
 * - 如果页面结构被改到找不到这段脚本，测试必须直接失败。
 */
function extractMobileBootstrapScript(html) {
  const startToken = "<script>\n      (() => {";
  const endToken = "\n    </script>\n  </body>";
  const startIndex = html.lastIndexOf(startToken);
  const endIndex = html.lastIndexOf(endToken);

  assert.notEqual(startIndex, -1, "index2.html 应保留手游壳层内联脚本");
  assert.notEqual(endIndex, -1, "index2.html 应保留手游壳层脚本结束标签");

  return html.slice(startIndex + "<script>\n".length, endIndex).trim();
}

/**
 * 作用：
 * 创建一个模拟低配手机 WebView 的最小运行上下文。
 *
 * 为什么这样写：
 * 这次 bug 的风险点在于部分环境没有 `requestAnimationFrame` 和 `MutationObserver`；
 * 这里显式把它们拿掉，再跑真实 bootstrap 脚本，就能确认页面仍可完成初始化。
 *
 * 输入：
 * @param {void} - 通过内部固定桩对象构造上下文。
 *
 * 输出：
 * @returns {{context: object, document: object}} 可直接交给 VM 执行的上下文和文档桩。
 *
 * 注意：
 * - `setTimeout` 会同步执行回调，确保 fallback 分支在测试里真正跑到。
 * - 这里只覆盖启动阶段用到的全局对象，不扩展成完整浏览器实现。
 */
function createBootstrapContext() {
  const elements = new Map();

  function getElement(identifier) {
    if (!elements.has(identifier)) {
      elements.set(identifier, createElementStub(identifier));
    }
    return elements.get(identifier);
  }

  const document = {
    body: getElement("body"),
    documentElement: {
      style: {
        setProperty() {},
      },
    },
    getElementById(identifier) {
      return getElement(identifier);
    },
    querySelector(selector) {
      return selector === ".table" ? getElement("table") : null;
    },
    createElement(tagName) {
      return createElementStub(tagName);
    },
    addEventListener() {},
  };

  const context = {
    console,
    document,
    window: null,
    globalThis: null,
    APP_VERSION: "2.0",
    __fiveFriendsSnapshot: null,
    Event: function Event(type) {
      return { type };
    },
    MutationObserver: undefined,
    requestAnimationFrame: undefined,
    visualViewport: null,
    setTimeout(callback) {
      if (typeof callback === "function") {
        callback();
      }
      return 1;
    },
    clearTimeout() {},
    addEventListener() {},
    removeEventListener() {},
    Math,
  };
  context.window = context;
  context.globalThis = context;

  return { context, document };
}

/**
 * 作用：
 * 执行手游启动兼容性回归断言。
 *
 * 为什么这样写：
 * 现有测试主要覆盖共享层，不会执行 `index2.html` 自己的 bootstrap；
 * 这里专门锁住“没有 `requestAnimationFrame` / `MutationObserver` 也不能白屏”这条底线。
 *
 * 输入：
 * @param {void} - 通过固定路径读取 `index2.html`。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里只检查启动成功和关键字段被写入，不验证复杂交互。
 * - 如果后续 bootstrap 再引入新的硬依赖，这条回归必须能第一时间报错。
 */
function main() {
  const html = fs.readFileSync(path.join(__dirname, "../../index2.html"), "utf8");
  const script = extractMobileBootstrapScript(html);
  const { context, document } = createBootstrapContext();

  vm.createContext(context);
  vm.runInContext(script, context, { filename: "index2-inline-bootstrap.js" });

  assert.equal(document.body.classList.contains("mobile-index2"), true, "手游页面启动后应给 body 打上 mobile 样式类");
  assert.equal(document.body.dataset.mobileScreen, "setup", "在未进入对局时，手游页面应保留 setup 启动状态");
  assert.equal(document.getElementById("mobileInfoVersion").textContent, "v2.0", "手游信息面板应在 fallback 环境下继续显示版本号");
}

main();
