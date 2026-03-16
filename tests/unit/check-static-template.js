const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 从静态模板页源码里提取 mock 数据对象。
 *
 * 为什么这样写：
 * `index-static.html` 是独立静态模板，不会被现有共享脚本加载；
 * 直接从 HTML 内嵌脚本里提取 `MOCK_PAGE`，
 * 就能在不引入浏览器环境的前提下校验模板数据规模是否符合设计预期。
 *
 * 输入：
 * @param {string} html - `index-static.html` 的完整源码字符串。
 *
 * 输出：
 * @returns {object} 模板页内定义的 `MOCK_PAGE` 数据对象。
 *
 * 注意：
 * - 这里只提取 `const MOCK_PAGE = ...` 这段对象字面量，不执行整页其余脚本。
 * - 如果找不到锚点，测试必须直接失败，避免静默漏检。
 */
function extractMockPage(html) {
  const startToken = "const MOCK_PAGE =";
  const endToken = "function getStaticHandOverlap";
  const startIndex = html.indexOf(startToken);
  const endIndex = html.indexOf(endToken);

  assert.notEqual(startIndex, -1, "静态模板页应定义 MOCK_PAGE mock 数据对象");
  assert.notEqual(endIndex, -1, "静态模板页应保留手牌重叠 helper，方便单独调布局");

  const source = html.slice(startIndex, endIndex);
  return vm.runInNewContext(`${source}\nMOCK_PAGE;`, {});
}

/**
 * 作用：
 * 校验静态模板页是否保留完整的 PC 视觉测试样本。
 *
 * 为什么这样写：
 * 这页后续会被专门拿来对齐手牌区、顶部状态和中央出牌区的静态视觉；
 * 如果 mock 数据规模被改小，尤其是 31 张手牌样本没了，页面就失去测试价值。
 *
 * 输入：
 * @param {void} - 通过固定路径读取静态模板页源码。
 *
 * 输出：
 * @returns {void} 所有关键断言通过后正常退出。
 *
 * 注意：
 * - 这里只验证模板存在、交互入口和 mock 数据规模，不检查像素级布局。
 * - `handGroups` 的总张数必须固定为 31。
 */
function main() {
  const file = path.join(__dirname, "../../index-static.html");
  const html = fs.readFileSync(file, "utf8");
  const mockPage = extractMockPage(html);

  assert.equal(html.includes("PC 静态模板"), true, "静态模板页应使用独立标题，方便和运行态页面区分");
  assert.equal(mockPage.seats.length, 5, "静态模板页应保留完整的 5 个玩家面板");
  assert.equal(mockPage.trickSpots.length, 5, "静态模板页应保留完整的 5 个中央出牌区");
  assert.equal(mockPage.actions.length >= 2, true, "静态模板页应提供至少两枚右侧操作按钮");
  assert.equal(html.includes('id="logPanel"'), true, "静态模板页应提供可开关的信息面板");
  assert.equal(html.includes('id="lastTrickPanel"'), true, "静态模板页应提供可开关的上一局回看面板");
  assert.equal(html.includes('id="toolbarMenuPanel"'), true, "静态模板页应提供设置菜单面板");
  assert.equal(html.includes('id="menuAiPaceButtons"'), true, "静态模板页设置菜单应提供四档节奏按钮组");
  assert.equal(html.includes('id="menuHomeBtn"'), true, "静态模板页设置菜单应提供回到首页按钮");
  assert.equal(html.includes('id="toggleCardFaceBtn"'), true, "静态模板页应保留切换牌面按钮");
  assert.equal(html.includes('id="handStatsRail"'), true, "静态模板页应保留左侧手牌统计列容器");
  assert.equal(html.includes("./m_cards_sprite.svg"), true, "静态模板页应支持切到 m_cards 的整图 sprite 资源");
  assert.equal(html.includes("./poker.png"), true, "静态模板页默认牌面应支持 poker.png 整图 sprite");
  assert.equal(html.includes("STATIC_CARD_FACES"), true, "静态模板页应定义可切换的牌面列表");
  assert.equal(html.includes('cardFaceKey: "sprite"'), true, "静态模板页应默认启用 sprite 牌面");
  assert.equal(html.includes("buildStaticHandStatsMarkup"), true, "静态模板页应提供按首牌起点定位花色统计的 helper");
  assert.equal(html.includes("spot-role-chip managed"), true, "静态模板页应支持把托管胶囊并到出牌区身份短签旁边");
  assert.equal(mockPage.toolbarIcons.length, 4, "静态模板页顶部工具区应改成 4 个按钮");
  assert.equal(mockPage.topbarStatus[0].key, "本局", "静态模板页顶部应改用“本局”标签");
  assert.equal(mockPage.topbarStatus[1].key, "主牌", "静态模板页顶部应改用“主牌”标签");
  assert.equal(mockPage.topbarStatus[2].key, "朋友", "静态模板页顶部应改用“朋友”标签");
  assert.equal(mockPage.topbarStatus[2].subline.includes("/"), true, "静态模板页朋友状态应使用 1/2 这类紧凑位置写法");
  assert.equal(mockPage.cardFaceLabel, "整图牌面", "静态模板页应把整图 sprite 作为默认牌面标签");
  assert.equal(mockPage.seats.map((seat) => seat.id).join(","), "2,3,4,5,1", "静态模板页左侧玩家列顺序应为 2, 3, 4, 5, 1");

  const handTotal = mockPage.handGroups.reduce((sum, group) => sum + group.cards.length, 0);
  assert.equal(handTotal, 31, "静态模板页的手牌区应固定铺满 31 张牌");
}

main();
