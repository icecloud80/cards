window.APP_PLATFORM = "pc";
window.CARD_ASSET_DIR = "./cards";
window.DEFAULT_CARD_FACE_KEY = "sprite";
window.CARD_FACE_OPTIONS = [
  { key: "classic", label: "经典", dir: "./cards" },
  { key: "modern", label: "新牌面", dir: "./m_cards" },
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
];
