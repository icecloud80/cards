const assert = require("node:assert/strict");
const path = require("node:path");

const {
  DEFAULT_PREVIEW_HOST,
  DEFAULT_PREVIEW_PORT,
  DEFAULT_PREVIEW_ROOT,
} = require("../../scripts/static-preview-server");
const {
  DEFAULT_LOCK_STALE_MS,
  shouldAutoStartForDirectory,
  parseEnsurePreviewArgs,
  getEnsureLockPath,
  acquireEnsureLock,
  buildDetachedPreviewStartSpec,
} = require("../../scripts/ensure-preview-server");

/**
 * 作用：
 * 校验目录进入自动启动预览服务的辅助逻辑。
 *
 * 为什么这样写：
 * 自动启动会挂到 `~/.zshrc` 的目录切换钩子上，出了问题会直接影响日常进入仓库的体验；
 * 用一条轻量回归把目录判断、CLI 参数和后台启动配置锁住，可以降低把 shell 环境改坏的风险。
 *
 * 输入：
 * @param {void} - 测试数据在函数内部固定构造。
 *
 * 输出：
 * @returns {{results: string[]}} 供脚本末尾统一打印的结果摘要。
 *
 * 注意：
 * - 这里只验证 helper 逻辑，不真的在测试里拉起长期驻留的预览服务。
 * - 临时锁文件会在断言完成后立即释放，避免污染后续测试。
 */
function runPreviewAutoStartChecks() {
  const results = [];

  assert.equal(shouldAutoStartForDirectory(DEFAULT_PREVIEW_ROOT), true, "project root should auto-start the preview server");
  assert.equal(
    shouldAutoStartForDirectory(path.join(DEFAULT_PREVIEW_ROOT, "src/shared")),
    true,
    "project subdirectories should auto-start the preview server"
  );
  assert.equal(shouldAutoStartForDirectory("/tmp"), false, "unrelated directories should not auto-start the preview server");
  results.push("directory scope detection stays stable");

  const defaultOptions = parseEnsurePreviewArgs([]);
  assert.equal(defaultOptions.cwd, DEFAULT_PREVIEW_ROOT, "default cwd should inherit the current project root");
  assert.equal(defaultOptions.host, DEFAULT_PREVIEW_HOST, "default host should reuse the preview host");
  assert.equal(defaultOptions.port, DEFAULT_PREVIEW_PORT, "default port should reuse the preview port");
  assert.equal(defaultOptions.projectRoot, DEFAULT_PREVIEW_ROOT, "default project root should stay on the cards repo");
  assert.equal(defaultOptions.quiet, false, "quiet mode should default to false");

  const customOptions = parseEnsurePreviewArgs([
    "--cwd=docs",
    "--host=0.0.0.0",
    "--port=4302",
    "--project-root=.",
    "--quiet",
  ]);
  assert.equal(customOptions.cwd, path.resolve(process.cwd(), "docs"), "custom cwd should resolve from the current shell");
  assert.equal(customOptions.host, "0.0.0.0", "custom host should be parsed");
  assert.equal(customOptions.port, 4302, "custom port should be parsed");
  assert.equal(customOptions.projectRoot, path.resolve(process.cwd()), "custom project root should resolve from cwd");
  assert.equal(customOptions.quiet, true, "quiet flag should be parsed");
  assert.throws(() => parseEnsurePreviewArgs(["--port=0"]), /port 必须是 1-65535 的整数/, "invalid ensure port should throw");
  assert.throws(() => parseEnsurePreviewArgs(["--bad"]), /未知参数/, "unknown ensure arg should throw");
  results.push("ensure-preview cli parsing stays stable");

  const lockPath = getEnsureLockPath(DEFAULT_PREVIEW_ROOT);
  assert.equal(lockPath, `/tmp/${path.basename(DEFAULT_PREVIEW_ROOT)}-preview-autostart.lock`, "lock path should stay stable");
  const lock = acquireEnsureLock(lockPath, DEFAULT_LOCK_STALE_MS);
  assert.notEqual(lock, null, "first ensure lock acquisition should succeed");
  const competingLock = acquireEnsureLock(lockPath, DEFAULT_LOCK_STALE_MS);
  assert.equal(competingLock, null, "concurrent ensure lock acquisition should fail fast");
  lock.release();
  results.push("ensure-preview lock coordination stays stable");

  const startSpec = buildDetachedPreviewStartSpec({ projectRoot: DEFAULT_PREVIEW_ROOT });
  assert.equal(startSpec.command, process.execPath, "detached preview start should reuse the current node binary");
  assert.equal(
    startSpec.args[0],
    path.join(DEFAULT_PREVIEW_ROOT, "scripts/local-preview-server.js"),
    "detached preview start should call the project preview server entry"
  );
  assert.equal(startSpec.spawnOptions.cwd, DEFAULT_PREVIEW_ROOT, "detached preview start should run from the project root");
  assert.equal(startSpec.spawnOptions.detached, true, "detached preview start should run in detached mode");
  assert.equal(startSpec.spawnOptions.stdio, "ignore", "detached preview start should not inherit shell stdio");
  results.push("detached preview spawn spec stays stable");

  return { results };
}

const output = runPreviewAutoStartChecks();
for (const result of output.results) {
  console.log(`- ${result}`);
}
