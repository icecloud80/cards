const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

/**
 * 作用：
 * 校验三端主战场界面图资产和说明文档已经落到仓库中。
 *
 * 为什么这样写：
 * 这次用户直接要求“制作界面图”；
 * 仅在对话里描述不够稳定，所以需要一条轻量回归锁住 SVG 设计稿、说明文档和 README 入口，
 * 避免后续整理文件时把这批资产误删或从文档索引里移除。
 *
 * 输入：
 * @param {void} - 通过固定路径读取仓库里的文档和 SVG 文件。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里检查的是“设计稿资产存在且被文档引用”，不是像素级设计质量。
 * - 说明文档必须明确写出“本轮不改规则、玩法逻辑、AI 策略或 heuristic”，避免设计稿被误解成玩法改动。
 */
function main() {
  const repoRoot = path.join(__dirname, "../..");
  const docFile = path.join(repoRoot, "docs/three-surface-ui-mock.md");
  const readmeFile = path.join(repoRoot, "README.md");
  const updatesFile = path.join(repoRoot, "docs/recent-updates.md");
  const pcSvgFile = path.join(repoRoot, "images/mockups/ui-mock-pc.svg");
  const h5SvgFile = path.join(repoRoot, "images/mockups/ui-mock-h5.svg");
  const appSvgFile = path.join(repoRoot, "images/mockups/ui-mock-app.svg");

  const doc = fs.readFileSync(docFile, "utf8");
  const readme = fs.readFileSync(readmeFile, "utf8");
  const updates = fs.readFileSync(updatesFile, "utf8");
  const pcSvg = fs.readFileSync(pcSvgFile, "utf8");
  const h5Svg = fs.readFileSync(h5SvgFile, "utf8");
  const appSvg = fs.readFileSync(appSvgFile, "utf8");

  assert.equal(doc.includes("三端主战场界面图说明"), true, "应新增三端界面图说明文档");
  assert.equal(doc.includes("这次界面图不改规则"), true, "说明文档应明确本轮不改规则");
  assert.equal(doc.includes("这次界面图不改玩法逻辑"), true, "说明文档应明确本轮不改玩法逻辑");
  assert.equal(doc.includes("这次界面图不改 AI 策略"), true, "说明文档应明确本轮不改 AI 策略");
  assert.equal(doc.includes("这次界面图不改 AI heuristic"), true, "说明文档应明确本轮不改 AI heuristic");
  assert.equal(readme.includes("Three-surface UI mock / 三端主战场界面图"), true, "README 应补入三端界面图入口");
  assert.equal(updates.includes("【设计稿】 - 新增 `PC / H5 / App` 三端主战场中保真界面图"), true, "最近更新应记录三端界面图资产");
  assert.equal(pcSvg.includes("PC 主战场界面图"), true, "PC SVG 设计稿应存在且包含标题");
  assert.equal(h5Svg.includes("H5 界面图"), true, "H5 SVG 设计稿应存在且包含标题");
  assert.equal(appSvg.includes("App 界面图"), true, "App SVG 设计稿应存在且包含标题");
}

main();
