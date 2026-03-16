const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..");
const CARD_SOURCE_DIR = path.join(REPO_ROOT, "m_cards");
const OUTPUT_FILE_PATH = path.join(REPO_ROOT, "m_cards_sprite.svg");
const SPRITE_COLUMNS = 13;
const SPRITE_ROWS = 5;
const CELL_WIDTH = 90;
const CELL_HEIGHT = 120;
const SQUARE_CARD_SOURCE_VIEWBOX = "0 0 512 512";
const SQUARE_CARD_CROP_VIEWBOX = "64 0 384 512";
const CARD_RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CARD_RANK_FILE_NAME = {
  A: "ace",
  J: "jack",
  Q: "queen",
  K: "king",
};
const CARD_ROW_ORDER = ["hearts", "diamonds", "spades", "clubs"];
const SPECIAL_SPRITE_TILES = [
  { cardId: "joker-RJ", ariaLabel: "红王", fileName: "red_joker.svg", column: 0, row: 4 },
  { cardId: "joker-BJ", ariaLabel: "黑王", fileName: "black_joker.svg", column: 1, row: 4 },
  { cardId: "back-red", ariaLabel: "红背牌", fileName: "card_back_red_striped.svg", column: 2, row: 4 },
];

/**
 * 作用：
 * 把业务里的牌面 rank 转成 `m_cards` 目录使用的文件名片段。
 *
 * 为什么这样写：
 * 目录里既有 `ace / jack / queen / king` 这类英文单词，也有 `2-10` 这类数字；
 * 统一在这里做转换后，后续生成整图时就不用在循环里到处写分支。
 *
 * 输入：
 * @param {string} rank - 业务牌对象里的点数，例如 `A / 10 / K`。
 *
 * 输出：
 * @returns {string} 与 `m_cards` 文件命名规则一致的 rank 片段。
 *
 * 注意：
 * - 这里只处理标准 52 张牌的 rank；大小王和牌背走单独映射。
 * - 未命中的值会原样返回，方便后续让缺失资源直接暴露成文件不存在错误。
 */
function getRankFileName(rank) {
  return CARD_RANK_FILE_NAME[rank] || String(rank);
}

/**
 * 作用：
 * 生成标准花色牌在 `m_cards` 目录中的文件名。
 *
 * 为什么这样写：
 * 普通牌需要按 `rank_of_suit.svg` 的规则定位原始 SVG；
 * 把文件名拼接集中在一个 helper 里，后续如果资源命名变了，只需要改这一处。
 *
 * 输入：
 * @param {string} rank - 牌点，例如 `A / 2 / J`。
 * @param {string} suit - 花色，例如 `hearts / clubs`。
 *
 * 输出：
 * @returns {string} 原始单张 SVG 文件名。
 *
 * 注意：
 * - 调用方仍需自己拼目录路径。
 * - 这里不校验文件是否存在，统一交给资源读取阶段报错。
 */
function getCardFileName(rank, suit) {
  return `${getRankFileName(rank)}_of_${suit}.svg`;
}

/**
 * 作用：
 * 从原始 SVG 文本里提取可复用的 `viewBox` 和内部图形内容。
 *
 * 为什么这样写：
 * 这次要把几十张单图重新拼成一个整图 sprite；
 * 只保留每张卡自己的可视内容，再嵌进统一网格，就能避免把原始外层 `svg` 标签直接套进结果文件里。
 *
 * 输入：
 * @param {string} svgText - 原始 SVG 文件全文。
 * @param {string} filePath - 当前正在处理的文件路径，仅用于报错上下文。
 *
 * 输出：
 * @returns {{viewBox: string, innerMarkup: string}} 当前单张 SVG 的视窗和内部标记。
 *
 * 注意：
 * - 如果源文件没有 `viewBox`，会退回到 `width / height` 推导的视窗。
 * - 未匹配到外层 `<svg>` 时必须直接抛错，避免生成半残的 sprite。
 */
