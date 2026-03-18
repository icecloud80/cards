const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 校验 `index2.html` 已同步 App 壳的关键移动布局修复，并锁住手牌标签左对齐。
 *
 * 为什么这样写：
 * 这轮不只是修一个花色文字偏移，而是要把 index2 也一起补到“底部操作条压薄、手牌与中央出牌区同尺寸、
 * 无主场景下主牌和四门副牌各占一行”的同一套口径；直接锁住模板里的关键 CSS 和脚本锚点，可以避免后续又只修 App、不修 index2。
 *
 * 输入：
 * @param {void} - 直接读取仓库里的 `index2.html` 模板源码。
 *
 * 输出：
 * @returns {void} 所有断言通过后正常结束。
 *
 * 注意：
 * - 这里只检查结构、样式锚点和关键脚本，不做像素级截图比对。
 * - 断言聚焦“左对齐、同尺寸、薄操作条、5 行手牌”四类目标。
 */
function main() {
  const html = fs.readFileSync(path.join(__dirname, "../../index2.html"), "utf8");

  assert.match(
    html,
    /body\.mobile-index2 \{[\s\S]*--mobile-index2-play-card-width:\s*38px;[\s\S]*--mobile-index2-play-card-height:\s*55px;[\s\S]*--mobile-index2-hand-row-min-height:\s*52px;[\s\S]*--mobile-index2-hand-label-width:\s*18px;/,
    "index2 应收口手牌区、标签列和中央出牌区共用的布局尺寸变量",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.table \{[\s\S]*grid-template-rows:\s*[\s\S]*clamp\(268px,\s*31vh,\s*282px\)[\s\S]*minmax\(36px,\s*max-content\);/,
    "index2 应把手牌托盘抬高到可容纳五行分组，并把底部操作区改成按内容长的薄轨",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.trick-spot \.played-card \{[\s\S]*width:\s*var\(--mobile-index2-play-card-width\);[\s\S]*height:\s*var\(--mobile-index2-play-card-height\);/,
    "index2 的中央出牌区应继续使用统一的 38x55 牌面变量",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.card-btn,[\s\S]*body\.mobile-index2 \.friend-card \{[\s\S]*width:\s*var\(--mobile-index2-play-card-width\);[\s\S]*height:\s*var\(--mobile-index2-play-card-height\);/,
    "index2 的手牌区应把牌面放大到与中央出牌区相同的尺寸",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.mobile-hand-row \{[\s\S]*min-height:\s*var\(--mobile-index2-hand-row-min-height\);/,
    "index2 在放大手牌后应同步抬高手牌行最小高度，避免五行分组继续把牌压小",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.group-chip \{[\s\S]*width:\s*var\(--mobile-index2-hand-label-width\);[\s\S]*text-align:\s*left;/,
    "index2 应固定手牌标签列宽度，确保梅花、方块、黑桃、红桃都落在同一条左对齐基线",
  );
  assert.match(
    html,
    /body\.mobile-index2 button\.action-btn \{[\s\S]*height:\s*30px;[\s\S]*min-height:\s*30px;/,
    "index2 应把底部操作按钮压短，避免继续顶住手牌区",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.center-panel \{[\s\S]*height:\s*auto\s*!important;[\s\S]*min-height:\s*auto\s*!important;[\s\S]*padding:\s*1px\s+6px\s+1px;/,
    "index2 的底部操作容器应收口为贴按钮的薄内边距，避免继续把按钮区整体顶高",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.center-panel:not\(\.setup-choice-mode\) \{[\s\S]*height:\s*36px\s*!important;[\s\S]*min-height:\s*36px\s*!important;/,
    "index2 的普通底部按钮态应固定收口到贴近按钮的 36px 高度",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.action-row \{[\s\S]*display:\s*grid;[\s\S]*grid-auto-flow:\s*column;[\s\S]*grid-auto-columns:\s*minmax\(0,\s*1fr\);[\s\S]*grid-template-columns:\s*none;/,
    "index2 的底部按钮行应按可见按钮数量自动均分，不能继续继承旧的固定三列空轨",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.friend-picker \.action-row \{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    "index2 叫朋友弹层的操作行仍应保留两列 grid，不应被底部主操作条的新规则误伤",
  );
  assert.match(
    html,
    /function getIndex2HandOverlap\(cardCount\) \{[\s\S]*return Math\.min\(18,\s*8 \+ Math\.max\(0,\s*normalizedCount - 6\)\);[\s\S]*\}/,
    "index2 在放大手牌后应提供独立的手牌重叠估算逻辑，避免长手牌横向撑爆",
  );
  assert.match(
    html,
    /cardsRow\.style\.setProperty\("--mobile-index2-card-overlap", getIndex2HandOverlap\(entry\.count\)\.toFixed\(1\)\);/,
    "index2 应把放大后的手牌重叠量写到 index2 专用 CSS 变量，不影响别的平台口径",
  );
  assert.match(
    html,
    /const rowCount = 5;/,
    "index2 在无主场景下应给主牌和四门副牌各预留一行，不能再把红桃等分组横向挤到右侧",
  );
  assert.match(
    html,
    /if \(row\.childElementCount === 0\) continue;/,
    "index2 在扩成五行后应跳过空行，避免四组手牌时被额外空轨拉散",
  );
  assert.doesNotMatch(
    html,
    /body\.mobile-index2 \.center-panel \{[\s\S]*env\(safe-area-inset-bottom\)/,
    "index2 的底部操作容器不应再次叠加底部安全区留白，否则会继续遮住手牌区",
  );
}

main();
