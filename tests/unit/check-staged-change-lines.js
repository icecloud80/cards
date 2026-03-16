const assert = require("node:assert/strict");

const {
  parseNumstatOutput,
  matchesScope,
  sumChangedLines,
  parseCliScope,
} = require("../../scripts/staged-change-lines");

/**
 * 作用：
 * 执行 pre-commit 改动行数统计的回归断言。
 *
 * 为什么这样写：
 * 这次新增了“JS 大改动”和“应用层大改动”两套门槛；
 * 用一条小测试把 numstat 解析、scope 过滤和 CLI 参数口径锁住，后续改 hook 时更安全。
 *
 * 输入：
 * @param {void} - 测试数据在函数内部固定构造。
 *
 * 输出：
 * @returns {{results: string[]}} 供脚本末尾统一输出的测试结果摘要。
 *
 * 注意：
 * - 二进制项必须被忽略，不能误加到统计值里。
 * - `app` 口径只应覆盖 `.js / .html / .css`。
 */
function runStagedChangeLinesChecks() {
  const numstat = [
    "12\t3\tsrc/shared/main.js",
    "5\t1\tindex1.html",
    "8\t0\tREADME.md",
    "-\t-\tpoker.png",
    "4\t2\tstyles/site.css",
  ].join("\n");
  const entries = parseNumstatOutput(numstat);
  const results = [];

  assert.equal(entries.length, 4, "binary numstat entries should be skipped");
  assert.equal(entries[0].filePath, "src/shared/main.js", "first entry path should be preserved");
  assert.equal(entries[1].added, 5, "html entry added lines should be parsed");
  results.push("numstat parsing skips binary entries");

  assert.equal(matchesScope(entries[0], "js"), true, "js scope should include .js files");
  assert.equal(matchesScope(entries[1], "js"), false, "js scope should exclude .html files");
  assert.equal(matchesScope(entries[1], "app"), true, "app scope should include .html files");
  assert.equal(matchesScope(entries[2], "app"), false, "app scope should exclude markdown docs");
  results.push("scope matching separates js and app files");

  assert.equal(sumChangedLines(entries, "all"), 35, "all scope should count every numeric entry");
  assert.equal(sumChangedLines(entries, "js"), 15, "js scope should only count js entries");
  assert.equal(sumChangedLines(entries, "app"), 27, "app scope should count js html css entries");
  results.push("line totals follow the expected scope rules");

  assert.equal(parseCliScope([]), "all", "missing scope should default to all");
  assert.equal(parseCliScope(["--scope=app"]), "app", "cli scope should accept app");
  assert.throws(() => parseCliScope(["--scope=unknown"]), /不支持的 scope/, "unknown scope should throw");
  assert.throws(() => parseCliScope(["--bad"]), /未知参数/, "unknown cli argument should throw");
  results.push("cli parsing validates scope and arguments");

  return { results };
}

const output = runStagedChangeLinesChecks();
for (const result of output.results) {
  console.log(`- ${result}`);
}
