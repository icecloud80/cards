const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "dist", "app");
const APP_ENTRY_SOURCE = "index-app.html";
const OUTPUT_ENTRY_FILE = "index.html";
const STATIC_FILES = [
  "index-app.html",
  "index1.html",
  "index2.html",
  "index-static.html",
];
const STATIC_DIRECTORIES = [
  "src",
  "images",
];

/**
 * 作用：
 * 组装 App Web 构建流程要使用的路径和资源清单。
 *
 * 为什么这样写：
 * 构建脚本既要保留命令行默认行为，也要允许单测把输出目录或复制清单改到临时目录；
 * 把默认值收口到一个 helper 里后，测试就能安全复用同一套生产配置，而不是再手写一份镜像逻辑。
 *
 * 输入：
 * @param {object} [overrides={}] - 构建阶段的可选覆盖项。
 * @param {string} [overrides.rootDir] - 仓库根目录绝对路径。
 * @param {string} [overrides.outputDir] - 构建输出目录绝对路径。
 * @param {string} [overrides.appEntrySource] - 默认入口页相对根目录路径。
 * @param {string} [overrides.outputEntryFile] - 输出目录里的默认入口文件名。
 * @param {string[]} [overrides.staticFiles] - 需要复制的静态文件相对路径清单。
 * @param {string[]} [overrides.staticDirectories] - 需要递归复制的静态目录相对路径清单。
 *
 * 输出：
 * @returns {object} 标准化后的构建配置对象。
 *
 * 注意：
 * - 这里返回的新数组必须复制默认常量，避免调用方意外改写全局配置。
 * - `elements.cardmeister.min.js` 已明确退出 App Web 构建清单，不要再从这里加回去。
 */
function resolveBuildConfig(overrides = {}) {
  return {
    rootDir: overrides.rootDir ?? ROOT_DIR,
    outputDir: overrides.outputDir ?? OUTPUT_DIR,
    appEntrySource: overrides.appEntrySource ?? APP_ENTRY_SOURCE,
    outputEntryFile: overrides.outputEntryFile ?? OUTPUT_ENTRY_FILE,
    staticFiles: [...(overrides.staticFiles ?? STATIC_FILES)],
    staticDirectories: [...(overrides.staticDirectories ?? STATIC_DIRECTORIES)],
  };
}

/**
 * 作用：
 * 清空并重建 App Web 构建输出目录。
 *
 * 为什么这样写：
 * App 壳打包需要一份稳定、可重复生成的静态目录；
 * 每次构建前先删后建，能避免旧资源残留导致真机里继续读到过期脚本或图片。
 *
 * 输入：
 * @param {string} targetDir - 当前要重建的输出目录绝对路径。
 *
 * 输出：
 * @returns {void} 只负责重建目录，不返回业务结果。
 *
 * 注意：
 * - 这里只允许处理 `dist/app` 这类构建产物目录，不要改成源码目录。
 * - 删除使用 `force`，是为了兼容首次构建和目录不存在的情况。
 */
