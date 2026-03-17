const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 校验 PC 开始界面的主视觉已经切到手游同款插画结构。
 *
 * 为什么这样写：
 * 这次需求只改开始页视觉，不牵涉共享状态机；
 * 直接读取 `index1.html` 源码做静态断言，最能稳定锁住“PC 必须复用手游开始页主视觉”这条 UI 约束。
 *
 * 输入：
 * @param {void} - 通过固定路径读取 PC 页面模板源码。
 *
 * 输出：
 * @returns {void} 关键结构存在时正常退出。
 *
 * 注意：
 * - 这里只校验结构与资源引用，不做像素级截图比对。
 * - 旧的 `poker.png` 主视觉图不能再作为 PC 开始页 hero 出现，避免回退。
 */
function main() {
  const file = path.join(__dirname, "../../index1.html");
  const html = fs.readFileSync(file, "utf8");

  assert.equal(
    html.includes('class="mobile-setup-visual pc-start-lobby-visual"'),
    true,
    "PC 开始界面应复用手游开始页的组合插画容器"
  );
  assert.equal(html.includes('class="mobile-visual-badge">WELCOME<'), true, "PC 开始界面应保留手游主视觉角标");
  assert.equal(html.includes('class="mobile-card-fan-face"'), true, "PC 开始界面应保留手游主视觉的扑克牌扇形");
  assert.equal(html.includes('class="mobile-tractor"'), true, "PC 开始界面应保留手游主视觉的拖拉机结构");
  assert.equal(html.includes('class="mobile-train"'), true, "PC 开始界面应保留手游主视觉的火车结构");
  assert.equal(
    html.includes('<img src="./poker.png" alt="游戏主视觉" />'),
    false,
    "PC 开始界面不应再回退到旧的 poker.png 静态主视觉图"
  );
}

main();
