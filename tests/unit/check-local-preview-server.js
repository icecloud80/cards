const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  DEFAULT_PREVIEW_HOST,
  DEFAULT_PREVIEW_PORT,
  DEFAULT_PREVIEW_ROOT,
  buildPreviewOrigin,
  getMimeType,
  parsePreviewServerArgs,
  resolveStaticFilePath,
} = require("../../scripts/static-preview-server");

/**
 * 作用：
 * 执行本地预览服务的 Node / Python 双入口回归断言。
 *
 * 为什么这样写：
 * 这次新增的不是一次性脚本，而是后续持续要复用的预览工作流；
 * 用一条轻量测试同时锁住路径保护、CLI 参数和 Python 兼容入口，后面改服务时更不容易把手动预览改坏。
 *
 * 输入：
 * @param {void} - 测试数据在函数内部固定构造。
 *
 * 输出：
 * @returns {{results: string[]}} 供脚本末尾统一打印的结果摘要。
 *
 * 注意：
 * - 这里只验证配置与 helper，不真的启动长期驻留的 HTTP 服务。
 * - Python 断言通过 `python3 -c` 导入仓库脚本，确保未来 Python 工作流不会漂移。
 */
function runLocalPreviewServerChecks() {
  const results = [];

  const defaultOptions = parsePreviewServerArgs([]);
  assert.equal(defaultOptions.host, DEFAULT_PREVIEW_HOST, "default preview host should stay stable");
  assert.equal(defaultOptions.port, DEFAULT_PREVIEW_PORT, "default preview port should stay stable");
  assert.equal(defaultOptions.rootDir, DEFAULT_PREVIEW_ROOT, "default preview root should stay at the project root");
  results.push("node preview cli defaults stay stable");

  const customOptions = parsePreviewServerArgs(["--host=0.0.0.0", "--port=4300", "--root=docs"]);
  assert.equal(customOptions.host, "0.0.0.0", "custom host should be parsed");
  assert.equal(customOptions.port, 4300, "custom port should be parsed");
  assert.equal(customOptions.rootDir, path.resolve(process.cwd(), "docs"), "custom root should resolve from cwd");
  assert.throws(() => parsePreviewServerArgs(["--port=0"]), /port 必须是 1-65535 的整数/, "invalid port should throw");
  assert.throws(() => parsePreviewServerArgs(["--bad"]), /未知参数/, "unknown preview cli arg should throw");
  results.push("node preview cli validates custom args");

  assert.equal(resolveStaticFilePath("/index1.html"), `${DEFAULT_PREVIEW_ROOT}/index1.html`, "preview path resolver should map files under the project root");
  assert.equal(resolveStaticFilePath("/index-app.html"), `${DEFAULT_PREVIEW_ROOT}/index-app.html`, "preview path resolver should also map the App-specific mobile page");
  assert.equal(getMimeType("/tmp/demo.txt"), "text/plain; charset=utf-8", "preview mime helper should recognize txt files");
  assert.equal(
    buildPreviewOrigin("0.0.0.0", DEFAULT_PREVIEW_PORT),
    `http://127.0.0.1:${DEFAULT_PREVIEW_PORT}`,
    "0.0.0.0 should be rewritten for browser usage"
  );
  assert.throws(() => resolveStaticFilePath("/../outside.txt"), /非法静态资源路径/, "preview path resolver should block traversal");
  results.push("node preview path safety and mime rules stay stable");

  const pythonProgram = `
import json
import sys
from pathlib import Path

sys.path.insert(0, ${JSON.stringify(path.resolve(process.cwd(), "scripts"))})
import local_preview_server as preview_server

defaults = preview_server.parse_preview_server_args([])
custom = preview_server.parse_preview_server_args(["--host=0.0.0.0", "--port=4301", "--root=docs"])
resolved = str(preview_server.resolve_static_file_path("/index2.html"))
origin = preview_server.build_preview_origin("0.0.0.0", ${DEFAULT_PREVIEW_PORT})

print(json.dumps({
    "default_host": defaults.host,
    "default_port": defaults.port,
    "default_root": defaults.root_dir,
    "custom_host": custom.host,
    "custom_port": custom.port,
    "custom_root": custom.root_dir,
    "resolved": resolved,
    "origin": origin,
}))
`;
  const pythonOutput = execFileSync("python3", ["-c", pythonProgram], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const pythonResult = JSON.parse(pythonOutput.trim());

  assert.equal(pythonResult.default_host, DEFAULT_PREVIEW_HOST, "python preview host default should match node");
  assert.equal(pythonResult.default_port, DEFAULT_PREVIEW_PORT, "python preview port default should match node");
  assert.equal(pythonResult.default_root, DEFAULT_PREVIEW_ROOT, "python preview root default should stay at the project root");
  assert.equal(pythonResult.custom_host, "0.0.0.0", "python preview custom host should parse");
  assert.equal(pythonResult.custom_port, 4301, "python preview custom port should parse");
  assert.equal(pythonResult.custom_root, path.resolve(process.cwd(), "docs"), "python preview custom root should resolve from cwd");
  assert.equal(pythonResult.resolved, `${DEFAULT_PREVIEW_ROOT}/index2.html`, "python preview resolver should map files inside the project");
  assert.equal(
    pythonResult.origin,
    `http://127.0.0.1:${DEFAULT_PREVIEW_PORT}`,
    "python preview origin should rewrite 0.0.0.0"
  );
  results.push("python preview entry stays aligned with node defaults");

  return { results };
}

const output = runLocalPreviewServerChecks();
for (const result of output.results) {
  console.log(`- ${result}`);
}
