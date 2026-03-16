window.APP_PLATFORM = "mobile";
window.CARD_ASSET_DIR = "./m_cards";
window.DEFAULT_CARD_FACE_KEY = "modern";
window.CARD_FACE_OPTIONS = [
  { key: "modern", label: "新牌面", dir: "./m_cards" },
  { key: "classic", label: "经典", dir: "./cards" },
  {
    key: "sprite",
    label: "整图牌面",
    dir: "./m_cards",
    spriteSheet: {
      src: "./poker.png",
      columns: 13,
      rows: 5,
    },
  },
];
