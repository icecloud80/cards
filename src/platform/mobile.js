window.APP_PLATFORM = "mobile";
window.CARD_ASSET_DIR = "./cards";
window.DEFAULT_CARD_FACE_KEY = "sprite";
/**
 * 作用：
 * 定义手游端可切换的牌面主题列表。
 *
 * 为什么这样写：
 * 用户要求把手游也整套撤回到旧的 `poker.png` 整图牌面；
 * 这里直接恢复 mobile 默认 sprite 入口，避免设置菜单和运行态继续并列保留一套失败的
 * `m_cards_sprite.svg` 试验牌面。
 *
 * 输入：
 * @param {void} - 直接挂到 `window`，供共享配置层读取。
 *
 * 输出：
 * @returns {Array<object>} 手游端允许使用的牌面配置列表。
 *
 * 注意：
 * - `classic` 继续保留给逐张 SVG 兜底与对照使用。
 * - `sprite` 重新固定指向 `poker.png`，保持 mobile 默认牌面和历史体验一致。
 * - 旧的 `modern-sprite` 仍由共享层兼容映射到 `sprite`。
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
