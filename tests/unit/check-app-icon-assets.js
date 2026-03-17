const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT_DIR = path.join(__dirname, "../..");

const LEGACY_ICON_CASES = [
  {
    label: "Android mdpi launcher icon",
    file: "android/app/src/main/res/mipmap-mdpi/ic_launcher.png",
    size: 48,
  },
  {
    label: "Android hdpi launcher icon",
    file: "android/app/src/main/res/mipmap-hdpi/ic_launcher.png",
    size: 72,
  },
  {
    label: "Android xhdpi launcher icon",
    file: "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png",
    size: 96,
  },
  {
    label: "Android xxhdpi launcher icon",
    file: "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png",
    size: 144,
  },
  {
    label: "Android xxxhdpi launcher icon",
    file: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
    size: 192,
  },
  {
    label: "Android mdpi round launcher icon",
    file: "android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png",
    size: 48,
  },
  {
    label: "Android hdpi round launcher icon",
    file: "android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png",
    size: 72,
  },
  {
    label: "Android xhdpi round launcher icon",
    file: "android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png",
    size: 96,
  },
  {
    label: "Android xxhdpi round launcher icon",
    file: "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png",
    size: 144,
  },
  {
    label: "Android xxxhdpi round launcher icon",
    file: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png",
    size: 192,
  },
];

const FOREGROUND_ICON_CASES = [
  {
    label: "Android mdpi adaptive foreground",
    file: "android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png",
    size: 108,
  },
  {
    label: "Android hdpi adaptive foreground",
    file: "android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png",
    size: 162,
  },
  {
    label: "Android xhdpi adaptive foreground",
    file: "android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png",
    size: 216,
  },
  {
    label: "Android xxhdpi adaptive foreground",
    file: "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png",
    size: 324,
  },
  {
    label: "Android xxxhdpi adaptive foreground",
    file: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png",
    size: 432,
  },
];

/**
 * 作用：
 * 读取 PNG 文件头并返回尺寸。
 *
 * 为什么这样写：
 * 这次回归只需要锁定图标资源是否存在且尺寸正确，没有必要额外引入图片解析依赖；
 * 直接读取 PNG `IHDR` 头可以让测试保持纯 Node、执行快、依赖少。
 *
 * 输入：
 * @param {string} relativeFilePath - 相对仓库根目录的 PNG 路径。
 *
 * 输出：
 * @returns {{width: number, height: number}} PNG 的宽高信息。
 *
 * 注意：
 * - 这里只支持 PNG，文件头不对时必须直接报错。
 * - `IHDR` 中的宽高是大端序，不能按小端读取。
 */
function readPngSize(relativeFilePath) {
  const absoluteFilePath = path.join(ROOT_DIR, relativeFilePath);
  const fileBuffer = fs.readFileSync(absoluteFilePath);
  const pngSignature = "89504e470d0a1a0a";

  assert.equal(
    fileBuffer.subarray(0, 8).toString("hex"),
    pngSignature,
    `${relativeFilePath} 必须是标准 PNG 文件`,
  );

  return {
    width: fileBuffer.readUInt32BE(16),
    height: fileBuffer.readUInt32BE(20),
  };
}

/**
 * 作用：
 * 断言一组 PNG 图标资源都已按预期尺寸输出。
 *
 * 为什么这样写：
 * App 图标最容易出现的问题就是“改了一张主图，但漏了某几个密度目录”；
 * 把各尺寸枚举出来统一校验，能在最早阶段发现资源缺失或导出尺寸错误。
 *
 * 输入：
 * @param {{label: string, file: string, size: number}[]} iconCases - 需要校验的图标清单。
 *
 * 输出：
 * @returns {void} 全部尺寸断言通过后正常结束。
 *
 * 注意：
 * - 这里只校验边长相等的正方形图标，不覆盖像截图这类非正方资源。
 * - 路径必须保持精确，避免未来有人换目录后测试仍然误过。
 */
function assertPngSquareSizes(iconCases) {
  for (const iconCase of iconCases) {
    const { width, height } = readPngSize(iconCase.file);

    assert.equal(width, iconCase.size, `${iconCase.label} 宽度应为 ${iconCase.size}`);
    assert.equal(height, iconCase.size, `${iconCase.label} 高度应为 ${iconCase.size}`);
  }
}

