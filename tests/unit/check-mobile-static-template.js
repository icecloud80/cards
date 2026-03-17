const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 从手游静态模板页源码里提取 mock 数据对象。
 *
 * 为什么这样写：
 * `index2-static.html` 是独立静态页，不会加载共享运行时；
 * 直接从 HTML 里提取 `MOCK_MOBILE_PAGE`，就能在 Node 环境下校验模板数据规模和关键入口。
 *
 * 输入：
 * @param {string} html - `index2-static.html` 的完整源码。
 *
 * 输出：
 * @returns {object} 静态模板页里定义的 `MOCK_MOBILE_PAGE` 对象。
 *
 * 注意：
 * - 这里只执行 mock 数据声明本身，不执行整页其余脚本。
 * - 如果锚点缺失，测试必须直接失败，避免静默漏检。
 */
function extractMockMobilePage(html) {
  const startToken = "const MOCK_MOBILE_PAGE =";
  const endToken = "function parseStaticCardSource";
  const startIndex = html.indexOf(startToken);
  const endIndex = html.indexOf(endToken);

  assert.notEqual(startIndex, -1, "手游静态模板页应定义 MOCK_MOBILE_PAGE mock 数据对象");
  assert.notEqual(endIndex, -1, "手游静态模板页应保留牌面解析 helper，方便独立渲染 sprite");

  const source = html.slice(startIndex, endIndex);
  return vm.runInNewContext(`${source}\nMOCK_MOBILE_PAGE;`, {});
}

/**
 * 作用：
 * 校验手游静态模板页是否保留完整的演示结构与 mock 数据。
 *
 * 为什么这样写：
 * 这页的价值在于作为 `index2.html` 的独立静态演示页；
 * 如果菜单、上一轮、底牌或手牌 mock 被删掉，页面就失去对齐和评审意义。
 *
 * 输入：
 * @param {void} - 通过固定路径读取静态模板页源码。
 *
 * 输出：
 * @returns {void} 所有断言通过后正常退出。
 *
 * 注意：
 * - 这里只检查关键结构和数据规模，不检查像素级布局。
 * - `trickSpots` 必须固定为 5 个位置，保证和运行态布局一致。
 */
function main() {
  const file = path.join(__dirname, "../../index2-static.html");
  const html = fs.readFileSync(file, "utf8");
  const mockPage = extractMockMobilePage(html);

  assert.equal(html.includes("Mobile 静态模板"), true, "手游静态模板页应使用独立标题，方便和运行态页面区分");
  assert.equal(html.includes('id="mobileMenuBtn"'), true, "手游静态模板页应保留设置菜单入口");
  assert.equal(html.includes('id="mobileSettingsSheet"'), true, "手游静态模板页应提供设置菜单浮层");
  assert.equal(html.includes('id="mobileMenuAiPaceButtons"'), true, "手游静态模板页设置菜单应提供四档节奏按钮组");
  assert.equal(html.includes('id="mobileInfoSheet"'), true, "手游静态模板页应提供信息面板");
  assert.equal(html.includes('id="mobileLastTrickSheet"'), true, "手游静态模板页应提供上一轮回看面板");
  assert.equal(html.includes('id="mobileBottomSheet"'), true, "手游静态模板页应提供底牌面板");
  assert.equal(html.includes('id="mobileRulesSheet"'), true, "手游静态模板页应提供规则帮助面板");
  assert.equal(html.includes('id="mobileSetupScreen"'), true, "手游静态模板页应提供开始页 mock");
  assert.equal(html.includes("STATIC_CARD_FACES"), true, "手游静态模板页应定义可切换的牌面列表");
  assert.equal(html.includes('cardFaceKey: "sprite"'), true, "手游静态模板页应默认启用 sprite 牌面");
  assert.equal(html.includes("./images/poker.png"), true, "手游静态模板页应继续提供 poker.png 整图 sprite 资源");
  assert.equal(html.includes("./images/m_cards_sprite.png"), true, "手游静态模板页应新增 modern-sprite 对应的 m_cards_sprite.png 资源");
  assert.equal(html.includes('label: "现代整图"'), true, "手游静态模板页应提供现代整图主题标签");

  assert.equal(mockPage.trickSpots.length, 5, "手游静态模板页应保留完整的 5 个中央出牌位");
  assert.equal(mockPage.players.length, 5, "手游静态模板页应保留完整的 5 位玩家信息");
  assert.equal(mockPage.actions.length >= 4, true, "手游静态模板页应保留完整的底部操作按钮组");
  assert.equal(mockPage.bottomCards.length, 7, "手游静态模板页的底牌样例应固定为 7 张");
  assert.equal(mockPage.rules.length >= 4, true, "手游静态模板页应提供至少 4 条规则帮助");

  const handTotal = mockPage.handGroups.reduce((sum, group) => sum + group.cards.length, 0);
  assert.equal(handTotal, 25, "手游静态模板页的手牌区应固定提供 25 张样例牌");
}

main();
