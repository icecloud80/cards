const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");

const {
  buildAppWebBundle,
  resolveBuildConfig,
} = require("../../scripts/build-app-web.js");

/**
 * 作用：
 * 校验 App Web 构建默认资源清单已经移除废弃的 `elements.cardmeister.min.js`。
 *
 * 为什么这样写：
 * 这次调整的目标不是“手工删一次文件”就结束，而是要保证默认构建配置以后也不会再把这份旧脚本带回 App 包；
 * 直接锁定默认清单，可以在最早阶段发现资源回退。
 *
 * 输入：
 * @param {void} - 直接读取脚本默认配置。
 *
 * 输出：
 * @returns {void} 断言通过后正常结束。
 *
 * 注意：
 * - 这里只校验默认配置，不覆盖测试专用 override。
 * - 文件名必须保持精确匹配，避免未来换成模糊判断漏检。
 */
function assertLegacyVendorScriptRemovedFromDefaultConfig() {
  const buildConfig = resolveBuildConfig();

  assert.equal(
    buildConfig.appEntrySource,
    "index-app.html",
    "App Web 默认入口源文件应切到 index-app.html，避免原生壳继续直接使用 index2.html",
  );
  assert.equal(
    buildConfig.staticFiles.includes("elements.cardmeister.min.js"),
    false,
    "App Web 默认静态文件清单不应再包含 elements.cardmeister.min.js",
  );
}

/**
 * 作用：
 * 校验 App Web 构建产物里不会再生成废弃脚本副本。
 *
 * 为什么这样写：
 * 即使清单看起来已经删除，构建逻辑后续仍可能通过别的入口把旧脚本抄回输出目录；
 * 把最终产物也锁住后，才能真正防止 iOS / Android 原生壳继续携带无用资源。
 *
 * 输入：
 * @param {void} - 使用临时目录执行一次最小化构建。
 *
 * 输出：
 * @returns {void} 所有断言通过后正常结束。
 *
 * 注意：
 * - 测试只复制默认 HTML 文件，不递归复制大目录，避免单测过慢。
 * - 临时目录必须在测试结束后清理，避免污染本机缓存。
 */
function assertLegacyVendorScriptRemovedFromBuildOutput() {
  const tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "cards-build-app-web-"));
  const outputDir = path.join(tempRootDir, "dist", "app");

  try {
    buildAppWebBundle({
      outputDir,
      staticDirectories: [],
    });

    assert.equal(
      fs.existsSync(path.join(outputDir, "index-app.html")),
      true,
      "App Web 构建应继续复制 index-app.html，方便原生壳与专用 App 入口对照",
    );
    assert.equal(
      fs.existsSync(path.join(outputDir, "index1.html")),
      true,
      "App Web 构建应继续复制 index1.html，方便原生壳调试与对照",
    );
    assert.equal(
      fs.existsSync(path.join(outputDir, "index2.html")),
      true,
      "App Web 构建应继续复制 index2.html，方便原生壳对照 mobile 运行态",
    );
    assert.equal(
      fs.existsSync(path.join(outputDir, "index-static.html")),
      true,
      "App Web 构建应继续复制 index-static.html，方便静态模板核对",
    );
    assert.equal(
      fs.existsSync(path.join(outputDir, "index.html")),
      true,
      "App Web 构建应继续生成默认入口 index.html",
    );
    assert.equal(
      fs.readFileSync(path.join(outputDir, "index.html"), "utf8"),
      fs.readFileSync(path.join(__dirname, "../../index-app.html"), "utf8"),
      "App Web 默认入口应直接复用 index-app.html，而不是继续回退到 index2.html",
    );
    assert.equal(
      fs.existsSync(path.join(outputDir, "elements.cardmeister.min.js")),
      false,
      "App Web 构建产物不应再包含 elements.cardmeister.min.js",
    );
  } finally {
    fs.rmSync(tempRootDir, { recursive: true, force: true });
  }
}

/**
 * 作用：
 * 串行执行 App Web 构建相关的资源清理回归校验。
 *
 * 为什么这样写：
 * 这份脚本被总回归入口直接 `node` 调起；
 * 用显式 `main` 串起检查项后，后续如果还要补更多构建断言，可以保持同一份入口结构。
 *
 * 输入：
 * @param {void} - 依赖固定测试逻辑执行。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里不吞异常，任何断言失败都应该直接让单测红掉。
 * - 保持执行顺序固定，便于快速定位是配置回退还是产物回退。
 */
function main() {
  assertLegacyVendorScriptRemovedFromDefaultConfig();
  assertLegacyVendorScriptRemovedFromBuildOutput();
}

main();
