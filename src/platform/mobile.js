window.APP_PLATFORM = "mobile";
window.CARD_ASSET_DIR = "./m_cards";
window.DEFAULT_CARD_FACE_KEY = "sprite";
/**
 * 作用：
 * 定义手游端可切换的牌面主题列表。
 *
 * 为什么这样写：
 * 这次要把手游里所有整图牌面展示统一收口到新的 `m_cards_sprite.svg`；
 * 保留一套 `sprite` 入口后，顶部状态牌、手牌、底牌和设置菜单里的“切牌面”文案都会指向同一张整图，
 * 避免用户在 `poker.png` 与 `m_cards_sprite.svg` 两套 sprite 之间来回切到不同牌风。
 *
 * 输入：
 * @param {void} - 直接挂到 `window`，供共享配置层读取。
 *
 * 输出：
 * @returns {Array<object>} 手游端允许使用的牌面配置列表。
 *
 * 注意：
 * - `classic` 继续保留给逐张 SVG 兜底与对照使用。
 * - `sprite` 现在固定指向 `m_cards_sprite.svg`，旧的 `modern-sprite` 由共享层做兼容映射。
 */
window.CARD_FACE_OPTIONS = [
  { key: "classic", label: "经典", dir: "./cards" },
  {
    key: "sprite",
    label: "整图牌面",
    dir: "./m_cards",
    spriteSheet: {
      src: "./m_cards_sprite.svg",
      columns: 13,
      rows: 5,
    },
  },
];
