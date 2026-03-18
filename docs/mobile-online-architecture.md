# 五人找朋友 Mobile、多端与联机技术设计

这份文档用于说明当前项目从 `HTML 单机原型` 走向 `多端正式客户端 + 联机服务端` 的目标技术架构。  
从 `2026-03-17` 起，技术主线正式调整为：

- 短期继续使用当前 `HTML / Capacitor` 版本作为过渡期手机 App。
- 长期正式客户端主线切换为 `Cocos Creator`。
- 长期保留一个无服务器依赖的 `HTML Legacy` 单机版。
- 联机版统一采用 `服务端权威判定`。

配套产品目标见 [mobile-app-product-requirements.md](mobile-app-product-requirements.md)。  
分阶段排期见 [mobile-online-roadmap.md](mobile-online-roadmap.md)。

## 1. 设计原则

- 优先复用当前共享规则、AI、回放与状态机，不重写玩法核心。
- 明确区分：
  - `HTML Legacy`
  - `HTML / Capacitor` 过渡线
  - `Cocos Mainline`
  - `Referee Server`
- 长期正式客户端能力优先落在 `Cocos Mainline`，而不是继续把旧 `HTML` 牌桌扩成唯一主线。
- 单机与联机尽量共用同一套操作语义、日志结构、快照结构和结果结构。
- 联机阶段必须避免客户端互信，合法性判定与状态推进必须在服务端完成。

## 2. 当前代码基础判断

当前仓库已经具备 3 个对主线切换和联机都很有价值的基础：

- `src/shared/` 中已经沉淀了共享玩法、AI 与部分 UI 辅助逻辑。
- `src/platform/mobile.js` 已经说明项目存在平台隔离入口。
- `tests/support/headless-game-context.js` 已经能在 Node 环境加载共享逻辑做同步回归。

这意味着：

- 当前 `HTML / Capacitor` 线还可以继续承接过渡期 App 交付。
- 共享规则层有机会进一步抽成 `game-core`，被 `HTML Legacy`、`Cocos Mainline` 和未来服务端共同复用。
- 现有 headless 回归可演进成联机裁判层的回归测试基线。

## 3. 已确认的目标架构

### 3.1 `HTML Legacy`

职责：

- 静态部署。
- 单机离线运行。
- 规则验证。
- QA、复盘、AI 调试。

约束：

- 不依赖服务器。
- 不默认承接未来正式联机主流程。
- 不要求成为所有新功能的首发落点。

### 3.2 `HTML / Capacitor` 过渡线

职责：

- 短期 `iOS / Android` 可发布版本。
- 验证手机端真机体验、存储、复盘和基础商业化链路。

约束：

- 继续沿用当前 `Capacitor` 壳与 WebView 渲染。
- 它是过渡线，不是长期正式客户端主线。
- 后续重资源的新牌桌体验不再默认落到这条线上。

### 3.3 `Cocos Mainline`

职责：

- 未来唯一正式客户端主线。
- 覆盖：
  - `H5`
  - `iOS`
  - `Android`
  - `小游戏`
  - `PC desktop`

约束：

- 正式联机能力优先落在这条线上。
- 正式品牌、动画、资源体系、平台适配优先落在这条线上。
- 长期正式网页版应以 `Cocos H5` 为准；旧 `HTML Legacy` 保留但不再承担正式主战场角色。

### 3.4 `Referee Server`

职责：

- 房间。
- WebSocket。
- 服务端权威裁判。
- AI 补位。
- 重连。
- 回放与风控。

约束：

- 离线单机版不依赖它。
- 所有正式联机客户端统一接入它。

## 4. 推荐代码分层

### 4.1 `game-core`

只保留纯逻辑：

- 状态机。
- 规则合法性。
- 牌型识别。
- AI 决策。
- 结果结算。
- 回放种子与开局码。
- 日志事件结构。

要求：

- 不直接依赖 DOM。
- 不直接依赖浏览器存储。
- 不直接依赖 `Capacitor` 或 `Cocos` API。

### 4.2 `client-adapter`

不同端各自实现：

- 渲染。
- 输入。
- 动画。
- 平台 UI。
- 本地能力桥接。

当前会存在两套：

- `HTML Legacy / HTML-Capacitor adapter`
- `Cocos adapter`

### 4.3 `platform-services`

平台差异能力：

- 本地存储。
- 剪贴板。
- 崩溃监控。
- 埋点。
- 广告。
- 账号 SDK。
- 分享与推送。

### 4.4 `referee-server`

