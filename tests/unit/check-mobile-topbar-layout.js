const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 校验手游顶栏里“主 / 朋”状态块的横向偏移是否保持在安全范围内。
 *
 * 为什么这样写：
 * 顶栏新增“重置本局”图标后，右侧按钮组变宽；
 * 如果继续沿用旧的左移量，`主 / 朋` 会和“难度”统计发生重叠，需要用一条轻量回归把这个布局约束锁住。
 *
 * 输入：
 * @param {void} - 通过固定路径读取手游页面模板源码。
 *
 * 输出：
 * @returns {void} 所有断言通过后正常退出。
 *
 * 注意：
 * - 这里只检查关键 CSS 锚点，不做像素级截图比对。
 * - 断言重点是“不再维持旧的重左移”，避免后续回退到重叠版本。
 */
function main() {
  const file = path.join(__dirname, "../../index2.html");
  const html = fs.readFileSync(file, "utf8");

  assert.match(
    html,
    /<div class="mobile-topbar-main">[\s\S]*?<span>计秒<\/span>[\s\S]*?<strong id="mobileTimer">--<\/strong>[\s\S]*?<span>总分<\/span>[\s\S]*?<strong id="mobileScore">0<\/strong>/,
    "手游顶栏左侧统计应改成先显示计秒，再显示总分"
  );
  assert.match(
    html,
    /body\.mobile-index2 \.mobile-topbar-sub \{[\s\S]*transform:\s*translateX\(-8px\);/,
    "手游顶栏里的主/朋状态块应向右收回，避免继续压住难度统计"
  );
  assert.doesNotMatch(
    html,
    /body\.mobile-index2 \.mobile-topbar-sub \{[\s\S]*transform:\s*translateX\(-36px\);/,
    "手游顶栏里的主/朋状态块不应继续保留旧的重左移量"
  );
}

main();
