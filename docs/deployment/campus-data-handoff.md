# UNSW 小区域候选数据交接

记录日期：2026-10-17。工作包：D；分支：`codex/d-backend-routing`。

**状态：仅完成可追溯公开来源候选整理，尚未现场勘测、未通过完整ORS基线/避让核验、不可作为生产配置。候选整理时未调用真实ORS；后续连接探针见[真实连接证据](provider-connection-evidence.json)。** 本次不向数据库导入，不接入应用运行时，不用候选替代本包真实联调验收。机器文件为 [campus-candidate.json](campus-candidate.json)，前期调查和现场清单见 [campus-survey.md](campus-survey.md)。

## 内容与边界

- 一个候选调查视窗：`[151.2325,-33.9176,151.2332,-33.9168]`。它只限制本文件离线查看和选点，**不是已批准服务区域 bbox**。
- 两个原始 OSM node 起终点，以及两条 Commerce Courtyard footway 候选，分别保留 5 / 7 个原始顶点；第二条按起点到终点反向排列。
- 视窗内 10 个实际 node POI：2 个厕所、6 个入口、2 个座椅。`amenity=bench` 映射到现有 `rest_area` 分类，不表示现场存在已核验无障碍休息设施。无名点采用受控英文描述和 OSM node ID。
- 20 个选定原始 node 证据及两条 way 证据，保留坐标、对象版本、原更新时间、源 URL、获取时间和原标签；不把 UNSW 建筑质心当作入口。
- 10 个 POI 均缺少 `wheelchair` 和 `toilets:wheelchair`，`rawAccessibility` 两字段均为 null，`accessibility=unknown`。不因厕所、入口或座椅类别推断无障碍。`node/5565631599` 的 `access=private` 原标签和 private 提示保留，不是公众入口推荐。

JSON 顶层明确 `fieldValidated:false`、`orsValidated:false`、`productionReady:false`、`isDemo:true`。全部 `candidate-*` ID 和预设候选中的 `passageVersion:1` 只用于离线引用，**尚未持久化，不能用作有效 PassageRef**。`productionAvoidanceBufferM:null` 表示尚未选定生产缓冲宽度。

## 来源和时间依据