联机服务端能力：

- 登录与账号。
- 房间状态机。
- 服务端权威裁判。
- 重连与托管。
- 回放归档。

## 5. 短期过渡架构

### 5.1 当前推荐实现

短期推荐方案仍是：

- `Capacitor + 当前 Web 前端`

原因：

- 当前项目是原生 `HTML / CSS / JS` 结构，短期迁移成本最低。
- 现有 `Capacitor` 壳、原生存储和打包流程已具备继续迭代价值。
- 可以先解决真机体验与 App 化问题，同时为 `Cocos Mainline` 抽核心。

### 5.2 当前工程约定继续保留

- App 名称：`找朋友升级`
- App ID：`com.nolanli.cards`
- `Capacitor` 配置放在仓库根目录
- `webDir` 固定为 `dist/app`
- `dist/app/index.html` 继续由 `index-app.html` 生成

### 5.3 短期过渡线的工作重点

- 真机性能和稳定性优化。
- 原生存储与复盘闭环。
- App 专用页面与安全区收口。
- 把共享逻辑进一步抽出 `game-core`。

## 6. 长期正式客户端架构

### 6.1 为什么切到 `Cocos Creator`

- 你的长期目标包含：
  - 手机版
  - 小程序版
  - 正式网页版
  - PC desktop 版
- 这类目标更适合由一条真正的游戏客户端主线统一承接。
- `Cocos` 更适合处理：
  - 2D 牌桌渲染
  - 多端分辨率
  - 动画
  - 资源加载
  - 小游戏与桌面端输出

### 6.2 `Cocos Mainline` 推荐层次

#### Scene / Screen 层

- 开始页。
- 单机牌桌。
- 联机房间。
- 结果页。
- 设置页。

#### Presenter / Adapter 层

- 把 `GameSnapshot` 转成 `Cocos` 节点树。
- 把用户输入转成 `GameCommand`。
- 只负责界面和输入，不直接重写规则判断。

#### `game-core` 接入层

- 调用纯玩法接口推进状态。
- 读取日志、结果、阶段和 AI 输出。
- 与 `Referee Server` 或本地单机上下文对接。

#### Platform Bridge 层

- 本地存储。
- 崩溃监控。
- 埋点。
- 广告。
- 平台账号和分享。

## 7. 从现有共享代码迁移到 `game-core` 的建议

### 7.1 可优先抽离

- `rules.js`
- `ai-beginner.js`
- `ai-candidates.js`
- `ai-evaluate.js`
- `ai-intermediate.js`
- `ai-objectives.js`
- `ai-shared.js`
- `ai-simulate.js`
- `ai.js`
- 回放种子、开局码、结果结算里不依赖 DOM 的部分

### 7.2 需要继续拆纯

- `game.js`
- `config.js`

原因：

- 这两层同时混有：
  - 状态推进
  - 计时器
  - 渲染触发
  - 浏览器存储
  - 原生桥接

### 7.3 应视为端适配层

- `ui.js`
- `main.js`
- `layout.js`
- 当前 `index*.html` 里的壳层脚本

这些逻辑不应直接迁入未来的 `game-core`。

## 8. 单机与联机共用逻辑的拆分建议

### 8.1 三端共用

- 规则判定。
- 牌型识别。
- 结算逻辑。
- 日志结构。
- AI 行为。
- 回放种子与开局码。

### 8.2 客户端隔离

- DOM 与浏览器渲染。
- `Cocos` 节点渲染。
- 浏览器存储访问。
- 原生桥接与平台 SDK。
- 动画与倒计时表现。

### 8.3 服务端隔离

- 房间。
- 账号。
- WebSocket。
- 权威裁判。
- 回放归档。

## 9. 联机推荐总体架构

### 9.1 总体原则

多人在线必须使用 `服务端权威判定`。

原因：

- 这套游戏规则复杂，包含亮主、反主、同门跟牌、甩牌、扣底、叫朋友第几张等多层约束。
- 如果把合法性判定放在客户端，本地改包、断网回放、时序竞态都很容易出错。
- 未来如果接排位、举报和回放，没有服务端权威日志会很难追溯。

### 9.2 推荐服务拆分

#### API / Gateway

- 登录。
- 账号。
- 云存档。
- 建房。
- 匹配。
- 战绩查询。

#### Realtime Gateway

- WebSocket 长连接。
- 房间广播。
- 心跳。
- 重连恢复。

#### Match Service

- 房间状态机。
- 座位管理。
- 开局准备。
- AI 补位调度。

