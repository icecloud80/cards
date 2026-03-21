const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 从页面模板里提取规则帮助面板中的所有条目文本。
 *
 * 为什么这样写：
 * 规则帮助现在在 `index1 / index2 / index-app` 里各有一份真实 DOM；
 * 单独把提取逻辑收成 helper 后，就能稳定比较三端文案是否完全一致，而不用手写多套重复断言。
 *
 * 输入：
 * @param {string} html - 当前页面模板源码。
 *
 * 输出：
 * @returns {string[]} 当前规则帮助面板里的所有条目文本。
 *
 * 注意：
 * - 这里只读取第一个 `rules-list`，默认三端模板都只保留一份规则帮助列表。
 * - 提取时会顺手压缩空白，避免缩进差异把静态断言变脆。
 */
function extractRulesListItems(html) {
  const listMatch = html.match(/<ul class="rules-list">([\s\S]*?)<\/ul>/);
  assert.notEqual(listMatch, null, "页面模板应保留 rules-list 规则帮助列表");
  return Array.from(listMatch[1].matchAll(/<li>([\s\S]*?)<\/li>/g), (match) =>
    match[1]
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * 作用：
 * 读取仓库中的页面模板源码。
 *
 * 为什么这样写：
 * 这条回归只关心真实模板文案，不需要启动浏览器；
 * 直接读文件既快又稳定，还能把三端文案一致性锁成提交门禁。
 *
 * 输入：
 * @param {string} relativePath - 相对仓库根目录的页面路径。
 *
 * 输出：
 * @returns {string} 对应页面的完整 HTML 源码。
 *
 * 注意：
 * - 这里只服务静态模板断言，不做 DOM 解析或脚本执行。
 * - 路径必须继续相对 `tests/unit` 的真实仓库位置解析。
 */
function readHtml(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../..", relativePath), "utf8");
}

/**
 * 作用：
 * 执行“规则帮助文案三端一致”的静态回归。
 *
 * 为什么这样写：
 * 用户这次要 review 的是游戏内真实可见的规则帮助文本；
 * 用静态回归把 `index1 / index2 / index-app` 三端统一锁住后，后续再改文案时就不会只改其中一端。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {void} 所有断言通过后正常结束。
 *
 * 注意：
 * - 这里只校验文案本身，不判断规则真伪；规则口径仍以规则文档和实现为准。
 * - 若后续要再精修 wording，应同步更新这条测试里的期望数组。
 */
function main() {
  const expectedItems = [
    "这局不只是比这一轮谁大，核心是和队友配合，把自己的等级一路往上打。",
    "打家方赢法：把闲家总分压到 120 分以下，而且这局没有被级牌扣底。",
    "闲家方赢法：总分打到 120 分以上，或用级牌扣底直接赢。",
    "升级先看总分：打家 0 分大光升 3 级，1-59 分小光升 2 级，60-119 分升 1 级；闲家 165-224 分升 1 级，之后每多 60 分再升 1 级。",
    "新牌局先点“开始发牌”；首局由玩家1先抓，之后由上一局最后扣底或守底成功的人先抓牌。",
    "亮主和反主都看自己的 Lv，不能自己反自己；如果发牌结束仍没人亮主，就由先抓牌的人翻底定主并直接做打家。",
    "打家拿起底牌后要再扣回 7 张；这 7 张底牌里的分牌总和不能超过 25 分。",
    "打家扣底后先叫朋友；朋友看“第几张目标牌”来定，误出前置张数时，这局可能直接变成 1 打 4。",
    "首家只能出同一门的合法牌型；跟牌先跟同门，同门不够就全出。同门够时要先跟结构：拖拉机 / 火车先跟连对，再尽量跟对子；刻子先跟刻子，不够时跟一对；推土机先跟刻子，再尽量跟两对。",
    "看见有人上主来压你时，记住一句就够：单张毙单张，对子毙对子，刻子毙刻子，连组毙连组。",
    "末手没有特权；只有剩下的整手本身就是合法单型或合法甩牌时，才能一把打完。",
    "扣底分普通扣底和级牌扣底；只有大小王真的进了“本轮决定大小的最大同型牌组”，才会挡掉级牌扣底。",
    "打 J / Q / K / A 时要特别留意：这 4 个特殊级里，主级牌扣底和副级牌扣底都会算，不是只有主级牌才危险。",
    "2 级被级牌扣底，会进入负级链；局内统一简写成 Lv:-A, -K ... Lv:-2。",
    "主 A 扣回 Q，副 A 扣回 K。主 K 扣回 J，副 K 扣回 Q。主 Q 扣回 6，副 Q 扣回 J。主 J 扣回 2，副 J 扣回 9。",
    "5、10、J、Q、K、A 都是必打级，升多级也不能直接跳过，必须逐级打到。",
  ];

  const pcItems = extractRulesListItems(readHtml("index1.html"));
  const mobileItems = extractRulesListItems(readHtml("index2.html"));
  const appItems = extractRulesListItems(readHtml("index-app.html"));

  assert.deepEqual(pcItems, expectedItems, "PC 规则帮助文案应更新为新的边玩边看说明版");
  assert.deepEqual(mobileItems, expectedItems, "index2 规则帮助文案应与 PC 保持一致");
  assert.deepEqual(appItems, expectedItems, "App 规则帮助文案应与 PC 和 index2 保持一致");
}

main();
