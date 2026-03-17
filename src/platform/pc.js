window.APP_PLATFORM = "pc";
window.CARD_ASSET_DIR = "./cards";
window.DEFAULT_CARD_FACE_KEY = "sprite";
/**
 * 作用：
 * 定义桌面端可切换的牌面主题列表。
 *
 * 为什么这样写：
 * 用户已经明确要求撤回整套 `m_cards_sprite.svg` 试验，并恢复到旧的 `poker.png` 整图牌面；
 * 这里直接把桌面端默认 sprite 入口切回经典整图，保证手牌、出牌区、顶部状态牌和底牌牌背
 * 都重新走之前验证过的同一张资源。
 *
 * 输入：
 * @param {void} - 直接挂到 `window`，供共享配置层读取。
 *
 * 输出：
 * @returns {Array<object>} 桌面端允许使用的牌面配置列表。
 *
 * 注意：
 * - `classic` 继续保留给逐张 SVG 兜底与对照使用。
 * - `sprite` 重新固定指向 `poker.png`，旧的 `modern-sprite` 仍由共享层做兼容映射。
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
];
