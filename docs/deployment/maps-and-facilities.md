# 底图与补充设施部署

2026-10-18。此页说明部署接线；字段、来源和失败语义统一见 [API 契约 §4.4](../authority/API_CONTRACTS.md)，范围与选型见 [技术文档](../authority/AccessLoop_技术文档_v1.0.md)。本次实际验证见 [阶段验收](../acceptance/d-map-cloud.md)。

## 地图入口与配置

`/route`（`/live`兼容重定向）、`/preview` 和复用共享 MapView 的报告选点使用锁定 Leaflet 1.9.4 的真实瓦片地图，支持缩放、拖动、标记、路线、公共与个人避让、预览和范围内选点。`/preview` 仍是明确标记的 fixture；根路径当前进入真实三Tab的R1；Stitch Design Demo静态稿仅保留独立参考入口。新底图不代表静态稿或校园通道已经通过最终验收。

默认使用 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`。无需新密钥；显示链接到 OSM copyright 的署名及 Leaflet 署名。依照 [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) 保留正常浏览器缓存和 referrer，不做批量下载、离线预取或扫描。正式流量较大时应配置合适的瓦片服务，并遵循其服务条款。

`.env.example` 提供三项公开配置：`MAP_TILE_URL`、`MAP_ATTRIBUTION`、`MAP_ATTRIBUTION_URL`。自定义 URL 必须 HTTPS XYZ 模板，另两项填写对应服务的纯文本署名和 HTTPS 版权链接。禁止 userinfo、fragment 和额外模板占位符。仅这三项传入客户端，cloud/ORS/数据库等秘密不会随地图配置下发。公开瓦片 URL 中如含 key，该 key 会被浏览器看到，须使用供应商允许公开且受域名限制的凭据。修改 MAP 配置后重新构建并启动；当前静态页面在构建时读取配置。

瓦片加载失败会显示告警，仍可切换列表和使用坐标选点。告警跟踪各失败瓦片，其他瓦片成功不会掩盖未恢复的失败。重置按钮回到配置区域。键盘用户可使用地图控件及设施列表/坐标表单。

## accessibility.cloud 接线

秘密放本机忽略文件 `/Users/coreyli/UNSW/AccessLoop/.env`，D 工作树运行读取其忽略的 `.env.local`；目标部署使用服务端秘密注入。不要提交 Token，或将 Token 放进 NEXT_PUBLIC / MAP 配置。

- `ACCESSIBILITY_CLOUD_APP_TOKEN`：应用 App Token（本机已配置）。
- `ACCESSIBILITY_CLOUD_SOURCE_IDS`：JSON ID 数组；本次选择两个公开且非草稿的数据集。
- `ACCESSIBILITY_CLOUD_LICENSE_IDS`：经确认允许使用的许可 ID 数组，非空才能启用补充源。

当前已验证选择：

| 数据集 | source ID | license ID | 许可 |
| --- | --- | --- | --- |
| Australian National Public Toilet Map | `BBQwnkLokb9xADdNK` | `HX7tNmswKFQxMtBji` | [Open Database License](http://opendatacommons.org/licenses/odbl/1-0/) |
| Wheelmap OSM Mirror | `LiBTS67TjmBcXdEmX` | `R6Lneq4ZL2uMausHZ` | [ODbL v1.0](http://opendatacommons.org/licenses/odbl/) |

来源/许可由真实 source 和 related license 元数据核对。设施列表与地图下方显示数据集和许可；详情保留来源与原始轮椅事实。未命名设施显示稳定回退名；缺失或冲突的无障碍事实保持 unknown。设施可进入不证明沿途可通行，也不作为障碍、预设通道或实测区域写入业务表。

服务端固定访问 [官方 v2 JSON API](https://github.com/sozialhelden/accessibility-cloud/blob/main/app/docs/json-api.md) 的 CDN 地址。按覆盖 bbox 的单个 XYZ tile 查询，再过滤到区域内。每次尝试只发一个请求，经 C 的 `poi` 持久预算；有限重试再次预留。缓存24小时，按 Token 范围、来源/许可选择、区域和配置版本隔离。API 原始响应、Token、私人行程不写进公共证据。前端设施成功快照最多每分钟刷新一次，配置变更立即刷新；公共报告/有效集保持5秒轮询和自然到期判断。

地图瓦片请求是浏览器公开底图流量；cloud 设施请求走应用服务端。ORS/Geocoding/Vision 继续各自预算，不改为 cloud 计量。调用、错误、等待、缓存命中均来自 C 的脱敏事件，不能将预算余额当统计。

## 故障与验证边界

cloud 是补充来源，现有 Overpass/HeiGIT 来源仍保留。一个来源失败时展示成功来源，并明确显示不可用状态及非完整库存提示；全部配置来源失败返回错误。没有 Token/许可选择时标记未接入；选择 JSON 格式错误则 places 请求失败，不伪装为上游临时故障，也不拖累路线/搜索服务初始化。未获许可或缺元数据的记录不展示，并标记结果不完整。

本次真实 Kensington bbox 返回15条设施（11条 Wheelmap、4条厕所地图），没有触及 cloud 数量上限；主 Overpass 在实际联调仍失败，不能称完整设施覆盖。cloud CDN本身可能有缓存延迟，数据还可能陈旧。现场通道核验、最终真实路线/搜索/公共管理浏览器闭环和 Zenith 部署仍另行验收。

## 保留的本机验收入口

`http://localhost:3000/live` 是此前保留服务，当前A整合验收使用 `http://localhost:3121/route`，两者均指向已有的 `unsw-kensington-facilities-demo` 区域（独立于未初始化的 region-unsw），APP_MODE=demo、isDemo=true。初始化仓储要求至少一条预设通道，因此保留名为“Synthetic demo passage — not field validated”的单条结构演示通道（不是实测校园通道）；没有种入真实障碍或声称现场可通行。原未初始化的region-unsw不修改。cloud设施实时读取并正常缓存/计量；该区域仅用于界面与设施验收。
