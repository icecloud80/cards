const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * `config.js` 和 `ui.js` 都会访问 DOM 节点的 `classList`；
 * 这里复用最小实现，确保测试专注在底部状态快照逻辑，不必引入完整浏览器环境。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可供 DOM 桩复用的类名对象。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只保留本测试会触发的最小接口。
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
 * 生成一个足够支撑共享脚本加载的元素桩。
 *
 * 为什么这样写：
 * 共享脚本会缓存大量 DOM 引用，但这条回归只需要调用 PC 紧凑 UI 的 helper；
 * 统一用轻量元素桩，可以避免测试因为缺少浏览器 API 而报错。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 带有最小字段和方法的元素桩对象。
 *
 * 注意：
 * - 文本、样式和类名字段都需要可写。
 * - `appendChild` 和 `setAttribute` 只要保持无异常即可。
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
  };
}

/**
 * 作用：
 * 载入一份包含真实共享脚本的测试上下文。
 *
 * 为什么这样写：
 * 这次要验证的是 PC 紧凑 UI 的身份徽标、手牌重叠和出牌区摘要规则；
 * 用 VM 加载真脚本可以保证断言跟生产逻辑一致，而不是复制一份假的判断代码。
 *
 * 输入：
 * @param {void} - 通过内部固定脚本路径加载 PC 环境。
 *
 * 输出：
 * @returns {{setupGame: Function, getPlayer: Function, buildCompactRoleBadgeMarkup: Function, buildTrickSpotMetricChips: Function, buildFaceDownDisplayCardNode: Function, getPcHandOverlap: Function, getPcSingleLaneHandOverlap: Function, getPcTrickSpotTitle: Function, buildPcTrickSpotRoleTag: Function, buildPcTrickSpotHeaderTags: Function, render: Function, renderHand: Function, state: object, document: object}} 当前测试需要的真实接口集合。
 *
 * 注意：
 * - 这里只加载 PC 平台脚本，避免把移动端分支带进来。
 * - `document.querySelector(".table")` 需要返回元素桩，防止布局相关代码取空。
 */
function loadUiContext() {
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

  return vm.runInContext("({ setupGame, getPlayer, buildCompactRoleBadgeMarkup, buildTrickSpotMetricChips, buildFaceDownDisplayCardNode, getPcHandOverlap, getPcSingleLaneHandOverlap, getPcTrickSpotTitle, buildPcTrickSpotRoleTag, buildPcTrickSpotHeaderTags, render, renderHand, state, document })", context);
}

/**
 * 作用：
 * 执行 PC 紧凑界面回归断言。
 *
 * 为什么这样写：
 * 这轮 PC 精修把左侧玩家面板和出牌区都改成了更轻的短信息结构；
 * 如果后续有人又把“阵营待明确”写回界面、把“闲”改回旧写法，
 * 或把出牌区的手牌/分数信息加回去，
 * 这条回归能第一时间提示信息密度回退。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里只验证紧凑 UI helper 的输出，不检查具体 DOM 样式和布局像素。
 * - 断言优先覆盖“未知阵营留空”、“闲家徽标”、“PC 标题不写出牌区”和“长手牌时加大重叠”这几个关键约束。
 */