复用已有 [OSM 官方 Map API 有界快照](https://api.openstreetmap.org/api/0.6/map?bbox=151.2315,-33.9188,151.2365,-33.9155)，没有新增网络取数，候选整理时没有调用 ORS / GLM / Geocoding；随后D经C持久预算分别做了一次ORS/Geocoding连接探针，不能替代完整路线验收。原文件 `/private/tmp/accessloop-campus-research/osm-map.xml` 共 776030 bytes，SHA-256：

```text
3a10ba4627a42096a21d716b25d0990d79ece0ae7ecd275aba8a0b48473fd240
```

该散列与原调查记录一致。原文件创建时间为 `2026-10-17T06:33:19.216Z`，修改完成时间为 `2026-10-17T06:33:20.741Z`。未保存 HTTP receipt 时间，故 `fetchedAt` 采用原始文件修改时间重建的本地获取完成时间，JSON 的 `fetchedAtBasis` 已明确标注此限制；这不是 OSM 编辑时间，也不是本次重新请求的时间。

| 对象 | 来源版本与原更新时间 | 处理 |
| --- | --- | --- |
| [起点 node 8597065685 v2](https://api.openstreetmap.org/api/0.6/node/8597065685/2) | 2025-06-12T06:53:52Z | 原始经纬度 |
| [终点 node 8597065684 v1](https://api.openstreetmap.org/api/0.6/node/8597065684/1) | 2021-04-06T00:35:12Z | 原始经纬度 |
| [通道 A way 1100783040 v1](https://api.openstreetmap.org/api/0.6/way/1100783040/1) | 2022-10-04T07:29:41Z | 原始 5 节点顺序 |
| [通道 B way 1100783041 v3](https://api.openstreetmap.org/api/0.6/way/1100783041/3) | 2025-06-12T06:58:52Z | 原始 7 节点逆序展示，源顺序另存 |

每个 POI 的具体 node 版本 URL、坐标、原更新时间和标签见 JSON 的 `sourceNodes`；`places.items[].sourceId` 与其关联。来源中的 `source=survey` 仅是 OSM 贡献者元数据，不表示 AccessLoop 做过现场调查。署名为 **© OpenStreetMap contributors**，按 [OSM 版权与 ODbL](https://www.openstreetmap.org/copyright) 保留来源。

选定的原始坐标和标签已保存在仓库 JSON 内，不要求运行时访问临时文件。完整 XML 仍是临时研究证据；需要完整抽取档案时应另存受控快照，不能假定 `/private/tmp` 永久存在。

## 契约和验证证据

本文件是部署准备数据包装；地点和预设候选内部直接复用 [共享契约](../../src/shared/contracts/region.ts) 的 `PlaceSchema` / `PresetPassageSchema`，坐标和 bbox 复用共享 Schema。生成时调用现有 [normalizeAccessibility](../../src/features/places/server/accessibility.ts)，未另写标签协议或规范化算法。来源扩展元数据与 DTO 分开，不修改 HTTP 契约。

证据对应开发工作树：`baseDevCommit=7d0f552f9b99472c8a61ee7038f28a2539d45abe`；`headCommit=7d0f552f9b99472c8a61ee7038f28a2539d45abe` 加本次三个未提交文件。随后安全同步C0集成基线`5e4867d8b6141aacbc8fc4988f4aa41287bd370a`，D工作树`pnpm check`108通过/0失败/3默认跳过；最终交付head见本阶段PR元数据，不能据本文件推断已发布到运行时。

| 检查 | 实际结果 |
| --- | --- |
| 先写 [候选测试](../../tests/campus-candidate.test.ts)，候选文件不存在时运行 | RED：5 项因缺少离线候选交付而失败，断言错误已观察 |
| `pnpm exec tsx --test tests/campus-candidate.test.ts` | GREEN：5/5 通过；验证状态门、来源、坐标边界、双 LineString、可计算缓冲、地点 DTO 和 unknown 语义 |
| 直接读取 SHA 固定 XML 逐点对照候选 | 20 node 的位置/版本/时间/原标签、2 way 的顺序/版本/时间/原标签、共 12 个 way 顶点全部一致 |
| `pnpm exec eslint tests/campus-candidate.test.ts` | exit 0 |
| `pnpm exec tsc --noEmit --incremental false` | exit 0；未生成构建产物 |
| `pnpm test` | 99/99 通过（含候选 5 项）；这是离线/桩套件，不是供应商实测 |
| 检查 `src` / `scripts` 引用候选文件 | 无运行时引用；仅测试读取候选 |
| 候选整理阶段 build / 部署 / 数据库导入 / 真实供应商调用 | 未执行；随后连接探针见独立证据 |

两条完整折线以当前地理实现离线缓冲 0.5m 和 5m 均可生成合法几何。这仅验证计算兼容性，**不确定生产宽度，也不证明通行或有效绕行**。两条完整通道共享起终点，整条通道缓冲会覆盖这些端点，不能直接把整条 A 当作已选演示障碍。

## 留给现场和真实联调的工作

现场必须确认 courtyard 与周边 `layer=-1` 的实际层级、双通道连接、台阶/路缘、净宽、坡度、路面、开放时段和访问权限，并以日期、照片与实测值留证。演示障碍需选远离起终点的实际中段，校验最小合理缓冲不会同时封住备用通道；未知数值继续 unknown。

后续连接探针已返回ORS HTTP200并通过候选几何检查，但不包含真实个人避让/双会话闭环；JSON的orsValidated=false指完整验证尚未通过。得到现场批准的小区域、固定起终点、通道和缓冲后，由 D/C 走受控区域命令持久化，服务器分配正式稳定 ID/版本，再通过 C 持久预算接入 AccessLoop 后端做真实 ORS 相同起终点/相同限制的基线与避让重算、吸附/边界/无相交检查及双会话隔离。若无法形成合法备选，保留无路线结果，不扩大 bbox 或放宽限制伪造绕行。

当前现场、真实 ORS、C 区域持久化和真实 POI 完整覆盖均未通过，不因本候选和离线测试而解除这些阻塞。

本次候选交付 codeEvidenceCommit：`08f160dad39777e26841c69339114811bd9cda67`；后续记录提交可复用此数据与测试证据。
