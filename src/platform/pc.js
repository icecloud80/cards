window.APP_PLATFORM = "pc";
window.CARD_ASSET_DIR = "./cards";
window.DEFAULT_CARD_FACE_KEY = "sprite";
/**
 * 作用：
 * 定义桌面端可切换的牌面主题列表。
 *
 * 为什么这样写：
 * 这次要把 PC 里所有整图牌面展示也统一到新的 `m_cards_sprite.svg`；
 * 这样桌面端默认牌面、顶部状态牌、底牌牌背和手牌切图都会和手游保持同一套 sprite 资源，
 * 不再默认落回旧的 `poker.png` 牌风。
 *
 * 输入：
 * @param {void} - 直接挂到 `window`，供共享配置层读取。
 *
 * 输出：
 * @returns {Array<object>} 桌面端允许使用的牌面配置列表。
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
