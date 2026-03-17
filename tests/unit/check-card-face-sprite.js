const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 创建一个最小可用的类名集合桩对象。
 *
 * 为什么这样写：
 * 共享脚本在初始化 DOM 引用时会直接访问 `classList`；
 * 这里保留最小实现，就能把测试聚焦在牌面渲染分支，而不是浏览器 API 细节。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {{add: Function, remove: Function, toggle: Function, contains: Function}} 可复用的类名桩对象。
 *
 * 注意：
 * - `toggle` 需要兼容第二个布尔参数。
 * - 这里只实现本测试会用到的最小接口。
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
 * 创建一个足够支撑共享脚本的最小元素桩。
 *
 * 为什么这样写：
 * 这条回归只需要检查 `buildCardNode()` 产出的子节点类型和 sprite 样式；
 * 用统一元素桩即可避免引入完整浏览器环境，同时让断言直接读取节点属性。
 *
 * 输入：
 * @param {string} identifier - 当前元素的 ID 或标签名。
 *
 * 输出：
 * @returns {object} 带有最小字段和方法的元素桩对象。
 *
 * 注意：
 * - 需要保留 `children / style / className / src` 等可写字段，方便后续断言。
 * - `setAttribute` 会把值存进 `attributes`，避免丢失语义信息。
 */
