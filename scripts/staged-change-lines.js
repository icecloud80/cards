const { execFileSync } = require("node:child_process");
const path = require("node:path");

const SUPPORTED_SCOPES = new Set(["all", "js", "app"]);
const APP_FILE_EXTENSIONS = new Set([".js", ".html", ".css"]);

/**
 * 作用：
 * 把 `git diff --numstat` 输出解析成稳定的结构化记录。
 *
 * 为什么这样写：
 * pre-commit 需要同时判断 JS 大改动门槛和 UI smoke 门槛；
 * 先把 `numstat` 文本转成统一结构，后续统计规则才能复用且可测试。
 *
 * 输入：
 * @param {string} numstatText - `git diff --cached --numstat` 返回的原始文本。
 *
 * 输出：
 * @returns {Array<{added: number, deleted: number, filePath: string}>} 可供阈值统计使用的改动记录。
 *
 * 注意：
 * - 二进制文件会以 `-` 标记，必须直接跳过。
 * - 这里只做解析，不负责决定是否属于某个统计范围。
 */
function parseNumstatOutput(numstatText) {
  return String(numstatText || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 3)
    .filter((parts) => parts[0] !== "-" && parts[1] !== "-")
    .map((parts) => ({
      added: Number(parts[0]) || 0,
      deleted: Number(parts[1]) || 0,
      filePath: parts.slice(2).join("\t"),
    }));
}

/**
 * 作用：
 * 判断某条暂存改动记录是否应计入指定统计范围。
 *
 * 为什么这样写：
 * 这次既要保留旧的 JS 大改动门槛，也要新增面向 UI smoke 的应用层门槛；
 * 把范围判断集中到一个 helper 里，后续新增文件类型时只改一处。
 *
 * 输入：
 * @param {{filePath: string}} entry - 一条已解析的暂存改动记录。
 * @param {"all"|"js"|"app"} scope - 当前要统计的范围。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前记录应计入该范围。
 *
 * 注意：
 * - `app` 范围只统计当前项目的实现文件：`.js / .html / .css`。
 * - 未识别范围必须抛错，避免 hook 悄悄回退到错误结果。
 */
function matchesScope(entry, scope) {
  if (!SUPPORTED_SCOPES.has(scope)) {
    throw new Error(`未知的 staged-change scope：${scope}`);
  }
  if (scope === "all") {
    return true;
  }

  const extension = path.extname(entry.filePath).toLowerCase();
  if (scope === "js") {
    return extension === ".js";
  }
  return APP_FILE_EXTENSIONS.has(extension);
}

/**
 * 作用：
 * 统计指定范围内的暂存改动总行数。
 *
 * 为什么这样写：
 * hook 只关心“新增 + 删除”的总和；
 * 统一由这个 helper 计算，能让 shell 脚本保持简单，也方便单测锁住口径。
 *
 * 输入：
 * @param {Array<{added: number, deleted: number, filePath: string}>} entries - 已解析的暂存改动记录。
 * @param {"all"|"js"|"app"} [scope="all"] - 当前要统计的范围。
 *
 * 输出：
 * @returns {number} 当前范围内的改动总行数。
 *
 * 注意：
 * - 这里按新增 + 删除合计，不区分净增还是净减。
 * - 空输入必须返回 `0`，避免 hook 中断。
 */
function sumChangedLines(entries, scope = "all") {
  return (Array.isArray(entries) ? entries : []).reduce((total, entry) => {
    if (!matchesScope(entry, scope)) {
      return total;
    }
    return total + entry.added + entry.deleted;
  }, 0);
}

/**
 * 作用：
 * 从当前仓库读取暂存区改动，并统计指定范围的总行数。
 *
 * 为什么这样写：
 * pre-commit 需要直接消费一个稳定的数字结果；
 * 这里把 `git diff` 调用包起来，shell 侧就不必重复维护 awk 逻辑。
 *
 * 输入：
 * @param {"all"|"js"|"app"} [scope="all"] - 当前要统计的范围。
 *
 * 输出：
 * @returns {number} 指定范围的暂存改动总行数。
 *
 * 注意：
 * - 只统计暂存区，避免工作区未暂存内容误触发门禁。
 * - 调用方应在 Git 仓库内执行，否则 `git diff` 会直接抛错。
 */
function getStagedChangedLines(scope = "all") {
  const output = execFileSync("git", ["diff", "--cached", "--numstat"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const entries = parseNumstatOutput(output);
  return sumChangedLines(entries, scope);
}

/**
 * 作用：
 * 解析命令行里的统计范围。
 *
 * 为什么这样写：
 * CLI 目前只需要一个 `--scope=` 参数；
 * 单独拆一个 parser 后，既方便测试，也能让报错信息更明确。
 *
 * 输入：
 * @param {string[]} [argv=process.argv.slice(2)] - 命令行参数列表。
 *
 * 输出：
 * @returns {"all"|"js"|"app"} 归一化后的统计范围。
 *
 * 注意：
 * - 未传时默认返回 `all`。
 * - 发现未知参数时必须直接抛错，避免提交钩子静默降级。
 */
function parseCliScope(argv = process.argv.slice(2)) {
  let scope = "all";
  for (const argument of argv) {
    if (argument.startsWith("--scope=")) {
      scope = argument.split("=")[1] || scope;
      continue;
    }
    throw new Error(`未知参数：${argument}`);
  }
  if (!SUPPORTED_SCOPES.has(scope)) {
    throw new Error(`不支持的 scope：${scope}`);
  }
  return scope;
}

if (require.main === module) {
  process.stdout.write(String(getStagedChangedLines(parseCliScope())));
}

module.exports = {
  APP_FILE_EXTENSIONS,
  parseNumstatOutput,
  matchesScope,
  sumChangedLines,
  getStagedChangedLines,
  parseCliScope,
};
