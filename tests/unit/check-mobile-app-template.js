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
    /body\.mobile-app-shell \.table \{[\s\S]*grid-template-rows:\s*[\s\S]*clamp\(56px,\s*8\.8svh,\s*64px\)[\s\S]*minmax\(0,\s*1fr\)[\s\S]*clamp\(198px,\s*30\.5vh,\s*232px\)[\s\S]*clamp\(34px,\s*4\.8svh,\s*40px\);/,
    "App 专用页面应把桌面行高改成顶部固定、中部自适应、底部手牌固定、操作区固定",
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
    /body\.mobile-app-shell button\.action-btn \{[\s\S]*height:\s*30px;[\s\S]*min-height:\s*30px;/,
    "App 专用页面应把底部操作按钮压短，避免继续顶住手牌区",
  );
  assert.match(
    html,
    /body\.mobile-app-shell \.center-panel \{[\s\S]*padding:\s*2px\s+6px\s+2px;/,
    "App 专用页面的底部操作容器应只保留薄内边距，避免继续把按钮区整体顶高",
  );
  assert.doesNotMatch(
    html,
    /body\.mobile-app-shell \.center-panel \{[\s\S]*env\(safe-area-inset-bottom\)/,
    "App 专用页面的底部操作容器不应再次叠加底部安全区留白，否则会继续遮住手牌区",
  );
}

main();
