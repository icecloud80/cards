# 找朋友升级 App Icon 设计说明

这份文档记录 `找朋友升级` iOS / Android App Icon 的视觉目标、构图元素、平台输出和维护约束，作为产品、设计、客户端与提审素材的统一参照。

## 1. 设计目标

- 让图标一眼看出这是 `扑克牌 + 升级` 题材，而不是通用棋牌占位图。
- 在 iOS 与 Android 主屏上保持同一套暖白浅金品牌气质，同时兼容 Android adaptive icon 的裁切限制。
- 小尺寸下依然能看清主元素，避免把“完整牌桌 UI”硬塞进图标导致发糊。

## 2. 视觉方向

### 2.1 主题关键词

- `暖白浅金`：让桌面图标更亮、更轻，也更适合和 iOS / Android 常见浅色壁纸共存。
- `叠牌`：突出扑克牌身份，不依赖文字也能建立游戏类型识别。
- `升级徽章`：前景主牌中心使用向上箭头徽章，表达“升级”的核心动作。
- `五人找朋友`：徽章下方保留 5 颗点阵，作为“五人 / 找朋友”的轻量暗示。

### 2.2 构图说明

- 背景使用暖白到浅金米色的纵向渐变，并叠加轻微菱形纹理，保留一点牌背与徽章切面的精致感。
- 主体由 `1 张深蓝牌背 + 1 张象牙色前景牌` 交错叠放组成。
- 前景牌左上角保留红色菱形角标，右下角保留黑色花色角标，继续强化“扑克牌”识别。
- 中心升级徽章使用 `红宝石底 + 金色向上箭头 + 5 颗金点`，避免直接写字导致平台字体差异。

## 3. 平台资源输出

### 3.1 iOS

- 正式图标文件：`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- 输出尺寸：`1024x1024`
- 约束：
  - 保持完整方形画布，不主动做透明圆角。
  - 由系统负责最终图标圆角裁切。

### 3.2 Android

- legacy icon：
  - `android/app/src/main/res/mipmap-*/ic_launcher.png`
  - `android/app/src/main/res/mipmap-*/ic_launcher_round.png`
- adaptive foreground：
  - `android/app/src/main/res/mipmap-*/ic_launcher_foreground.png`
- adaptive background：
  - `android/app/src/main/res/drawable/ic_launcher_background.xml`
- 约束：
  - adaptive foreground 只放主体，不塞整张红底。
  - adaptive background 必须继续保持暖白浅金品牌渐变，避免回退成默认白底。

## 4. 生成与维护

- 图标生成脚本：`scripts/generate-app-icons.py`
- 一键生成命令：`npm run app:icons`
- 仓库预览图：`images/icons/app_icon_preview.png`
- 回归测试：`tests/unit/check-app-icon-assets.js`

维护要求：

- 如果调整图标配色、构图或徽章元素，必须重新执行 `npm run app:icons`，不要手改单个密度目录。
- 如果 Android adaptive icon 改了前景或背景引用，需同步更新 `ic_launcher.xml / ic_launcher_round.xml` 和回归测试。
- 若未来需要补商店宣传图、开屏或首页品牌插画，应优先沿用这套 `暖白浅金 + 叠牌 + 升级徽章` 的主品牌语言，避免 App 首页和桌面图标分裂成两套风格。
