# 五人找朋友联机服务端接口与房间状态机草案

这份文档把未来多人在线的 `服务端接口`、`房间状态机`、`对局状态机` 与 `事件协议` 整理成第一版草案，目标是为好友房、AI 补位、快速匹配和后续排位打同一套服务端基础。

配套文档：

- 总体技术设计见 [mobile-online-architecture.md](mobile-online-architecture.md)。
- 阶段路线图见 [mobile-online-roadmap.md](mobile-online-roadmap.md)。
- 首发任务拆解见 [mobile-app-launch-task-breakdown.md](mobile-app-launch-task-breakdown.md)。

## 1. 文档目标

- 明确联机阶段客户端与服务端的职责边界。
- 给出第一版可执行的 HTTP / WebSocket 接口草案。
- 给出房间层与对局层的状态机定义。
- 明确 AI 补位、掉线重连、托管、超时与回放应如何落位。

## 2. 设计原则

- 服务端权威裁判，客户端只发“操作意图”，不直接改最终对局状态。
- 房间状态机与对局状态机分层，避免“房间是否开局”和“当前牌局走到哪一阶段”混在一起。
- 所有客户端操作都必须可幂等重放，便于弱网、重连与回放。
- 所有关键事件都要形成标准日志，供观战、复盘、客服和风控复用。
- 单机和联机尽量统一操作语义，例如 `declare_trump / complete_burying / play_cards` 这些动作名不应分叉。

## 3. 服务边界

### 3.1 客户端负责

- 页面渲染。
- 本地手势与点击交互。
- 按当前快照展示倒计时、轮到谁、按钮态。
- 发起 HTTP 请求与 WebSocket 命令。
- 缓存最近一次房间快照与重连信息。

### 3.2 服务端负责

- 账号鉴权。
- 房间创建、加入、离开、座位管理。
- 匹配与 AI 补位。
- 当前局面权威快照。
- 出牌合法性校验。
- 阶段切换。
- 超时托管。
- 重连恢复。
- 标准事件日志与回放。

## 4. 推荐服务拆分

### 4.1 API Gateway

- 登录。
- 获取房间列表。
- 建房。
- 战绩与回放查询。

### 4.2 Realtime Gateway

- WebSocket 连接。
- 订阅房间。
- 广播事件。
- 心跳。
- 重连恢复。

### 4.3 Room Service

- 管理房间与座位。
- 管理准备状态。
- 管理房主权限。
- 管理房间配置。

### 4.4 Match / Referee Service

- 驱动对局状态机。
- 校验命令合法性。
- 推进共享规则层。
- 写入事件流与快照。

## 5. 基础数据模型草案

### 5.1 room

- `roomId`
- `roomType`
  - `friend`
  - `matchmaking`
- `status`
  - 房间层状态。
- `ownerUserId`
- `seatCount`
- `allowAiFill`
- `allowMidJoin`
- `createdAt`
- `updatedAt`

### 5.2 room_seat

- `roomId`
- `seatIndex`
- `userId`
- `seatStatus`
  - `empty`
  - `occupied`
  - `reserved`
  - `ai`
- `ready`
- `autoManagedMode`
  - `off`
  - `this_round`
  - `persistent`

### 5.3 match_session

- `matchId`
- `roomId`
- `status`
  - 对局层状态。
- `phase`
  - 牌局阶段。
- `snapshotVersion`
- `currentActorSeat`
- `deadlineAt`
- `bankerSeat`
- `leaderSeat`
- `winnerSeat`
- `createdAt`
- `updatedAt`

### 5.4 match_event

- `eventId`
- `matchId`
- `eventType`
- `actorSeat`
- `snapshotVersion`
- `payload`
- `createdAt`

### 5.5 reconnect_session

- `userId`
- `roomId`
- `matchId`
- `reconnectToken`
- `expiresAt`

## 6. 房间层状态机

### 6.1 房间状态定义

- `forming`
  - 房间已创建，等待坐满或准备。
- `ready_check`
  - 人员已到位，等待所有真人确认开始。
