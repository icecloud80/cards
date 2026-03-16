const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 校验手游结果弹窗是否保留紧凑版结构与关键样式约束。
 *
 * 为什么这样写：
 * 这轮需求明确要把手游结算页缩小、压紧并减少空白；
 * 直接锁住 `index2.html` 里的结构和关键 CSS，可以防止后续样式回退后再次把弹窗撑高。
 *
 * 输入：
 * @param {void} - 通过固定路径读取手游页面模板源码。
 *
 * 输出：
 * @returns {void} 所有断言通过后正常退出。
 *
 * 注意：
 * - 这里只检查结构与关键样式锚点，不做像素级截图比对。
 * - 断言要聚焦“高度受控、按钮双列、底牌区缩小”这三类核心紧凑目标。
 */
function main() {
  const file = path.join(__dirname, "../../index2.html");
  const html = fs.readFileSync(file, "utf8");

  assert.match(
    html,
    /body\.mobile-index2 \.result-card \{[\s\S]*max-height:\s*calc\(100vh - max\(20px, env\(safe-area-inset-top\)\) - max\(20px, env\(safe-area-inset-bottom\)\)\);[\s\S]*overflow-y:\s*auto;/,
    "手游结果弹窗应限制最大高度并允许纵向滚动，避免整张卡片把屏幕撑满"
  );
  assert.match(
    html,
    /body\.mobile-index2 \.result-action-row \{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    "手游结果弹窗底部操作区应改成双列按钮栅格，减少横向留白"
  );
  assert.match(
    html,
    /body\.mobile-index2 \.result-bottom \.bottom-cards \.played-card \{[\s\S]*width:\s*var\(--mobile-result-bottom-card-width\);[\s\S]*margin-left:\s*-9px;/,
    "手游结果弹窗里的底牌亮出区应缩小单张牌宽度并保持更紧的叠放间距"
  );
  assert.match(
    html,
    /<div class="action-row result-action-row">[\s\S]*id="copyResultLogBtn"[\s\S]*id="downloadResultLogBtn"[\s\S]*<\/div>[\s\S]*<div class="action-row result-action-row">[\s\S]*id="restartBtn"[\s\S]*id="closeResultBtn"/,
    "手游结果弹窗应保留两行双按钮结构，分别承载日志操作和主操作"
  );
}

main();