#### Game Referee Service

- 接收玩家操作意图。
- 校验是否轮到该玩家。
- 用共享规则层判定是否合法。
- 推进状态机。
- 生成标准事件日志。
- 广播最新局面。

#### Analytics / LiveOps

- 行为埋点。
- 广告表现。
- 活动配置。
- 用户分群。

## 10. 客户端通信建议

- 协议：`WebSocket`
- 事件格式：明确区分 `command / event / snapshot / ack / error`
- 客户端只上报“意图”，例如：
  - `declare_trump`
  - `counter_declare`
  - `complete_burying`
  - `confirm_friend_target`
  - `play_cards`
  - `toggle_auto_manage`

## 11. 服务端语言与基础设施

### 11.1 服务端语言

优先建议：

- `Node.js / TypeScript`

原因：

- 当前共享规则层就是 `JS`。
- 最容易把可复用的合法性判断逐步抽到服务端共用模块。
- 现有 headless 测试与脚本也更容易接入。

### 11.2 存储与基础设施

- `PostgreSQL`：账号、战绩、房间元数据、配置。
- `Redis`：房间在线状态、倒计时、快速广播缓存。
- 对象存储：回放与长日志归档。

## 12. 回放与日志架构

### 12.1 为什么要优先建设

- 这类牌局解释成本高，用户经常会问“为什么这手不合法”“为什么这里扣底成立”。
- 回放是客服、风控、AI 调优、玩家复盘的共同基础。

### 12.2 推荐日志结构

- `match_created`
- `seat_joined`
- `deal_started`
- `trump_declared`
- `counter_declared`
- `bottom_revealed`
- `bottom_buried`
- `friend_target_confirmed`
- `cards_played`
- `trick_resolved`
- `round_finished`
- `match_finished`

每条事件建议都保留：

- `eventId`
- `matchId`
- `actorId`
- `timestamp`
- `phase`
- `payload`
- `snapshotVersion`

### 12.3 回放展示能力

- `HTML Legacy`：继续保留文本日志、复盘种子和开局码输入能力。
- `Cocos Mainline`：逐步升级到正式逐手回放与观战展示。
- 服务端：负责标准事件流与回放归档。

## 13. 掉线、重连与托管

### 13.1 基本原则

- 联机阶段必须允许掉线重连。
- 重连失败或超时后，自动转托管。
- 托管行为沿用现有 AI 难度设定，但联机房间内需要统一托管规则。

### 13.2 重连所需能力

- 客户端保存最近 `matchId / userId / reconnectToken`。
- 服务端保存最近房间快照与待确认事件序号。
- 客户端重连后先拉取完整快照，再补事件差量。

### 13.3 托管边界

- 短暂断线可保持座位。
- 超时后自动 AI 托管。
- 恢复连接后允许从下一次本方行动重新接管。
- 单机里的手动托管继续沿用 `关闭 / 本局托管 / 跨局托管` 三态。
- 联机里的“超时转托管”应等价于“本局托管”，不能自动升级成跨局持续托管。

## 14. 广告与隐私合规架构

### 14.1 过渡线原则

- 当前 `HTML / Capacitor` 过渡版可继续承接基础广告验证。
- 广告不能进入核心规则层。
- 广告事件要和对局日志、留存指标分开埋点。

### 14.2 正式主线原则

- 后续正式商业化能力优先落在 `Cocos Mainline`。
- 各平台广告 SDK、同意流程和隐私能力都应通过平台桥接层接入，而不是直接写进规则层。

## 15. 可观测性

### 15.1 客户端

- 启动耗时。
- 首局完成率。
- 真机卡顿。
- JS 或运行时错误。
- 广告加载成功率。

### 15.2 服务端

- 活跃房间数。
- WebSocket 在线数。
- 对局平均时长。
- 重连成功率。
- AI 补位占比。
- 联机完成率。

## 16. 近期技术优先级

1. 维持当前 `HTML / Capacitor` 过渡线可继续发版。
2. 抽离 `game-core`。
3. 建立 `Cocos Mainline` 单机样机。
4. 做联机协议和 `Referee Server`。
5. 再扩小游戏与桌面端。

后续所有移动、多端和联机实现，都应围绕下面 4 条主线推进：

- `HTML Legacy` 长期保留但边界收敛。
- 过渡期 `HTML / Capacitor` 只做必要迭代。
- `Cocos Mainline` 成为正式客户端唯一主线。
- `Referee Server` 成为正式联机唯一权威来源。