- `starting`
  - 正在创建新局与分配座位。
- `in_game`
  - 已进入对局。
- `settling`
  - 单局结束，等待是否继续下一局。
- `closed`
  - 房间解散或超时关闭。

### 6.2 房间层状态转移

#### `forming -> ready_check`

触发条件：

- 房间已满足最低开局人数。
- 房主点击开始准备。

#### `ready_check -> starting`

触发条件：

- 所有真人玩家 `ready = true`。
- 或房主选择“空位由 AI 补齐并开局”。

#### `starting -> in_game`

触发条件：

- `match_session` 创建成功。
- 初始快照广播成功。

#### `in_game -> settling`

触发条件：

- 当前一局完整结算结束。

#### `settling -> ready_check`

触发条件：

- 房主选择再来一局。
- 真人玩家进入下一局准备阶段。

#### `forming / ready_check / settling -> closed`

触发条件：

- 房主解散房间。
- 房间长时间无人活跃。
- 服务端清理超时房间。

### 6.3 房间层关键规则

- 朋友房默认不允许中途加入已经开打的真人座位。
- 进入 `in_game` 后，真人掉线只允许重连，不允许他人替换账号接管。
- 空位 AI 补位只发生在开局前，不能中途把真人强替换成其他真人。

## 7. 对局层状态机

### 7.1 对局状态定义

- `bootstrapping`
  - 生成牌堆、座位初始化、准备首个快照。
- `running`
  - 正常进行中。
- `result_pending`
  - 已出完牌，正在结算结果与等级变化。
- `finished`
  - 当前局结束，结果已固化。
- `aborted`
  - 服务端异常中止，仅用于极端故障。

### 7.2 牌局 phase 定义

建议沿用当前共享规则层语义，并在联机层显式化：

- `ready`
- `dealing`
- `countering`
- `burying`
- `calling_friend`
- `playing`
- `result`

说明：

- `ready` 只存在于对局快照初始化阶段，不等同于房间层 `ready_check`。
- `playing` 内部仍会继续用共享状态区分当前轮、首家、当前待行动者、末局与扣底判定。

### 7.3 对局 phase 转移

#### `ready -> dealing`

触发条件：

- 房间进入开局。
- 初始牌堆与发牌座次确定。

#### `dealing -> countering`

触发条件：

- 发牌结束。
- 出现亮主结果并进入反主流程。

#### `dealing -> burying`

触发条件：

- 无需继续反主。
- 打家已确定并拿到底牌。

#### `countering -> burying`

触发条件：

- 反主结束。
- 主牌最终确定。

#### `burying -> calling_friend`

触发条件：

- 打家完成扣底。

#### `calling_friend -> playing`

触发条件：

- 打家确认叫朋友目标。

#### `playing -> result`

触发条件：

- 全部手牌打完。
- 扣底 / 保底 / 级别变化计算完成。

#### `result -> finished`

触发条件：

- 结果快照写入完成。
- 客户端已收到最终结果事件。

## 8. 超时与托管规则

### 8.1 超时策略

每个可操作阶段都应有服务端倒计时：

- `dealing`
  - 亮主 / 是否亮主。
- `countering`
  - 反主 / 不反主。
- `burying`
  - 完成扣底。
- `calling_friend`
  - 确认目标牌。
- `playing`
  - 出牌。

### 8.2 超时处理

- 首次短超时：给客户端警告事件。
- 正式超时：当前玩家进入服务端托管。
- 真人恢复在线后：
  - 若 `autoManagedMode = this_round`，下一次轮到本人时允许解除。
  - 若 `autoManagedMode = persistent`，需手动关闭。

### 8.3 托管模式

- `off`
- `this_round`
- `persistent`

### 8.4 托管来源

- 用户主动开启。
- 用户掉线超时。
- 用户操作超时。

## 9. HTTP 接口草案

### 9.1 鉴权

#### `POST /v1/auth/login/apple`

作用：

- Apple 登录换取应用侧 access token。

#### `POST /v1/auth/login/google`

作用：

