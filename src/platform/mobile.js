window.APP_PLATFORM = "mobile";
window.CARD_ASSET_DIR = "./cards";
window.DEFAULT_CARD_FACE_KEY = "sprite";
/**
 * 作用：
 * 定义手游端可切换的牌面主题列表。
 *
 * 为什么这样写：
 * 这次要把新的 `m_cards_sprite.png` 做成手游可直接切换的新牌面主题；
 * 保留现有 `poker.png` 默认入口，再额外挂出“现代整图”，
 * 就能同时兼顾历史体验稳定性和新视觉方案的接入验证。
 *
 * 输入：
 * @param {void} - 直接挂到 `window`，供共享配置层读取。
 *
 * 输出：
 * @returns {Array<object>} 手游端允许使用的牌面配置列表。
 *
 * 注意：
 * - `classic` 继续保留给逐张 SVG 兜底与对照使用。
 * - `sprite` 继续固定指向 `poker.png`，保持 mobile 默认牌面和历史体验一致。
 * - `modern-sprite` 作为真实可选主题接回运行态，并复用现有 mobile 缩放口径。
 */
window.CARD_FACE_OPTIONS = [
  { key: "classic", label: "经典", dir: "./cards" },
  {
    key: "sprite",
    label: "经典整图",
    dir: "./cards",
    spriteSheet: {
      src: "./poker.png",
      columns: 13,
      rows: 5,
    },
  },
  {
    key: "modern-sprite",
    label: "现代整图",
    dir: "./cards",
    spriteSheet: {
      src: "./m_cards_sprite.png",
      columns: 13,
      rows: 5,
    },
  },
];
