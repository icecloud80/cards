const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 校验 App 专用 mobile 页面已经切成“顶部固定 / 中部自适应 / 底部固定”的布局骨架。
 *
 * 为什么这样写：
 * 这次问题不是单纯调几个间距，而是要把原生壳默认入口从通用 `index2.html` 拆成独立 App 页，
 * 并明确锁住中间出牌区自适应、顶部状态栏收紧以及底部手牌/操作固定高度这三条约束，避免后续又回到顶部过高、牌桌被压缩的版本。
 *
 * 输入：
 * @param {void} - 直接读取仓库里的 `index-app.html` 模板源码。
 *
 * 输出：
 * @returns {void} 所有断言通过后正常结束。
 *
 * 注意：
 * - 这里只锁住模板结构和关键 CSS，不做像素级截图比对。
 * - `index2.html` 仍保留给网页预览；这里关心的是 App 专用入口是否真正独立存在。
 */
function main() {
  const html = fs.readFileSync(path.join(__dirname, "../../index-app.html"), "utf8");
  const actionRowMatch = html.match(/<div class="action-row">([\s\S]*?)<\/div>/);

  assert.equal(html.includes("<title>找朋友升级 · App版</title>"), true, "App 专用页面标题应统一改为找朋友升级");
  assert.equal(html.includes('class="mobile-kicker">找朋友升级<'), true, "App 开始页品牌标题应统一改为找朋友升级");
  assert.equal(html.includes('class="game-title">找朋友升级<'), true, "App 局内标题应统一改为找朋友升级");
  assert.equal(html.includes("五人找朋友升级"), false, "App 专用页面不应继续保留旧品牌名五人找朋友升级");
  assert.match(
    html,
    /document\.body\.classList\.add\("mobile-app-shell"\);/,
    "App 专用页面应使用独立的 mobile-app-shell body 类，而不是继续复用 mobile-index2",
  );
  assert.match(
    html,
    /<section id="mobilePlayArea" class="mobile-play-area">[\s\S]*?<section id="trickSpot-4"[\s\S]*?<section id="trickSpot-1"/,
    "App 专用页面应把五个出牌位收进独立的 mobilePlayArea 容器",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.table \{[\s\S]*padding:\s*6px\s+6px\s+1px;[\s\S]*grid-template-rows:\s*[\s\S]*clamp\(56px,\s*8\.8svh,\s*64px\)[\s\S]*minmax\(0,\s*1fr\)[\s\S]*clamp\(298px,\s*calc\(31vh \+ 30px\),\s*312px\)[\s\S]*minmax\(41px,\s*max-content\);/,
    "App 专用页面应把手牌区在上一版基础上再抬高 10px，并把牌桌底部 padding 再减少 5px 给底部区域腾空间",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.mobile-play-area \{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1\.12fr\);/,
    "App 专用页面的出牌区应在独立容器内自适应分配五个席位卡位",
  );
  assert.match(
    html,
    /function applyViewportMetrics\(\) \{[\s\S]*const bottomClearance = 6;/,
    "App 专用页面应去掉浏览器底栏式的大留白算法，改为原生 WebView 的小底部预留",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.hand-group \{[\s\S]*gap:\s*8px;/,
    "App 专用页面应把左侧花色标签和第一张手牌之间的间距再拉开一点",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \{[\s\S]*--mobile-app-play-card-width:\s*38px;[\s\S]*--mobile-app-play-card-height:\s*55px;[\s\S]*--mobile-app-hand-row-min-height:\s*52px;[\s\S]*--mobile-app-hand-label-width:\s*18px;/,
    "App 专用页面应为手牌区、标签列和中央出牌区收口同一套布局变量",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.trick-spot \.played-card \{[\s\S]*width:\s*var\(--mobile-app-play-card-width\);[\s\S]*height:\s*var\(--mobile-app-play-card-height\);/,
    "App 专用页面的中央出牌区应继续使用统一的 38x55 牌面变量",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.card-btn,[\s\S]*body\.mobile-app-shell \.friend-card \{[\s\S]*width:\s*var\(--mobile-app-play-card-width\);[\s\S]*height:\s*var\(--mobile-app-play-card-height\);/,
    "App 专用页面的手牌区应把牌面放大到与中央出牌区相同的尺寸",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.mobile-hand-row \{[\s\S]*min-height:\s*var\(--mobile-app-hand-row-min-height\);/,
    "App 专用页面在放大手牌后应同步抬高手牌行最小高度，避免五行分组继续把牌压小",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.group-chip \{[\s\S]*width:\s*var\(--mobile-app-hand-label-width\);[\s\S]*text-align:\s*left;/,
    "App 专用页面应固定手牌标签列宽度，确保无主时各门花色仍保持同一条左对齐基线",
  );
  assert.match(
    html,
    /body\.mobile-app-shell button\.action-btn \{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*height:\s*44px;[\s\S]*min-height:\s*44px;[\s\S]*padding:\s*0\s+10px;[\s\S]*font-size:\s*15px;/,
    "App 专用页面应把底部操作按钮整体放大到更适合拇指点击的体量，并继续保持文字垂直居中",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.center-panel \{[\s\S]*height:\s*auto\s*!important;[\s\S]*min-height:\s*auto\s*!important;[\s\S]*padding:\s*1px\s+6px\s+1px;/,
    "App 专用页面的底部操作容器应收口为贴按钮的薄内边距，避免继续把按钮区整体顶高",
  );
  assert.doesNotMatch(
    html,
    /body\.mobile-app-shell \.center-panel \{[\s\S]*min-height:\s*100%/,
    "App 专用页面的底部操作容器不应继续把自己撑满整行，否则按钮下方会残留被放大的空白带",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.center-panel:not\(\.setup-choice-mode\) \{[\s\S]*height:\s*74px\s*!important;[\s\S]*min-height:\s*74px\s*!important;[\s\S]*display:\s*flex\s*!important;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*padding-top:\s*10px;[\s\S]*padding-bottom:\s*10px;/,
    "App 专用页面的普通底部按钮态应和 index2 一起进一步放大，让双主按钮更接近真实拇指按钮尺寸",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.center-panel\.setup-choice-mode \{[\s\S]*min-height:\s*58px\s*!important;[\s\S]*padding-top:\s*5px;[\s\S]*padding-bottom:\s*4px;/,
    "App 专用页面的抓牌声明态也应和 index2 一起抬高，让底部“不亮主”和上方亮主候选能共存而不显得拥挤",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.center-panel\.dealing-pass-mode \{[\s\S]*display:\s*flex\s*!important;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*flex-start;[\s\S]*gap:\s*8px;/,
    "App 专用页面的抓牌声明态应切成横向双栏，让底部“不亮主”和右侧亮主区域真正并排排开",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.action-row \{[\s\S]*display:\s*flex;[\s\S]*width:\s*100%;[\s\S]*gap:\s*6px;[\s\S]*align-items:\s*center;/,
    "App 专用页面的底部按钮行应显式占满整行，并把按钮间距再拉开一点，避免大按钮重新挤成一团",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.center-panel \[hidden\] \{[\s\S]*display:\s*none\s*!important;/,
    "App 专用页面的底部操作区在改成 flex 后仍应显式保住 hidden 的 display:none 语义",
  );
  assert.match(
    html,
    /body\.mobile-app-shell button\.action-btn \{[\s\S]*flex:\s*1 1 0;[\s\S]*min-width:\s*0;/,
    "App 专用页面的底部操作按钮应提供统一的弹性宽度基线，避免窄屏下文字把按钮撑坏",
  );
  assert.match(
    html,
    /body\.mobile-app-shell #hintBtn\.action-btn,[\s\S]*body\.mobile-app-shell #playBtn\.action-btn \{[\s\S]*flex:\s*1\.22 1 0;[\s\S]*max-width:\s*none;/,
    "App 专用页面的选择和出牌按钮应继续占据更高的横向权重，保证抓牌态与出牌态都保持拇指优先的主操作层级",
  );
  assert.match(
    html,
    /body\.mobile-app-shell #passDeclareBtn\.action-btn \{[\s\S]*flex:\s*1 1 auto;[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;[\s\S]*font-size:\s*14px;/,
    "App 专用页面的“不亮主”按钮应填满自己的窄列宽度，而不应继续直接占满整条底部操作轨",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.center-panel\.dealing-pass-mode \.action-row \{[\s\S]*flex:\s*0 0 20%;[\s\S]*width:\s*20%;[\s\S]*min-width:\s*92px;[\s\S]*max-width:\s*108px;[\s\S]*gap:\s*0;/,
    "App 专用页面的抓牌声明态里，“不亮主”所在列应固定为约 20% 宽度，避免把右侧亮主区域挤断",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.center-panel\.dealing-pass-mode \.setup-options \{[\s\S]*flex:\s*1 1 0;[\s\S]*min-width:\s*0;[\s\S]*margin-top:\s*0;[\s\S]*padding-right:\s*10px;[\s\S]*scroll-padding-right:\s*10px;[\s\S]*justify-content:\s*flex-start;/,
    "App 专用页面的抓牌声明态里，右侧亮主候选区应吃满剩余空间并预留右侧滚动安全边，避免最后一项被切断",
  );
  assert.notEqual(actionRowMatch, null, "App 页面应保留底部可见操作区容器");
  assert.match(html, /<section id="centerPanel" class="panel center-panel"/, "App 页面应给中央操作区补上 centerPanel id，确保共享层能真正切换抓牌声明态类名");
  assert.match(actionRowMatch[1], /id="hintBtn"[\s\S]*id="playBtn"[\s\S]*id="passDeclareBtn"/, "App 可见操作区应保留选择、出牌和抓牌阶段的“不亮主”按钮");
  assert.equal(actionRowMatch[1].includes('id="declareBtn"'), false, "App 可见操作区不应再保留旧亮主按钮 DOM");
  assert.equal(actionRowMatch[1].includes('id="passCounterBtn"'), false, "App 可见操作区不应再保留旧不反主按钮 DOM");
  assert.equal(actionRowMatch[1].includes('id="beatBtn"'), false, "App 可见操作区不应再放入毙牌按钮");
  assert.equal(actionRowMatch[1].includes('id="newProgressBtn"'), false, "App 可见操作区不应再放入新的游戏按钮");
  assert.equal(actionRowMatch[1].includes('id="continueGameBtn"'), false, "App 可见操作区不应再放入继续游戏按钮");
  assert.equal(actionRowMatch[1].includes('id="startGameBtn"'), false, "App 可见操作区不应再放入开始发牌按钮");
  assert.match(
    html,
    /mobileDom\.startBtn\.addEventListener\("click", \(\) => \{[\s\S]*startNewProgress\(true\);[\s\S]*\}\);/,
    "App 开始页按钮应直接调用共享开局 helper，不再代理隐藏原始开始按钮",
  );
  assert.match(
    html,
    /mobileDom\.setupContinueBtn\?\.addEventListener\("click", \(\) => \{[\s\S]*continueSavedProgress\(true\);[\s\S]*\}\);/,
    "App 继续游戏按钮应直接调用共享继续 helper，不再代理隐藏原始继续按钮",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.friend-picker \.action-row \{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    "App 叫朋友弹层的操作行仍应保留两列 grid，不应被底部主操作条的新规则误伤",
  );
  assert.match(
    html,
    /function getAppHandOverlap\(cardCount\) \{[\s\S]*return Math\.min\(18,\s*8 \+ Math\.max\(0,\s*normalizedCount - 6\)\);[\s\S]*\}/,
    "App 专用页面在放大手牌后应提供独立的手牌重叠估算逻辑，避免长手牌横向撑爆",
  );
  assert.match(
    html,
    /cardsRow\.style\.setProperty\("--mobile-app-card-overlap", getAppHandOverlap\(entry\.count\)\.toFixed\(1\)\);/,
    "App 专用页面应把放大后的手牌重叠量写到 App 专用 CSS 变量，不影响通用 mobile 口径",
  );
  assert.match(
    html,
    /const rowCount = 5;/,
    "App 专用页面在无主场景下应给主牌和四门副牌各预留一行，不能再把某一门副牌挤到同一行",
  );
  assert.match(
    html,
    /if \(row\.childElementCount === 0\) continue;/,
    "App 专用页面在扩成五行后应跳过空行，避免四组手牌时被额外空轨拉散",
  );
  assert.doesNotMatch(
    html,
    /body\.mobile-app-shell \.center-panel \{[\s\S]*env\(safe-area-inset-bottom\)/,
    "App 专用页面的底部操作容器不应再次叠加底部安全区留白，否则会继续遮住手牌区",
  );
}

main();
