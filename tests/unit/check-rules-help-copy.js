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
    "新牌局先等玩家点击“开始发牌”；首局由玩家1先抓，之后由上一局最后扣底或守底成功的玩家先抓牌。",
    "每位玩家都按自己的 Lv 亮主或反主，不能自己反自己；若发牌结束仍无人亮主，则由先抓牌玩家翻底定主并直接做打家。",
    "翻底定主公示时，只展示实际已经翻开的底牌。",
    "打家拿起底牌后要重新扣回 7 张；这 7 张底牌的分牌总和不能超过 25 分。",
    "打家扣底后先叫朋友；可叫第一张、第二张或第三张目标牌，若误出前置张数，本局可能变成 1 打 4。",
    "首家只能出同一门的合法牌型；同一门里的多个合法组件一起打，按甩牌处理。",
    "跟牌先跟同门；同门数量不够就全出；缺首门后可以贴副或用主毙，贴副时不用继续硬贴对子或连组。",
    "毙牌只看更大的同类主牌型：单张毙单张，对子毙对子，刻子毙刻子，连组毙连组。",
    "末手没有特权；只有剩下的整手本身就是合法单型或合法甩牌时，才能一次性整手打出。",
    "扣底分普通扣底和级牌扣底；只有大小王进入“本轮决定大小的最大同型牌组”时，才会挡掉级牌扣底。",
    "A 级之后若继续被级牌扣底，会进入完整负级链：-K -> -Q -> -J -> -10 -> ... -> -2。",
    "负级必须按 -2 -> -3 -> ... -> -K -> -A -> 2 一档一档打回，不能跳级。",
    "主 K 扣回 J，副 A 扣回 K；若打家当前是 J、Q、K、A 且朋友已站队，被级牌扣底时朋友还会连带再降 1 级。",
    "5、10、J、Q、K、A 都是必打级，升多级时也不能直接跳过，必须逐级打到。",
  ];

  const pcItems = extractRulesListItems(readHtml("index1.html"));
  const mobileItems = extractRulesListItems(readHtml("index2.html"));
  const appItems = extractRulesListItems(readHtml("index-app.html"));

  assert.deepEqual(pcItems, expectedItems, "PC 规则帮助文案应更新为新的局内快读版");
  assert.deepEqual(mobileItems, expectedItems, "index2 规则帮助文案应与 PC 保持一致");
  assert.deepEqual(appItems, expectedItems, "App 规则帮助文案应与 PC 和 index2 保持一致");
}

main();