function createElementStub(identifier) {
  return {
    id: identifier,
    tagName: String(identifier).toUpperCase(),
    dataset: {},
    style: {},
    children: [],
    attributes: {},
    className: "",
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    hidden: false,
    src: "",
    alt: "",
    type: "",
    classList: createClassListStub(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
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
 * 为指定平台加载真实的牌面渲染上下文。
 *
 * 为什么这样写：
 * 这次要验证的是“PC 与 mobile 都支持 sprite 牌面”的跨平台配置；
 * 直接用 VM 加载真实脚本，可以确保断言覆盖到生产里真正会执行的配置和 helper。
 *
 * 输入：
 * @param {"pc"|"mobile"} platform - 当前要模拟的平台。
 *
 * 输出：
 * @returns {{setupGame: Function, buildCardNode: Function, buildFaceDownDisplayCardNode: Function, getCardFaceOption: Function, getCardFaceSpriteSheet: Function, getCardSpriteSheetPosition: Function, state: object, APP_PLATFORM: string, CARD_FACE_OPTIONS: object[]}} 当前测试需要的真实接口集合。
 *
 * 注意：
 * - `document.querySelector(".table")` 必须返回元素桩，避免布局相关脚本取空报错。
 * - 这里只加载当前回归所需的最小脚本集合，不额外引入主入口事件逻辑。
 */
function loadCardFaceContext(platform) {
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
    path.join(__dirname, "../../src/platform", `${platform}.js`),
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

  return vm.runInContext("({ setupGame, buildCardNode, buildFaceDownDisplayCardNode, getCardFaceOption, getCardFaceSpriteSheet, getCardSpriteSheetPosition, state, APP_PLATFORM, CARD_FACE_OPTIONS })", context);
}

/**
 * 作用：
 * 校验 `m_cards` 对应的整图 SVG 资源已经按既定网格生成完成。
 *
 * 为什么这样写：
 * 这次除了沿用 `poker.png`，还新增了基于 `m_cards` 的 `m_cards_sprite.svg`；
 * 仅检查配置项还不够，如果资源文件缺失、尺寸不对或关键牌位偏了，运行时同样会裁切出错。
 *
 * 输入：
 * @param {void} - 无额外输入，直接读取仓库内的生成产物。
 *
 * 输出：
 * @returns {void} 关键结构与牌位校验通过后正常返回。
 *
 * 注意：
 * - 这里只校验少量关键锚点，不做整张 SVG 的逐像素比较。
 * - 最后一行必须继续保留 `红王 / 黑王 / 红背牌` 三个关键 tile。
 */
function assertModernSpriteAsset() {
  const spritePath = path.join(__dirname, "../../m_cards_sprite.svg");
  assert.equal(fs.existsSync(spritePath), true, "应生成 m_cards_sprite.svg 整图资源");

  const spriteContent = fs.readFileSync(spritePath, "utf8");
  const tileTagMatches = [...spriteContent.matchAll(/<svg\b([^>]*\bdata-card-id="[^"]+"[^>]*)>/g)];
  assert.match(spriteContent, /<svg[^>]+width="1170"[^>]+height="600"[^>]+viewBox="0 0 1170 600"/, "m_cards SVG sprite 应保持与 poker.png 对齐的整体尺寸");
  assert.doesNotMatch(spriteContent, /<svg[^>]+fill="none"/, "m_cards SVG sprite 根节点不能带 fill=none，否则黑色花色会被继承成透明");
  assert.match(spriteContent, /<svg[^>]+data-card-id="hearts-3"[^>]+preserveAspectRatio="none"|<svg[^>]+preserveAspectRatio="none"[^>]+data-card-id="hearts-3"/, "新牌整图里的心 3 tile 应贴满卡格，避免手游小卡位里出现左右留白漂移");
  assert.match(spriteContent, /<svg[^>]+data-card-id="joker-RJ"[^>]+preserveAspectRatio="none"|<svg[^>]+preserveAspectRatio="none"[^>]+data-card-id="joker-RJ"/, "大小王 tile 也应贴满卡格，避免最后一行在 mobile 上看起来比普通牌更窄");
  assert.equal(tileTagMatches.length, 55, "m_cards SVG sprite 应只包含 55 个实际牌格节点");
  assert.doesNotMatch(spriteContent, /preserveAspectRatio="xMidYMid meet"/, "m_cards SVG sprite 不应再保留会导致少数牌留边的 meet 缩放");
  assert.match(spriteContent, /<svg[^>]+x="0"[^>]+y="0"[^>]+data-card-id="hearts-A"/, "红桃 A 应位于首行首列");
  assert.match(spriteContent, /<svg[^>]+x="1080"[^>]+y="360"[^>]+data-card-id="clubs-K"/, "梅花 K 应位于第 4 行最后一列");
  assert.match(spriteContent, /<svg[^>]+x="0"[^>]+y="480"[^>]+data-card-id="joker-RJ"/, "红王应位于最后一行首列");
  assert.match(spriteContent, /<svg[^>]+x="90"[^>]+y="480"[^>]+data-card-id="joker-BJ"/, "黑王应位于最后一行第 2 列");
  assert.match(spriteContent, /<svg[^>]+x="180"[^>]+y="480"[^>]+data-card-id="back-red"/, "红背牌应位于最后一行第 3 列");
  for (const [, attributes] of tileTagMatches) {
    const cardId = attributes.match(/\bdata-card-id="([^"]+)"/)?.[1] || "unknown";
    const width = Number(attributes.match(/\bwidth="([^"]+)"/)?.[1]);
    const height = Number(attributes.match(/\bheight="([^"]+)"/)?.[1]);
    const x = Number(attributes.match(/\bx="([^"]+)"/)?.[1]);
    const y = Number(attributes.match(/\by="([^"]+)"/)?.[1]);
    const viewBox = attributes.match(/\bviewBox="([^"]+)"/)?.[1];
    assert.equal(width, 90, `${cardId} 应固定占用 90px 宽牌格`);
    assert.equal(height, 120, `${cardId} 应固定占用 120px 高牌格`);
    assert.equal(viewBox, "0 0 90 120", `${cardId} 的外层 tile 应使用统一的 90x120 视窗`);
    assert.equal(Number.isInteger(x / 90), true, `${cardId} 的横向坐标应紧贴 90px 网格，不留额外空隙`);
    assert.equal(Number.isInteger(y / 120), true, `${cardId} 的纵向坐标应紧贴 120px 网格，不留额外空隙`);
  }
}

/**
 * 作用：
 * 执行整图牌面回归断言。
 *
 * 为什么这样写：
 * 这次改动同时维护 `poker.png` 与 `m_cards_sprite.svg` 两套整图牌面；
 * 如果后续有人误删 sprite 配置、把裁切坐标改乱，或者只剩一端还能切整图牌面，
 * 这条回归可以第一时间把问题拦住。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里优先验证“跨平台可用、关键牌位坐标正确、能切换回 SVG”三类行为。
 * - 不检查最终视觉像素，只检查 DOM 结构和关键样式值。
 */
function main() {
  assertModernSpriteAsset();

  const pc = loadCardFaceContext("pc");
  pc.setupGame();
  assert.equal(pc.state.cardFaceKey, "sprite", "PC 默认牌面应直接切到统一的 m_cards 整图主题");

  const spriteOption = pc.getCardFaceOption("sprite");
  assert.equal(spriteOption.key, "sprite", "PC 应提供整图牌面选项");
  assert.equal(spriteOption.spriteSheet.src, "./m_cards_sprite.svg", "PC 整图牌面应统一使用 m_cards_sprite.svg");
  const modernSpriteOption = pc.getCardFaceOption("modern-sprite");
  assert.equal(modernSpriteOption.key, "sprite", "PC 应把旧的 modern-sprite 存档兼容映射到统一整图牌面");
  assert.equal(modernSpriteOption.spriteSheet.src, "./m_cards_sprite.svg", "PC 兼容映射后的整图牌面应继续指向 m_cards_sprite.svg");
  assert.equal(pc.CARD_FACE_OPTIONS.some((option) => option.key === "modern"), false, "PC 不应再保留逐张 m_cards 牌面选项");
  assert.equal(pc.CARD_FACE_OPTIONS.some((option) => option.key === "modern-sprite"), false, "PC 运行态不应再并列保留旧的新牌整图入口");
  const heartAcePosition = pc.getCardSpriteSheetPosition({ suit: "hearts", rank: "A" }, spriteOption.spriteSheet);
  assert.equal(heartAcePosition.column, 0, "红桃 A 应位于首列");
  assert.equal(heartAcePosition.row, 0, "红桃 A 应位于首行");
  assert.equal(heartAcePosition.xPercent, 0, "红桃 A 的横向裁切应落在左边界");
  assert.equal(heartAcePosition.yPercent, 0, "红桃 A 的纵向裁切应落在上边界");

  const clubKingPosition = pc.getCardSpriteSheetPosition({ suit: "clubs", rank: "K" }, spriteOption.spriteSheet);
  assert.equal(clubKingPosition.column, 12, "梅花 K 应位于最后一列");
  assert.equal(clubKingPosition.row, 3, "梅花 K 应位于第 4 行");
  assert.equal(clubKingPosition.xPercent, 100, "梅花 K 的横向裁切应落在右边界");
  assert.equal(clubKingPosition.yPercent, 75, "梅花 K 的纵向裁切应落在第 4 行");

  const redJokerPosition = pc.getCardSpriteSheetPosition({ suit: "joker", rank: "RJ" }, spriteOption.spriteSheet);
  assert.equal(redJokerPosition.column, 0, "红王应位于 joker 行首列");
  assert.equal(redJokerPosition.row, 4, "红王应位于 sprite 最后一行");
  assert.equal(redJokerPosition.xPercent, 0, "红王的横向裁切应落在左边界");
  assert.equal(redJokerPosition.yPercent, 100, "红王的纵向裁切应落在底边界");

  pc.state.cardFaceKey = "sprite";
  assert.equal(pc.getCardFaceSpriteSheet().src, "./m_cards_sprite.svg", "PC 切到整图牌面后应能读到统一 sprite 配置");

  const spriteNode = pc.buildCardNode({ id: "c1", suit: "hearts", rank: "A" }, "card-btn");
  assert.equal(spriteNode.children[0].className, "card-face-sprite", "PC 整图牌面应渲染成 sprite 节点而不是 img");
  assert.equal(spriteNode.children[0].style.backgroundImage, 'url("./m_cards_sprite.svg")', "sprite 节点应指向统一的 m_cards_sprite.svg");
  assert.equal(spriteNode.children[0].style.backgroundPosition, "0% 0%", "红桃 A 的 sprite 裁切位置应为左上角");

  const clubKingNode = pc.buildCardNode({ id: "c2", suit: "clubs", rank: "K" }, "card-btn");
  assert.equal(clubKingNode.children[0].style.backgroundPosition, "100% 75%", "梅花 K 的 sprite 裁切位置应落在第 4 行最后一列");

  pc.state.cardFaceKey = "modern-sprite";
  const modernSpriteNode = pc.buildCardNode({ id: "c2-modern", suit: "hearts", rank: "A" }, "card-btn");
  assert.equal(modernSpriteNode.children[0].className, "card-face-sprite", "PC 即使读到旧 key，也应继续渲染统一 sprite 节点");
  assert.equal(modernSpriteNode.children[0].style.backgroundImage, 'url("./m_cards_sprite.svg")', "PC 旧 key 兼容路径也应指向 m_cards_sprite.svg");
  assert.equal(modernSpriteNode.children[0].style.backgroundPosition, "0% 0%", "PC 旧 key 兼容路径下的红桃 A 仍应落在左上角");

  pc.state.cardFaceKey = "classic";
  const classicNode = pc.buildCardNode({ id: "c3", suit: "hearts", rank: "A" }, "card-btn");
  assert.equal(classicNode.children[0].tagName, "IMG", "切回经典牌面后应回退到逐张图片");
  assert.equal(classicNode.children[0].src, "./cards/ace_of_hearts.svg", "经典牌面应继续使用原有 SVG 资源");

  const mobile = loadCardFaceContext("mobile");
  mobile.setupGame();
  assert.equal(mobile.state.cardFaceKey, "sprite", "mobile 默认牌面应直接切到统一的 m_cards 整图主题");
  const mobileSpriteOption = mobile.getCardFaceOption("sprite");
  assert.equal(mobileSpriteOption.key, "sprite", "mobile 也应提供整图牌面选项");
  assert.equal(mobileSpriteOption.spriteSheet.src, "./m_cards_sprite.svg", "mobile 整图牌面也应统一使用 m_cards_sprite.svg");
  const mobileModernSpriteOption = mobile.getCardFaceOption("modern-sprite");
  assert.equal(mobileModernSpriteOption.key, "sprite", "mobile 也应把旧的 modern-sprite 存档兼容映射到统一整图牌面");
  assert.equal(mobileModernSpriteOption.spriteSheet.src, "./m_cards_sprite.svg", "mobile 兼容映射后的整图牌面也应指向 m_cards_sprite.svg");
  assert.equal(mobile.CARD_FACE_OPTIONS.some((option) => option.key === "modern"), false, "mobile 不应再保留逐张 m_cards 牌面选项");
  assert.equal(mobile.CARD_FACE_OPTIONS.some((option) => option.key === "modern-sprite"), false, "mobile 运行态不应再并列保留旧的新牌整图入口");

  mobile.state.cardFaceKey = "sprite";
  const mobileSpriteNode = mobile.buildCardNode({ id: "m1", suit: "spades", rank: "10" }, "card-btn");
  assert.equal(mobileSpriteNode.children[0].className, "card-face-sprite", "mobile 切到整图牌面后也应渲染 sprite 节点");
  assert.equal(mobileSpriteNode.children[0].style.backgroundImage, 'url("./m_cards_sprite.svg")', "mobile sprite 节点应指向统一的 m_cards_sprite.svg");
  assert.equal(mobileSpriteNode.children[0].style.backgroundPosition, "75% 50%", "黑桃 10 应映射到第 3 行第 10 列");
  assert.equal(mobileSpriteNode.children[0].style.width, "90%", "mobile 默认整图牌面应沿用新 sprite 的缩小可视区域");
  assert.equal(mobileSpriteNode.children[0].style.margin, "5% auto 0", "mobile 默认整图牌面应继续保留安全边");

  mobile.state.cardFaceKey = "modern-sprite";
  const mobileModernSpriteNode = mobile.buildCardNode({ id: "m1-modern", suit: "spades", rank: "10" }, "card-btn");
  assert.equal(mobileModernSpriteNode.children[0].className, "card-face-sprite", "mobile 即使读到旧 key，也应继续渲染统一 sprite 节点");
  assert.equal(mobileModernSpriteNode.children[0].style.backgroundImage, 'url("./m_cards_sprite.svg")', "mobile 旧 key 兼容路径也应指向 m_cards_sprite.svg");
  assert.equal(mobileModernSpriteNode.children[0].style.backgroundPosition, "75% 50%", "mobile 旧 key 兼容路径也应复用同一套裁切坐标");
  assert.equal(mobileModernSpriteNode.children[0].style.width, "90%", "mobile 旧 key 兼容路径也应保留缩小后的可视区域");
  assert.equal(mobileModernSpriteNode.children[0].style.height, "90%", "mobile 旧 key 兼容路径也应保留缩小后的高度");
  assert.equal(mobileModernSpriteNode.children[0].style.margin, "5% auto 0", "mobile 旧 key 兼容路径也应保留安全边");

  const mobileDefaultFaceDownNode = mobile.buildFaceDownDisplayCardNode("played-card face-down", "未翻开底牌");
  assert.equal(mobileDefaultFaceDownNode.children[0].className, "card-face-sprite", "翻底定主的未翻开底牌在 mobile 默认整图主题下也应复用 sprite 牌背");
  assert.equal(mobileDefaultFaceDownNode.children[0].style.backgroundImage, 'url("./m_cards_sprite.svg")', "mobile 默认整图主题下的牌背应优先指向 m_cards_sprite.svg");
  assert.equal(mobileDefaultFaceDownNode.children[0].style.width, "90%", "mobile 默认整图主题下的牌背也应沿用缩小后的可视区域");
  assert.equal(mobileDefaultFaceDownNode.children[0].style.margin, "5% auto 0", "mobile 默认整图主题下的牌背也应保留安全边");

  mobile.state.cardFaceKey = "classic";
  const mobileClassicFaceDownNode = mobile.buildFaceDownDisplayCardNode("played-card face-down", "未翻开底牌");
  assert.equal(mobileClassicFaceDownNode.children[0].className, "card-face-sprite", "翻底定主的未翻开底牌即使在 mobile 经典牌面下也应复用 sprite 牌背");
  assert.equal(mobileClassicFaceDownNode.children[0].style.backgroundImage, 'url("./m_cards_sprite.svg")', "mobile 切回经典牌面后，翻底定主的 sprite 牌背应回退到统一的 m_cards_sprite.svg");
  assert.equal(mobileClassicFaceDownNode.children[0].style.width, "90%", "mobile 经典牌面回退到统一 sprite 牌背时也应继续沿用新整图缩放");
}

main();