/**
 * 作用：
 * 校验 iOS 主图标与仓库预览图已经同步到新的 1024 母稿。
 *
 * 为什么这样写：
 * 这次图标不仅要给原生壳使用，还要给评审和后续文档复用；
 * 因此需要同时锁住 iOS 资产集里的正式文件和仓库里的预览图，避免两边内容脱节。
 *
 * 输入：
 * @param {void} - 直接读取固定资源路径。
 *
 * 输出：
 * @returns {void} 断言通过后正常结束。
 *
 * 注意：
 * - iOS 当前只维护一张 `1024x1024` 通用图标，不要误以为缺多尺寸文件就是异常。
 * - 预览图路径是仓库约定，不应随意改名。
 */
function assertIosAndPreviewIcons() {
  assertPngSquareSizes([
    {
      label: "iOS 1024 App Icon",
      file: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
      size: 1024,
    },
    {
      label: "Repository app icon preview",
      file: "images/icons/app_icon_preview.png",
      size: 1024,
    },
  ]);
}

/**
 * 作用：
 * 校验 Android adaptive icon 已切换到品牌背景 drawable。
 *
 * 为什么这样写：
 * 旧配置曾经直接引用纯白色背景，如果未来有人只替换 PNG 而忘了 adaptive XML，
 * Android 主屏就会重新出现“新前景 + 旧白底”的混搭回退。
 *
 * 输入：
 * @param {void} - 直接读取固定 XML 与 drawable 文件。
 *
 * 输出：
 * @returns {void} 全部配置断言通过后正常结束。
 *
 * 注意：
 * - 主图标和圆形图标两份 adaptive XML 都必须同步检查。
 * - 背景 drawable 只锁定关键品牌色与 gradient 语义，不把完整 XML 文本写死。
 */
function assertAndroidAdaptiveIconConfig() {
  const launcherXml = fs.readFileSync(
    path.join(ROOT_DIR, "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"),
    "utf8",
  );
  const launcherRoundXml = fs.readFileSync(
    path.join(ROOT_DIR, "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml"),
    "utf8",
  );
  const backgroundDrawableXml = fs.readFileSync(
    path.join(ROOT_DIR, "android/app/src/main/res/drawable/ic_launcher_background.xml"),
    "utf8",
  );

  assert.match(
    launcherXml,
    /@drawable\/ic_launcher_background/,
    "Android adaptive 主图标应引用品牌背景 drawable，而不是旧的纯色资源",
  );
  assert.match(
    launcherRoundXml,
    /@drawable\/ic_launcher_background/,
    "Android adaptive 圆形图标也应引用品牌背景 drawable",
  );
  assert.match(
    backgroundDrawableXml,
    /<gradient[\s\S]*android:startColor="#C4492E"/,
    "Android adaptive 背景应保留品牌红金渐变起始色",
  );
  assert.match(
    backgroundDrawableXml,
    /android:endColor="#3E0A0D"/,
    "Android adaptive 背景应保留品牌深红渐变终止色",
  );
}

/**
 * 作用：
 * 串行执行 App Icon 资源与配置回归检查。
 *
 * 为什么这样写：
 * 这份脚本会被总测试入口直接调起；
 * 把 iOS 图标、Android 各密度图和 adaptive 配置集中在同一入口里，后续若还要补更多断言，可以保持同样的结构继续扩展。
 *
 * 输入：
 * @param {void} - 依赖固定测试逻辑执行。
 *
 * 输出：
 * @returns {void} 全部断言通过后正常退出。
 *
 * 注意：
 * - 这里不吞异常，任何资源缺失或尺寸错误都应该让回归直接失败。
 * - 若未来新增 `monochrome` 或商店素材检查，也应优先继续补在这份入口里。
 */
function main() {
  assertIosAndPreviewIcons();
  assertPngSquareSizes(LEGACY_ICON_CASES);
  assertPngSquareSizes(FOREGROUND_ICON_CASES);
  assertAndroidAdaptiveIconConfig();
}

main();
