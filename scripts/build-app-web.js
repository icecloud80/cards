const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "dist", "app");
const APP_ENTRY_SOURCE = "index2.html";
const OUTPUT_ENTRY_FILE = "index.html";
const STATIC_FILES = [
  "index1.html",
  "index2.html",
  "index-static.html",
  "m_cards_sprite.svg",
  "poker.png",
  "elements.cardmeister.min.js",
];
const STATIC_DIRECTORIES = [
  "src",
  "cards",
  "m_cards",
  "icons",
  "avatars",
];

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
function copyStaticFile(relativeFilePath) {
  const sourcePath = path.join(ROOT_DIR, relativeFilePath);
  const targetPath = path.join(OUTPUT_DIR, relativeFilePath);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

/**
 * 作用：
 * 递归复制 App 运行所需的静态目录。
 *
 * 为什么这样写：
 * 当前 mobile 页面仍直接引用 `src/`、`icons/`、`m_cards/` 等目录；
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
function copyStaticDirectory(relativeDirectoryPath) {
  const sourcePath = path.join(ROOT_DIR, relativeDirectoryPath);
  const targetPath = path.join(OUTPUT_DIR, relativeDirectoryPath);
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
 * 同时仍保留 `index1.html / index2.html / index-static.html` 这些页面，方便原生壳调试与回归。
 *
 * 输入：
 * @param {void} - 构建过程依赖文件常量清单，不需要额外外部参数。
 *
 * 输出：
 * @returns {void} 在 `dist/app` 下生成可供 Capacitor 同步的静态资源。
 *
 * 注意：
 * - `dist/app/index.html` 会直接复制自 `index2.html`，作为 App 默认入口。
 * - 如果后续首页需要改成原生风格大厅页，优先调整这里的入口映射，不要手改生成产物。
 */
function buildAppWebBundle() {
  recreateDirectory(OUTPUT_DIR);
  STATIC_FILES.forEach(copyStaticFile);
  STATIC_DIRECTORIES.forEach(copyStaticDirectory);
  fs.copyFileSync(
    path.join(ROOT_DIR, APP_ENTRY_SOURCE),
    path.join(OUTPUT_DIR, OUTPUT_ENTRY_FILE),
  );
  removeSystemMetadata(OUTPUT_DIR);
  console.log(`App web bundle ready: ${path.relative(ROOT_DIR, OUTPUT_DIR)}`);
}

buildAppWebBundle();