- Google 登录换取应用侧 access token。

#### `POST /v1/auth/guest`

作用：

- 创建游客身份。

### 9.2 房间

#### `POST /v1/rooms`

作用：

- 创建朋友房。

请求体示例：

```json
{
  "roomType": "friend",
  "seatCount": 5,
  "allowAiFill": true
}
```

响应体示例：

```json
{
  "roomId": "room_123",
  "status": "forming",
  "inviteCode": "8Q4T2"
}
```

#### `POST /v1/rooms/{roomId}/join`

作用：

- 加入指定房间。

#### `POST /v1/rooms/join-by-code`

作用：

- 通过邀请码加入房间。

#### `POST /v1/rooms/{roomId}/leave`

作用：

- 离开未开局房间。

#### `POST /v1/rooms/{roomId}/ready`

作用：

- 设置当前玩家 ready 状态。

#### `POST /v1/rooms/{roomId}/start`

作用：

- 房主发起开局。

#### `POST /v1/rooms/{roomId}/close`

作用：

- 房主解散房间。

#### `GET /v1/rooms/{roomId}`

作用：

- 拉取房间详情与最近快照。

### 9.3 对局与回放

#### `GET /v1/matches/{matchId}`

作用：

- 获取当前对局快照。

#### `GET /v1/matches/{matchId}/events`

作用：

- 按 `afterEventId` 分页拉取事件流。

#### `GET /v1/matches/{matchId}/replay`

作用：

- 获取回放所需的完整事件与最终摘要。

## 10. WebSocket 协议草案

### 10.1 连接

推荐连接地址：

- `wss://.../v1/realtime`

鉴权方式：

- `Authorization: Bearer <token>`

### 10.2 客户端上行 command

统一格式：

```json
{
  "type": "command",
  "commandId": "cmd_123",
  "roomId": "room_123",
  "matchId": "match_456",
  "expectedVersion": 18,
  "name": "play_cards",
  "payload": {}
}
```

### 10.3 服务端下行消息类型

- `ack`
- `error`
- `event`
- `snapshot`
- `heartbeat`
- `warning`

### 10.4 命令列表

#### 房间命令

- `seat_ready`
- `seat_unready`
- `start_match`
- `leave_room`
- `close_room`

#### 对局命令

- `declare_trump`
- `pass_declare`
- `counter_declare`
- `pass_counter`
- `complete_burying`
- `confirm_friend_target`
- `play_cards`
- `toggle_auto_manage`
- `request_reconnect_snapshot`

## 11. 命令 payload 草案

### 11.1 `declare_trump`

```json
{
  "declaration": {
    "type": "suit_level_pair",
    "count": 2,
    "suit": "hearts",
    "rank": "4"
  }
}
```

### 11.2 `counter_declare`

```json
{
  "declaration": {
    "type": "joker_pair",
    "count": 2,
    "rank": "small_joker"
  }
}
```

### 11.3 `complete_burying`

```json
{
  "cardIds": ["c1", "c2", "c3", "c4", "c5", "c6", "c7"]
}
```

### 11.4 `confirm_friend_target`

```json
{
  "target": {
    "suit": "spades",
    "rank": "A",
    "occurrence": 2
  }
}
```

### 11.5 `play_cards`

```json
{
  "cardIds": ["c18", "c21"]
}
```

### 11.6 `toggle_auto_manage`

```json
{
  "mode": "this_round"
}
```

## 12. 服务端事件草案

### 12.1 房间事件

- `room_created`
- `room_joined`
- `room_left`
- `room_closed`
- `seat_updated`
- `room_ready_check_started`

### 12.2 对局事件

- `match_created`
- `deal_started`
- `trump_declared`
- `counter_declared`
- `counter_passed`
- `bottom_received`
- `bottom_buried`
- `friend_target_confirmed`
- `turn_started`
- `cards_played`
- `trick_resolved`
- `auto_manage_changed`
- `match_result`

### 12.3 系统事件

- `countdown_warning`
- `player_disconnected`
- `player_reconnected`
- `seat_auto_managed`
- `snapshot_resynced`