function recreateDirectory(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

/**
 * 作用：
 * 把仓库根目录下的单个静态文件复制到 App 输出目录。
 *
 * 为什么这样写：
 * App 首发第一阶段先复用现有静态文件结构；
 * 把复制逻辑集中封装后，后续如果某个文件迁移到打包步骤里，只需要改这一层清单。
 *
 * 输入：
 * @param {string} relativeFilePath - 相对仓库根目录的文件路径。
 *
 * 输出：
 * @returns {void} 文件复制完成后结束，不返回额外数据。
 *
 * 注意：
 * - 目标目录需要先确保存在。
 * - 这里只处理文件，不负责目录递归。
 */
function copyStaticFile(relativeFilePath, buildConfig) {
  const sourcePath = path.join(buildConfig.rootDir, relativeFilePath);
  const targetPath = path.join(buildConfig.outputDir, relativeFilePath);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

/**
 * 作用：
 * 递归复制 App 运行所需的静态目录。
 *
 * 为什么这样写：
 * 当前页面运行时仍直接引用 `src/`、`images/` 等静态目录；
 * 整目录复制可以先快速打通 App 壳，等后续再把资源链路收敛成更正式的前端构建流程。
 *
 * 输入：
 * @param {string} relativeDirectoryPath - 相对仓库根目录的目录路径。
 *
 * 输出：
 * @returns {void} 目录复制完成后结束。
 *
 * 注意：
 * - `fs.cpSync` 需要 Node 16+；当前 App 工程环境要求本身高于这个版本。
 * - 复制目录前不单独删除目标，是因为顶层输出目录已在构建开始时整体重建。
 */
function copyStaticDirectory(relativeDirectoryPath, buildConfig) {
  const sourcePath = path.join(buildConfig.rootDir, relativeDirectoryPath);
  const targetPath = path.join(buildConfig.outputDir, relativeDirectoryPath);
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

/**
 * 作用：
 * 清理构建输出目录里不该进入 App 包的系统元数据文件。
 *
 * 为什么这样写：
 * 部分资源目录历史上已经存在 `.DS_Store`，仅靠复制阶段过滤并不总是稳定；
 * 构建结束后再做一次统一扫描，能确保最终进入原生壳的目录保持干净。
 *
 * 输入：
 * @param {string} currentDir - 当前要扫描的目录绝对路径。
 *
 * 输出：
 * @returns {void} 只做递归清理，不返回业务数据。
 *
 * 注意：
 * - 这里只清理 `.DS_Store`，不要顺手扩展成删除其他未知文件。
 * - 调用时必须只针对构建产物目录，避免误删源码目录下的本地文件。
 */
function removeSystemMetadata(currentDir) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const targetPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      removeSystemMetadata(targetPath);
      continue;
    }
    if (entry.name === ".DS_Store") {
      fs.rmSync(targetPath, { force: true });
    }
  }
}

/**
 * 作用：
 * 生成 App 壳需要的 Web 静态包，并把默认入口收口到手游页。
 *
 * 为什么这样写：
 * 首发 App 的默认体验应直接进入 mobile 运行态，而不是仓库根目录的跳转页；
 * 同时仍保留 `index-app.html / index1.html / index2.html / index-static.html` 这些页面，方便原生壳调试与回归。
 *
 * 输入：
 * @param {void} - 构建过程依赖文件常量清单，不需要额外外部参数。
 *
 * 输出：
 * @returns {void} 在 `dist/app` 下生成可供 Capacitor 同步的静态资源。
 *
 * 注意：
 * - `dist/app/index.html` 会直接复制自 `index-app.html`，作为 App 默认入口。
 * - 如果后续首页需要改成原生风格大厅页，优先调整这里的入口映射，不要手改生成产物。
 */
function buildAppWebBundle(overrides = {}) {
  const buildConfig = resolveBuildConfig(overrides);

  recreateDirectory(buildConfig.outputDir);
  buildConfig.staticFiles.forEach((relativeFilePath) => copyStaticFile(relativeFilePath, buildConfig));
  buildConfig.staticDirectories.forEach((relativeDirectoryPath) => copyStaticDirectory(relativeDirectoryPath, buildConfig));
  fs.copyFileSync(
    path.join(buildConfig.rootDir, buildConfig.appEntrySource),
    path.join(buildConfig.outputDir, buildConfig.outputEntryFile),
  );
  removeSystemMetadata(buildConfig.outputDir);
  return buildConfig.outputDir;
}

/**
 * 作用：
 * 以脚本入口形式执行 App Web 构建，并输出统一日志。
 *
 * 为什么这样写：
 * 命令行构建仍然需要保持现有 `npm run build:app-web` 体验；
 * 但把日志和主执行分离后，单测可以直接调用构建函数，不会在 `require` 阶段就污染临时目录或控制台。
 *
 * 输入：
 * @param {void} - 直接复用默认构建配置执行。
 *
 * 输出：
 * @returns {void} 构建完成后打印输出目录相对路径。
 *
 * 注意：
 * - 这里只用于命令行入口，不要在单测里调用它。
 * - 如果后续要扩展 CLI 参数，优先在这里解析，再传给 `buildAppWebBundle`。
 */
function runCli() {
  const outputDir = buildAppWebBundle();
  console.log(`App web bundle ready: ${path.relative(ROOT_DIR, outputDir)}`);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  APP_ENTRY_SOURCE,
  OUTPUT_DIR,
  OUTPUT_ENTRY_FILE,
  ROOT_DIR,
  STATIC_DIRECTORIES,
  STATIC_FILES,
  buildAppWebBundle,
  resolveBuildConfig,
};