function extractSvgParts(svgText, filePath) {
  const svgOpenTagMatch = svgText.match(/<svg\b([^>]*)>/i);
  if (!svgOpenTagMatch) {
    throw new Error(`未找到 SVG 根节点：${filePath}`);
  }

  const viewBoxMatch = svgOpenTagMatch[1].match(/\bviewBox=(['"])([^'"]+)\1/i);
  const widthMatch = svgOpenTagMatch[1].match(/\bwidth=(['"])([^'"]+)\1/i);
  const heightMatch = svgOpenTagMatch[1].match(/\bheight=(['"])([^'"]+)\1/i);
  const innerMarkup = svgText
    .replace(/^[\s\S]*?<svg\b[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .trim();

  if (!innerMarkup) {
    throw new Error(`SVG 内容为空：${filePath}`);
  }

  if (viewBoxMatch?.[2]) {
    return { viewBox: viewBoxMatch[2], innerMarkup };
  }

  const width = Number.parseFloat(widthMatch?.[2] || "");
  const height = Number.parseFloat(heightMatch?.[2] || "");
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`无法推导 SVG 视窗：${filePath}`);
  }

  return { viewBox: `0 0 ${width} ${height}`, innerMarkup };
}

/**
 * 作用：
 * 给单张 SVG 内部的 `id / url(#...) / href="#..."` 引用统一加前缀。
 *
 * 为什么这样写：
 * 多张 SVG 合成同一个文档后，像 `clipPath`、`mask`、`linearGradient` 这类局部 ID 很容易撞名；
 * 先把它们按卡牌 ID 做命名空间隔离，能避免不同卡面的定义互相串掉。
 *
 * 输入：
 * @param {string} markup - 当前单张 SVG 的内部标记。
 * @param {string} prefix - 当前卡牌专属前缀。
 *
 * 输出：
 * @returns {string} 已完成命名空间隔离的内部标记。
 *
 * 注意：
 * - 这里只做当前仓库资源够用的轻量替换，不引入额外 SVG 解析依赖。
 * - `url(#...)`、`href="#..."` 与 `id="..."` 三类引用必须一起改，否则会断链。
 */
function prefixSvgIdentifiers(markup, prefix) {
  return markup
    .replace(/\bid=(['"])([^'"]+)\1/g, (_, quote, id) => `id=${quote}${prefix}-${id}${quote}`)
    .replace(/\b(xlink:href|href)=(['"])#([^'"]+)\2/g, (_, attr, quote, id) => `${attr}=${quote}#${prefix}-${id}${quote}`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}-${id})`);
}

/**
 * 作用：
 * 把原始单张 SVG 的视窗规范成更适合整图排版的裁切口径。
 *
 * 为什么这样写：
 * `m_cards` 里相当一部分牌面来自 `512x512` 的方形画布，真实卡身只占中间竖条区域；
 * 如果直接把整个方画布塞进 sprite，每张牌左右会留下明显空边，看起来就不像 `poker.png` 那种紧凑牌格。
 * 这里先把方形源图裁到接近标准扑克牌比例，再放进整图，视觉会更稳定。
 *
 * 输入：
 * @param {string} viewBox - 从原始单张 SVG 提取出的视窗字符串。
 *
 * 输出：
 * @returns {string} 适合整图拼版使用的规范化视窗。
 *
 * 注意：
 * - 目前只对仓库里常见的 `512x512` 方形牌面做裁切，其他口径保持原样。
 * - 这里调整的是整图打包口径，不会改动原始单张 SVG 文件本身。
 */
function normalizeSpriteViewBox(viewBox) {
  return viewBox === SQUARE_CARD_SOURCE_VIEWBOX ? SQUARE_CARD_CROP_VIEWBOX : viewBox;
}

/**
 * 作用：
 * 读取一张原始单牌 SVG，并转换成可嵌进整图网格的 tile 数据。
 *
 * 为什么这样写：
 * 生成 sprite 时需要统一知道“这张牌摆在哪一格、原始视窗是什么、内部内容是什么”；
 * 把文件读取和结构整理收口成一个 helper，后续主流程就只处理 tile 列表即可。
 *
 * 输入：
 * @param {{cardId: string, ariaLabel: string, fileName: string, column: number, row: number}} tile - 当前要生成的牌格描述。
 *
 * 输出：
 * @returns {{cardId: string, ariaLabel: string, column: number, row: number, viewBox: string, innerMarkup: string}} 已准备好的 sprite tile 数据。
 *
 * 注意：
 * - 如果原始文件缺失，会直接抛错，避免静默生成缺牌整图。
 * - 这里会顺带给内部 ID 加卡牌前缀，防止多张 SVG 合并后互相污染。
 */
function loadSpriteTile(tile) {
  const filePath = path.join(CARD_SOURCE_DIR, tile.fileName);
  const svgText = fs.readFileSync(filePath, "utf8");
  const svgParts = extractSvgParts(svgText, filePath);
  return {
    ...tile,
    viewBox: normalizeSpriteViewBox(svgParts.viewBox),
    innerMarkup: prefixSvgIdentifiers(svgParts.innerMarkup, tile.cardId),
  };
}

/**
 * 作用：
 * 按当前业务规则生成整套 `m_cards` sprite 需要的牌格列表。
 *
 * 为什么这样写：
 * 现有 `poker.png` 裁切逻辑已经固定为 `13 列 x 5 行`：
 * 前 4 行放 52 张标准牌，最后一行依次放红王、黑王和牌背；
 * 这里直接复用相同排布，生成出来的 SVG 就能零成本接进现有 sprite 渲染逻辑。
 *
 * 输入：
 * @param {void} - 使用脚本内固定的牌序与花色顺序生成。
 *
 * 输出：
 * @returns {Array<object>} 按 sprite 网格坐标排好的全部 tile 描述。
 *
 * 注意：
 * - 普通牌顺序必须与 `A,2,3...10,J,Q,K` 保持一致，不能改成 `2...A`。
 * - 花色行顺序必须继续保持 `hearts / diamonds / spades / clubs`，与现有裁切映射一致。
 */
function buildSpriteTiles() {
  const normalTiles = CARD_ROW_ORDER.flatMap((suit, row) => CARD_RANK_ORDER.map((rank, column) => ({
    cardId: `${suit}-${rank}`,
    ariaLabel: `${suit}-${rank}`,
    fileName: getCardFileName(rank, suit),
    column,
    row,
  })));
  return [...normalTiles, ...SPECIAL_SPRITE_TILES];
}

/**
 * 作用：
 * 把一张 tile 数据渲染成整图 SVG 里的具体子节点。
 *
 * 为什么这样写：
 * 每张牌都需要落在自己的网格坐标上，同时保持原始 SVG 内容完整；
 * 使用嵌套 `<svg>` 能让每个牌面保留自己的视窗，再统一被拉伸进 sprite 的固定格子里。
 *
 * 输入：
 * @param {{cardId: string, ariaLabel: string, column: number, row: number, viewBox: string, innerMarkup: string}} tile - 当前要输出的单个牌格数据。
 *
 * 输出：
 * @returns {string} 可直接拼进整图文件的 SVG 片段。
 *
 * 注意：
 * - 这里显式使用 `xMidYMid meet`，让已经裁好的牌面在牌格里保持自然比例。
 * - `data-card-id` 会保留下来，方便测试直接定位关键牌位。
 */
function buildTileMarkup(tile) {
  return `  <svg x="${tile.column * CELL_WIDTH}" y="${tile.row * CELL_HEIGHT}" width="${CELL_WIDTH}" height="${CELL_HEIGHT}" viewBox="${tile.viewBox}" preserveAspectRatio="xMidYMid meet" data-card-id="${tile.cardId}" aria-label="${tile.ariaLabel}">\n${tile.innerMarkup}\n  </svg>`;
}

/**
 * 作用：
 * 组装完整的 `m_cards` SVG sprite 文本。
 *
 * 为什么这样写：
 * 生成结果不仅要可被 CSS `background-position` 裁切，还要便于测试和后续人工检查；
 * 所以这里统一补入尺寸、视窗、说明文字和全部 tile 标记，输出成稳定的单文件资源。
 *
 * 输入：
 * @param {Array<object>} tiles - 全部已准备好的 sprite tile 数据。
 *
 * 输出：
 * @returns {string} 最终写入磁盘的 SVG sprite 文本。
 *
 * 注意：
 * - 总尺寸沿用 `poker.png` 的 `1170 x 600`，方便和现有视觉基准对齐。
 * - 结果文件必须只依赖当前仓库里的 `m_cards` 原始资源，不能引用外部 URL。
 */
function buildSpriteMarkup(tiles) {
  const tileMarkup = tiles.map(buildTileMarkup).join("\n");
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1170" height="600" viewBox="0 0 1170 600">',
    "  <title>m_cards SVG sprite sheet</title>",
    "  <desc>Generated from the m_cards single-card SVG assets using the same 13x5 layout as poker.png.</desc>",
    tileMarkup,
    "</svg>",
    "",
  ].join("\n");
}

/**
 * 作用：
 * 执行整套 `m_cards` SVG sprite 的生成流程并落盘。
 *
 * 为什么这样写：
 * 这次需求本质上是“把已有单牌资源组织成一张可复用的整图资源”；
 * 统一用脚本生成后，后续替换任意单张 SVG 时都能稳定再生，不需要手工维护超长 sprite 文件。
 *
 * 输入：
 * @param {void} - 使用脚本内固定配置读取资源并写出结果。
 *
 * 输出：
 * @returns {void} 正常完成时会把 `m_cards_sprite.svg` 写到仓库根目录。
 *
 * 注意：
 * - 写出前会覆盖旧文件，因此结果应始终由脚本重建，而不是手工改。
 * - 终端输出只作为提示，真正的交付物是生成的 SVG 文件本身。
 */
function main() {
  const tiles = buildSpriteTiles().map(loadSpriteTile);
  const spriteMarkup = buildSpriteMarkup(tiles);
  fs.writeFileSync(OUTPUT_FILE_PATH, spriteMarkup, "utf8");
  console.log(`Generated ${path.relative(REPO_ROOT, OUTPUT_FILE_PATH)} with ${tiles.length} tiles.`);
}

main();
