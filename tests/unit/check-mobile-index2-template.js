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
  const actionRowMatch = html.match(/<div class="action-row">([\s\S]*?)<\/div>/);

  assert.match(
    html,
    /body\.mobile-index2 \{[\s\S]*--mobile-index2-play-card-width:\s*38px;[\s\S]*--mobile-index2-play-card-height:\s*55px;[\s\S]*--mobile-index2-hand-row-min-height:\s*52px;[\s\S]*--mobile-index2-hand-label-width:\s*18px;/,
    "index2 应收口手牌区、标签列和中央出牌区共用的布局尺寸变量",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.table \{[\s\S]*grid-template-rows:\s*[\s\S]*clamp\(288px,\s*calc\(31vh \+ 20px\),\s*302px\)[\s\S]*minmax\(41px,\s*max-content\);/,
    "index2 应把手牌托盘在上一版基础上再抬高 10px，并继续保持和 App 一致的底部布局口径",
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
    /body\.mobile-index2 \.hand-group \{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*var\(--mobile-index2-hand-label-width\)\s+minmax\(0,\s*1fr\);/,
    "index2 应把手牌分组改成固定标签列和牌轨列，确保主牌行与各花色行的起点稳定对齐",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.group-chip \{[\s\S]*width:\s*var\(--mobile-index2-hand-label-width\);[\s\S]*text-align:\s*left;/,
    "index2 应固定手牌标签列宽度，确保梅花、方块、黑桃、红桃都落在同一条左对齐基线",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.cards-row \.card-btn:first-child \{[\s\S]*margin-left:\s*0;/,
    "index2 应禁止首张手牌继续吃负外边距，确保主牌行和花色行的第一张牌起点真正对齐",
  );
  assert.match(
    html,
    /body\.mobile-index2 button\.action-btn \{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*height:\s*44px;[\s\S]*min-height:\s*44px;[\s\S]*padding:\s*0\s+10px;[\s\S]*font-size:\s*15px;/,
    "index2 的底部操作按钮应进一步放大到更适合拇指点击的体量，并继续保持文字垂直居中",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.center-panel \{[\s\S]*height:\s*auto\s*!important;[\s\S]*min-height:\s*auto\s*!important;[\s\S]*padding:\s*1px\s+6px\s+1px;/,
    "index2 的底部操作容器应收口为贴按钮的薄内边距，避免继续把按钮区整体顶高",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.center-panel:not\(\.setup-choice-mode\) \{[\s\S]*height:\s*74px\s*!important;[\s\S]*min-height:\s*74px\s*!important;[\s\S]*display:\s*flex\s*!important;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*padding-top:\s*10px;[\s\S]*padding-bottom:\s*10px;/,
    "index2 的普通底部按钮态应进一步放大高度，让出牌阶段的双大按钮真正吃到更舒展的触达面积",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.center-panel\.setup-choice-mode \{[\s\S]*min-height:\s*58px\s*!important;[\s\S]*padding-top:\s*5px;[\s\S]*padding-bottom:\s*4px;/,
    "index2 的抓牌声明态也应同步抬高，让底部“不亮主”和上方亮主候选能共存而不显得拥挤",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.center-panel\.dealing-pass-mode \{[\s\S]*display:\s*flex\s*!important;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*flex-start;[\s\S]*gap:\s*8px;/,
    "index2 的抓牌声明态应切成横向双栏，让底部“不亮主”和右侧亮主区域真正并排排开",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.action-row \{[\s\S]*display:\s*flex;[\s\S]*width:\s*100%;[\s\S]*gap:\s*6px;[\s\S]*align-items:\s*center;/,
    "index2 的底部按钮行应显式占满整行，并把按钮间距再拉开一点，避免大按钮重新挤成一团",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.center-panel \[hidden\] \{[\s\S]*display:\s*none\s*!important;/,
    "index2 的底部操作区在改成 flex 后仍应显式保住 hidden 的 display:none 语义",
  );
  assert.match(
    html,
    /body\.mobile-index2 button\.action-btn \{[\s\S]*flex:\s*1 1 0;[\s\S]*min-width:\s*0;/,
    "index2 的底部操作按钮应提供统一的弹性宽度基线，避免窄屏下文字把按钮撑坏",
  );
  assert.match(
    html,
    /body\.mobile-index2 #hintBtn\.action-btn,[\s\S]*body\.mobile-index2 #playBtn\.action-btn \{[\s\S]*flex:\s*1\.22 1 0;[\s\S]*max-width:\s*none;/,
    "index2 的选择和出牌按钮应继续占据更高的横向权重，保证抓牌态与出牌态都保持拇指优先的主操作层级",
  );
  assert.match(
    html,
    /body\.mobile-index2 #passDeclareBtn\.action-btn \{[\s\S]*flex:\s*1 1 auto;[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;[\s\S]*font-size:\s*14px;/,
    "index2 的“不亮主”按钮应填满自己的窄列宽度，而不应继续直接占满整条底部操作轨",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.center-panel\.dealing-pass-mode \.action-row \{[\s\S]*flex:\s*0 0 20%;[\s\S]*width:\s*20%;[\s\S]*min-width:\s*92px;[\s\S]*max-width:\s*108px;[\s\S]*gap:\s*0;/,
    "index2 的抓牌声明态里，“不亮主”所在列应固定为约 20% 宽度，避免把右侧亮主区域挤断",
  );
  assert.match(
    html,
    /body\.mobile-index2 \.center-panel\.dealing-pass-mode \.setup-options \{[\s\S]*flex:\s*1 1 0;[\s\S]*min-width:\s*0;[\s\S]*margin-top:\s*0;[\s\S]*padding-right:\s*10px;[\s\S]*scroll-padding-right:\s*10px;[\s\S]*justify-content:\s*flex-start;/,
    "index2 的抓牌声明态里，右侧亮主候选区应吃满剩余空间并预留右侧滚动安全边，避免最后一项被切断",
  );
  assert.notEqual(actionRowMatch, null, "index2 页面应保留底部可见操作区容器");
  assert.match(html, /<section id="centerPanel" class="panel center-panel"/, "index2 应给中央操作区补上 centerPanel id，确保共享层能真正切换抓牌声明态类名");
  assert.match(actionRowMatch[1], /id="hintBtn"[\s\S]*id="playBtn"[\s\S]*id="passDeclareBtn"/, "index2 可见操作区应保留选择、出牌和抓牌阶段的“不亮主”按钮");
  assert.equal(actionRowMatch[1].includes('id="declareBtn"'), false, "index2 可见操作区不应再保留旧亮主按钮 DOM");
  assert.equal(actionRowMatch[1].includes('id="passCounterBtn"'), false, "index2 可见操作区不应再保留旧不反主按钮 DOM");
  assert.equal(actionRowMatch[1].includes('id="beatBtn"'), false, "index2 可见操作区不应再放入毙牌按钮");
  assert.equal(actionRowMatch[1].includes('id="newProgressBtn"'), false, "index2 可见操作区不应再放入新的游戏按钮");
  assert.equal(actionRowMatch[1].includes('id="continueGameBtn"'), false, "index2 可见操作区不应再放入继续游戏按钮");
  assert.equal(actionRowMatch[1].includes('id="startGameBtn"'), false, "index2 可见操作区不应再放入开始发牌按钮");
  assert.match(
    html,
    /mobileDom\.startBtn\.addEventListener\("click", \(\) => \{[\s\S]*startNewProgress\(true\);[\s\S]*\}\);/,
    "index2 开始页按钮应直接调用共享开局 helper，不再代理隐藏原始开始按钮",
  );
  assert.match(
    html,
    /mobileDom\.setupContinueBtn\?\.addEventListener\("click", \(\) => \{[\s\S]*continueSavedProgress\(true\);[\s\S]*\}\);/,
    "index2 继续游戏按钮应直接调用共享继续 helper，不再代理隐藏原始继续按钮",
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