function main() {
  const indexHtml = fs.readFileSync(path.join(__dirname, "../../index1.html"), "utf8");
  const uiSource = fs.readFileSync(path.join(__dirname, "../../src/shared/ui.js"), "utf8");
  const actionRowMatch = indexHtml.match(/<div class="bottom-action-row">([\s\S]*?)<\/div>/);
  assert.match(indexHtml, /playerSeat-2[\s\S]*playerSeat-3[\s\S]*playerSeat-4[\s\S]*playerSeat-5[\s\S]*playerSeat-1/, "PC 左侧玩家面板 DOM 顺序应为 2, 3, 4, 5, 1");
  assert.notEqual(actionRowMatch, null, "PC 页面应保留底部可见操作区容器");
  assert.match(actionRowMatch[1], /id="hintBtn"[\s\S]*id="playBtn"[\s\S]*id="declareBtn"[\s\S]*id="passCounterBtn"/, "PC 可见操作区应只保留当前仍在使用的按钮");
  assert.equal(actionRowMatch[1].includes('id="beatBtn"'), false, "PC 可见操作区不应再放入毙牌按钮");
  assert.equal(actionRowMatch[1].includes('id="newProgressBtn"'), false, "PC 可见操作区不应再放入新的游戏按钮");
  assert.equal(actionRowMatch[1].includes('id="continueGameBtn"'), false, "PC 可见操作区不应再放入继续游戏按钮");
  assert.equal(actionRowMatch[1].includes('id="startGameBtn"'), false, "PC 可见操作区不应再放入开始发牌按钮");
  assert.equal(indexHtml.includes("right: calc(50% - (var(--hand-panel-width) / 2) + 26px);"), false, "PC 操作区不应继续锚到右侧战场边缘");
  assert.equal(uiSource.includes("function syncIconButtonLabel"), true, "PC 顶部图标按钮应通过专用 helper 同步文案，避免删掉图标节点");
  assert.equal(uiSource.includes("toggleLastTrickBtn.textContent"), false, "顶部回看按钮不应再用 textContent 覆盖图标");
  assert.equal(uiSource.includes("autoManagedBtn.textContent"), false, "顶部托管按钮不应再用 textContent 覆盖图标");
  assert.equal(uiSource.includes('data-setup-pass="true"'), true, "PC 最后反主应把“不反主”并到下方直选候选里");

  const context = loadUiContext();
  context.setupGame();
  assert.equal(context.state.cardFaceKey, "sprite", "桌面端默认牌面应直接启用整图 sprite 主题");
  const unknownBadge = context.buildCompactRoleBadgeMarkup({ kind: "unknown", label: "阵营待明确" }, "seat-role-icon");
  assert.equal(unknownBadge, "", "未知阵营在紧凑界面里应直接留空");

  const bankerBadge = context.buildCompactRoleBadgeMarkup({ kind: "banker", label: "打家" }, "seat-role-icon");
  assert.equal(bankerBadge.includes("打"), true, "打家应渲染成紧凑的打家图标");

  const defenderBadge = context.buildCompactRoleBadgeMarkup({ kind: "defender", label: "闲家" }, "seat-role-icon");
  assert.equal(defenderBadge.includes("闲"), true, "闲家应渲染成紧凑的闲家图标");

  const pcSpotTitle = context.getPcTrickSpotTitle({ id: 3, name: "玩家3" });
  assert.equal(pcSpotTitle, "玩家3", "桌面端其他玩家标题不应继续拼接“出牌区”字样");

  const bankerSpotTag = context.buildPcTrickSpotRoleTag({ kind: "banker", label: "打家" });
  assert.equal(bankerSpotTag.includes("打"), true, "桌面端出牌区应能渲染打家短签");

  const friendSpotTag = context.buildPcTrickSpotRoleTag({ kind: "friend", label: "朋友" });
  assert.equal(friendSpotTag.includes("朋"), true, "桌面端出牌区应能渲染朋友短签");

  const headerTags = context.buildPcTrickSpotHeaderTags(
    { id: 1, isHuman: false },
    { kind: "friend", label: "朋友" }
  );
  assert.equal(headerTags.includes("朋"), true, "桌面端出牌区标题行应继续保留朋友短签");
  assert.equal(headerTags.includes("托管"), true, "桌面端出牌区应把托管胶囊并到身份短签旁边");

  const winningChips = context.buildTrickSpotMetricChips(
    { id: 3, level: 4, hand: [{ id: "c1" }], capturedPoints: 40, isHuman: false },
    { kind: "banker", label: "打家" },
    true
  );
  assert.equal(winningChips.includes("大"), false, "桌面端出牌区不应再通过底部信息重复渲染“大”标签");

  context.render();
  assert.equal(context.document.getElementById("beatBtn").hidden, true, "PC 操作区不应再显示毙牌按钮");
  assert.equal(context.document.getElementById("continueGameBtn").hidden, true, "PC 操作区不应再显示继续游戏按钮");
  assert.equal(context.document.getElementById("startGameBtn").hidden, true, "PC 操作区不应再显示开始游戏按钮");

  const faceDownNode = context.buildFaceDownDisplayCardNode("played-card face-down", "未翻开底牌");
  assert.equal(faceDownNode.children[0]?.className, "card-face-sprite", "翻底定主的牌背在 sprite 牌面下应复用整图牌背");

  const heavyOverlap = context.getPcHandOverlap(13, 31);
  assert.equal(heavyOverlap >= 30, true, "拿到底牌后的长手牌应适度加大重叠量，避免出现滚动条");
  assert.equal(context.getPcSingleLaneHandOverlap(31) >= 22, true, "连续牌轨模式也应在 31 张手牌时主动增加重叠");

  const human = context.getPlayer(1);
  human.hand = [
    { id: "h1", suit: "clubs", rank: "A" },
    { id: "h2", suit: "hearts", rank: "2" },
    { id: "h3", suit: "spades", rank: "10" },
  ];
  context.state.phase = "playing";
  context.state.currentTurnId = 2;
  context.renderHand();
  assert.equal(context.document.getElementById("handStatsRail").children.length > 0, true, "桌面端手牌区应渲染左侧统计列");
  assert.equal(context.document.getElementById("handGroups").children.length, 1, "桌面端手牌区应压成单条连续牌轨");
  assert.equal(typeof context.document.getElementById("handStatsRail").children[0]?.style.left, "string", "桌面端手牌统计应按对应牌段的首张牌位置精确定位");

  human.hand = [
    { id: "rj-1", suit: "joker", rank: "RJ" },
    { id: "rj-2", suit: "joker", rank: "RJ" },
    { id: "rj-3", suit: "joker", rank: "RJ" },
  ];
  context.state.phase = "countering";
  context.state.currentTurnId = 1;
  context.state.declaration = {
    playerId: 2,
    suit: "clubs",
    rank: "2",
    count: 2,
    cards: [
      { id: "decl-1", suit: "clubs", rank: "2" },
      { id: "decl-2", suit: "clubs", rank: "2" },
    ],
  };
  context.state.selectedSetupOptionKey = null;
  context.render();
  assert.equal(context.document.getElementById("declareBtn").hidden, true, "PC 最后反主不应继续显示上方确认反主按钮");
  assert.equal(context.document.getElementById("passCounterBtn").hidden, true, "PC 最后反主不应继续显示上方不反主按钮");
  assert.equal(context.document.getElementById("setupOptions").innerHTML.includes('data-setup-pass="true"'), true, "PC 最后反主应在下方候选区直接提供不反主按钮");
  assert.equal(context.document.getElementById("setupOptions").innerHTML.includes("反无主"), false, "PC 最后反主下方直选项不应再回退成整句文案");

  const chips = context.buildTrickSpotMetricChips(
    { id: 3, level: 4, hand: [{ id: "c1" }], capturedPoints: 40, isHuman: false },
    { kind: "unknown", label: "阵营待明确" },
    false
  );
  assert.equal(chips.includes("Lv:4"), false, "出牌区不应再显示等级信息");
  assert.equal(chips.includes("剩"), false, "出牌区不应再显示剩余手牌数量");
  assert.equal(chips.includes("分"), false, "出牌区不应再显示个人分数");
  assert.equal(chips.includes("托管"), false, "出牌区不应再把托管胶囊放在右侧指标列");
}

main();
