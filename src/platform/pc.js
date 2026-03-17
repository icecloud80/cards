window.APP_PLATFORM = "pc";
window.CARD_ASSET_DIR = "./cards";
window.DEFAULT_CARD_FACE_KEY = "sprite";
/**
 * 作用：
 * 定义桌面端可切换的牌面主题列表。
 *
 * 为什么这样写：
 * 这次需要在不打断现有默认体验的前提下，把新的 `m_cards_sprite.png` 接回 PC 主题选择器；
 * 继续保留 `poker.png` 的经典整图作为默认项，再额外挂一套“现代整图”，
 * 就能让桌面端直接切换新牌面，同时不影响已有存档、截图基线和视觉回归。
 *
 * 输入：
 * @param {void} - 直接挂到 `window`，供共享配置层读取。
 *
 * 输出：
 * @returns {Array<object>} 桌面端允许使用的牌面配置列表。
 *
 * 注意：
 * - `classic` 继续保留给逐张 SVG 兜底与对照使用。
 * - `sprite` 继续固定指向 `poker.png`，保持现有默认体验不变。
 * - `modern-sprite` 重新作为真实可选主题出现，供 PC / mobile 共用同一张新的 PNG 整图资源。
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
