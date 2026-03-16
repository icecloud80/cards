window.APP_PLATFORM = "pc";
window.CARD_ASSET_DIR = "./cards";
window.DEFAULT_CARD_FACE_KEY = "sprite";
window.CARD_FACE_OPTIONS = [
  { key: "classic", label: "经典", dir: "./cards" },
  {
    key: "sprite",
    label: "整图牌面",
    dir: "./cards",
    spriteSheet: {
      src: "./poker.png",
      columns: 13,
      rows: 5,
    },
  },
  // 复用 m_cards 单张 SVG 生成的整图牌面，保持与 poker.png 相同的裁切网格。
  {
    key: "modern-sprite",
    label: "新牌整图",
    dir: "./m_cards",
    spriteSheet: {
      src: "./m_cards_sprite.svg",
      columns: 13,
      rows: 5,
    },
  },
];