## 13. 快照结构草案

服务端快照建议至少包含：

- `room`
- `seats`
- `match`
- `phase`
- `snapshotVersion`
- `currentActorSeat`
- `deadlineAt`
- `visibleTableState`
- `myHand`
- `myAvailableActions`
- `resultSummary`

注意：

- 不属于当前用户可见的信息绝不能进快照。
- 比如其他玩家暗手、底牌原始内容、未公开的身份推断，都不能泄露给非授权客户端。

## 14. 幂等与版本控制

### 14.1 `commandId`

- 每次客户端上行必须带唯一 `commandId`。
- 服务端应缓存最近一段时间内已处理命令，避免弱网重发造成重复执行。

### 14.2 `expectedVersion`

- 客户端发命令时带上自己认知的 `snapshotVersion`。
- 如果服务端版本已前进：
  - 可直接拒绝并回 `stale_snapshot`。
  - 或返回最新快照让客户端重放 UI。

### 14.3 顺序保证

- 同一房间内所有权威事件都应有严格单调递增版本号。
- 客户端按版本消费，不允许本地猜测跳过。

## 15. 错误码草案

- `unauthorized`
- `room_not_found`
- `room_closed`
- `seat_not_owned`
- `not_room_owner`
- `not_ready`
- `match_not_found`
- `not_your_turn`
- `invalid_phase`
- `invalid_payload`
- `illegal_move`
- `stale_snapshot`
- `reconnect_expired`
- `server_busy`

## 16. 重连流程草案

### 16.1 断线后客户端本地保存

- `roomId`
- `matchId`
- `reconnectToken`
- `lastSnapshotVersion`

### 16.2 重连步骤

1. 客户端重新建立 WebSocket。
2. 发送 `request_reconnect_snapshot`。
3. 服务端返回最新完整快照。
4. 若客户端缺少事件，可继续拉 `/events` 补差量。

### 16.3 重连失败处理

- 如果重连 token 过期：
  - 房间仍保留，但该真人席位可能已被托管。
- 如果房间已结束：
  - 直接下发最终结果摘要。

## 17. AI 补位草案

### 17.1 开局前补位

- 好友房中允许房主在 `ready_check` 时选择剩余空位由 AI 填满。

### 17.2 开局后托管

- 已入座真人中途掉线，不替换 userId。
- 只切到同座位 AI 托管。

### 17.3 AI 补位边界

- `AI 补位` 和 `真人掉线托管` 是两类不同概念。
- 前者影响座位归属，后者不影响归属。

## 18. 回放与审计

### 18.1 最小回放要求

- 可按事件顺序重放所有公开动作。
- 可展示最终结果摘要。
- 可定位任一 `snapshotVersion`。

### 18.2 审计要求

- 所有 `illegal_move` 都应记录。
- 所有超时托管切换都应记录。
- 所有重连、断线、恢复都应记录。

## 19. 第一阶段实现范围建议

好友房第一阶段建议只实现：

- `POST /rooms`
- `POST /rooms/join-by-code`
- `POST /rooms/{roomId}/ready`
- `POST /rooms/{roomId}/start`
- `GET /rooms/{roomId}`
- WebSocket command:
  - `declare_trump`
  - `counter_declare`
  - `complete_burying`
  - `confirm_friend_target`
  - `play_cards`
  - `toggle_auto_manage`

暂不急着实现：

- 公开房间大厅。
- 复杂聊天。
- 观战。
- 排位分结算。

## 20. 后续落地建议

下一步最适合继续补的不是直接写排位，而是：

1. 把共享规则层再往“纯函数裁判层”推进一段。
2. 把标准 `event payload` 定义成单独 schema 文档。
3. 把 `snapshot` 字段白名单固定下来，先堵住信息泄露风险。
4. 再开始写好友房最小服务端原型。

这份草案后续如果进入真正开发，需要再继续拆成：

- OpenAPI 草案。
- WebSocket schema 草案。
- 房间与事件表结构设计。
- 超时托管策略参数表。
