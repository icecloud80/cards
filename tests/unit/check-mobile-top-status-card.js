const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 执行手游顶部 `主 / 朋` 状态牌回归断言。
 *
 * 为什么这样写：
 * 这块卡位尺寸比底部手牌更小，如果继续走旧的单张 `img` 或继承手牌区的 90% sprite 缩放，
 * 就会出现顶部两张牌宽度、留白和主题不一致的问题；
 * 这里把“统一复用 buildCardNode + 小卡位使用 100% sprite”锁住，后续再调牌面时就不容易回退。
 *
 * 输入：
 * @param {void} - 无额外输入，直接读取手游 HTML 模板。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里只检查模板代码结构，不做浏览器像素比对。
 * - `buildTopStatusCardHtml` 必须优先走 `buildCardNode`，拿不到 suit/rank 时才允许回退到 `img`。
 */
function main() {
  const html = fs.readFileSync(path.join(__dirname, "../../index2.html"), "utf8");

  assert.match(
    html,
    /body\.mobile-index2 \.mobile-state-card \.card-face-sprite\s*\{[\s\S]*width:\s*100%\s*!important;[\s\S]*height:\s*100%\s*!important;[\s\S]*margin:\s*0\s*!important;/,
    "手游顶部状态牌的小卡位应把 sprite 直接铺满，不再继承手牌区的缩小留白"
  );

  assert.match(
    html,
    /function buildTopStatusCardHtml\(card, altText\)\s*\{[\s\S]*if \(card\.suit && card\.rank && typeof buildCardNode === "function"\) \{[\s\S]*buildCardNode\(card, "friend-card"\)\.outerHTML;/,
    "buildTopStatusCardHtml 应优先复用 buildCardNode，保持顶部状态牌和当前牌面主题一致"
  );

  assert.match(
    html,
    /buildTopStatusCardHtml\(\s*\{\s*suit:\s*suitKey,\s*rank:\s*rankMatch\[1\],\s*img:\s*getCardImage\(suitKey, rankMatch\[1\]\)\s*\}/,
    "手游顶部主牌状态在花色主场景下应补齐 suit/rank，避免退回成单张 img 渲染"
  );
}

main();
