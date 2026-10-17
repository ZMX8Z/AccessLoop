# UNSW Kensington 小区域路线候选与核验清单

记录日期：2026-10-17（Australia/Sydney）。负责人：D。状态：**公开来源调查完成；现场、真实 ORS 和生产演示配置仍未验证**。

本文是部署准备记录，不替代 [PROJECT](../authority/PROJECT.md)、[API 契约](../authority/API_CONTRACTS.md) 或实测交接。以下坐标来自 UNSW 官方 GIS 与 OpenStreetMap 原始对象，未由截图估读，未种入生产数据库。没有将公众足迹标签推断为轮椅可通行。

## 最小候选：Commerce Courtyard 内的双通道

调查选择校园 Library 西侧 Commerce Courtyard 的两条相连 footway，理由是两者共享原始节点、范围小，并存在拓扑上不同的通道。OSM 将所在区域标为 `name=Commerce Courtyard, highway=pedestrian, area=yes, layer=-1`；这是地图标签，不是地面高度实测。[区域原始对象](https://api.openstreetmap.org/api/0.6/way/45559629/9)、[地图对象](https://www.openstreetmap.org/way/45559629)。

| 项目 | 来源坐标 `[longitude, latitude]` | 可追溯来源 | 尚未确定 |
| --- | --- | --- | --- |
| 候选起点 S，北侧相交节点 | `[151.2327362, -33.9169865]` | [OSM node 8597065685 v2](https://api.openstreetmap.org/api/0.6/node/8597065685/2)，修改于 2025-06-12T06:53:52Z | 实地入口、层级、定位/吸附偏差 |
| 候选终点 T，南侧相交节点 | `[151.2330348, -33.9174310]` | [OSM node 8597065684 v1](https://api.openstreetmap.org/api/0.6/node/8597065684/1)，修改于 2021-04-06T00:35:12Z | 实地入口、层级、定位/吸附偏差 |
| 通道 A，对角线 | 下方 5 个原始坐标 | [OSM way 1100783040 v1](https://api.openstreetmap.org/api/0.6/way/1100783040/1)，修改于 2022-10-04T07:29:41Z | 是否存在台阶、坡度、净宽、路缘和当前开放情况 |
| 通道 B，西/南侧边缘 | 下方 7 个原始坐标，按 S→T 反向排列 | [OSM way 1100783041 v3](https://api.openstreetmap.org/api/0.6/way/1100783041/3)，修改于 2025-06-12T06:58:52Z | 同上；是否确实能在同一层绕开 A |

两条 way 的原始标签均只有 `highway=footway`，未提供 `wheelchair`、净宽、数值坡度或路缘高度。**缺失标签保持 unknown**。虽然这两条 way 未标为 `steps`，周边确有 stairs 对象，不能据此推断无台阶或同层通行；尤其需要现场核对 `layer=-1` 区域与上方 University Walk 的连接。

通道 A（调查快照；源节点依次为 8597065685、10074506254、10074506253、10074506258、8597065684）：

```json
{
  "type": "LineString",
  "coordinates": [
    [151.2327362, -33.9169865],
    [151.2327865, -33.9170295],
    [151.2329883, -33.9173558],
    [151.2330047, -33.9173824],
    [151.2330348, -33.9174310]
  ]
}
```

通道 B（调查快照；源 way 的逆序节点为 8597065685、12908888232、12908952919、2763366434、12908888234、10074506255、8597065684）：

```json
{
  "type": "LineString",
  "coordinates": [
    [151.2327362, -33.9169865],
    [151.2327079, -33.9171655],
    [151.2326780, -33.9173069],
    [151.2326654, -33.9173665],
    [151.2328181, -33.9173927],
    [151.2329964, -33.9174233],
    [151.2330348, -33.9174310]
  ]
}
```

按这些折线顶点的球面段距相加，A 约 56.84m，B 约 77.60m；这是离线几何计算，**不是 ORS 路线距离、轮椅实测距离或可通行证明**。初步调查显示两条拓扑通道不同；是否能满足本项目相同起终点与限制的有效绕行，仍以实测和 ORS 结果为准。

用于第一次离线查看的建议框可取 `[151.2325,-33.9176,151.2332,-33.9168]`。这是由上述坐标外扩选定的**调查视窗**，不是已经批准的服务区域 bbox；上线 bbox 必须覆盖真实吸附路线与备选通道并经过实测。不得仅为使供应商结果通过而放大区域或删除障碍。

## 官方参照点与地图证据

以下官方点用于帮助到现场找位置。建筑记录是**质心**，不能直接当作无障碍入口或路线起终点。

| 官方参照 | `[longitude, latitude]` | 来源字段 |
| --- | --- | --- |
| Gate 8 | `[151.23325630067706,-33.915967961088064]` | `Kensington_Campus/MapServer/0`，OBJECTID=7，GateNumber=8 |
| Gate 9 | `[151.23439624839958,-33.916123986220001]` | 同图层，OBJECTID=8，GateNumber=9 |
| Gate 11 | `[151.23611855864942,-33.91811292099657]` | 同图层，OBJECTID=9，GateNumber=11 |
| Main Library / F21 | `[151.23341377,-33.91748317]` | `Kensington_Campus_2026/MapServer/8`，OBJECTID=67，CENTROID_X/Y |
| John Niland Scientia / G19 | `[151.23236724,-33.91802764]` | 同图层，OBJECTID=61，CENTROID_X/Y |

门点坐标由官方 GIS 查询 `outSR=4326` 返回；完整查询链接：[Gate 8/9/11](https://gis.unsw.edu.au/server/rest/services/Kensington_Campus/MapServer/0/query?where=GateNumber%20IN%20%288%2C9%2C11%29&outFields=OBJECTID%2CGateNumber%2CGateName%2CStreet%2CType&outSR=4326&f=pjson)。[门图层元数据](https://gis.unsw.edu.au/server/rest/services/Kensington_Campus/MapServer/0)。

建筑坐标直接读取官方 `CENTROID_X` / `CENTROID_Y`，不使用投影后的轮廓坐标冒充经纬度：[F21/G19 记录查询](https://gis.unsw.edu.au/server/rest/services/Kensington_Campus_2026/MapServer/8/query?where=BuildingCo%20IN%20%28%27F21%27%2C%27G19%27%29&outFields=OBJECTID%2CBuildingCo%2CBuildingNa%2CCENTROID_X%2CCENTROID_Y&returnGeometry=false&f=pjson)、[图层元数据](https://gis.unsw.edu.au/server/rest/services/Kensington_Campus_2026/MapServer/8)。

已打开并渲染查看两份单页官方 PDF 的整页图示与图例：

- [Kensington Campus Accessible Parking & Toilets](https://www.estate.unsw.edu.au/sites/default/files/documents/KensingtonAccessibility.pdf)：右下角日期 **13/02/2019**；图例区分 accessible route、限时开放 accessible route、steps、lift。该旧图可帮助寻找周边无障碍连接，不能证明候选双通道当下状态。
- [Kensington Campus Map](https://www.unsw.edu.au/content/dam/pdfs/estate-management/general/2025-04-estate-management/2025-04-Kensington-Campus-Map_2.pdf)：文件 URL 含 2025-04，但图内 **Date Exported: 18/08/2023 1:22 PM**；图中可定位 F21、G19、University Mall、Library Road、Gate 8/9/11。不能把 URL 年月当测绘更新日期。

UNSW [当前校园地图说明](https://www.unsw.edu.au/estate/getting-here/maps)提供交互地图入口和避开 stairs/barriers 的选项；[Library disability support](https://www.library.unsw.edu.au/using-the-library/disability-support)说明 Main Library 前门面向 Library Lawn 的右侧设有无障碍坡道。这只能支持参照建筑的入口调查，不能证明本文两条 courtyard 通道已经满足轮椅限制。

## 可复查的取数记录

- OSM 原始数据取得成功：[Map API bbox extract](https://api.openstreetmap.org/api/0.6/map?bbox=151.2315,-33.9188,151.2365,-33.9155)。API 返回 XML，节点坐标与 way 节点列表实际读取后才抄入本文；不是从二手地图网站推导。
- 两个 Overpass 公共端点分别返回 406 与 500，随后改用上述 OSM Map API 读取成功；未用失败请求证明“无数据”。
- 提取数据版权为 **© OpenStreetMap contributors**，遵循 [OpenStreetMap 版权与 ODbL](https://www.openstreetmap.org/copyright)。如后续把这些对象派生到演示配置，保留来源、对象版本、获取日期及署名。
- 研究临时文件保存在 `/private/tmp/accessloop-campus-research/`，不属于持久交付；本文保留候选原始坐标、节点、way 版本、更新时间和来源链接。正式勘测后应保存受控的选定数据快照，而非依赖临时目录。

| 本次读取文件 | SHA-256（供本次会话对照） |
| --- | --- |
| OSM bbox XML | `3a10ba4627a42096a21d716b25d0990d79ece0ae7ecd275aba8a0b48473fd240` |
| UNSW Gate 8/9/11 JSON | `e5e408af7251d37475aacf68b45c8e50670236576261d7540dc3e58e5edb4ae6` |
| 官方无障碍 PDF | `4d862cd64d9e57d349af8a359ade2fe8859d9eca52d9e35ff3cd865fca0c67f3` |
| 官方校园简图 PDF | `23147efba07389ba1e618b44c5b322086521abc19e34931b831e394e5fee634f` |

## 人到现场时的最小核验

1. 打开官方交互地图和上述两个 OSM 节点；从 Library 西侧找到 courtyard，确认 S/T 是相同室外层级的实际连接点。现场若找不到、需门禁或两条通道无法接通，停止采用本候选，记录原因并另选。
2. 分别沿 A 和 B 全程走查，记录日期时间、照片、净宽、坡度、路缘/台阶、路面、临时施工、开放时段及转弯处空间；未知数值保留 unknown。确认不依赖旧图上已变化的门、坡道或电梯。
3. 在地图实测并校正 S/T 与通道坐标，标出可放置的演示障碍片段。障碍片段应远离 S/T，避免缓冲覆盖端点；不要阻塞真实通道进行演示。
4. 检查 A 的最小避让缓冲不会同时覆盖 B；按 API 契约约束记录经过验证的 buffer。若全部备选同时受阻，演示应明确无路线，不扩大/缩减几何伪造绕行。
5. 把最终选择、观察证据、来源/演示标识、批准 bbox 与校正后的固定 S/T 交 D/C，经受控区域命令持久化。生产配置保持 `isDemo` 与实际实例用途一致。

## 密钥到位后的最小 ORS 核验（由 AI 执行）

1. 固定实测批准的 S/T 与 region 下发的 wheelchair 限制白名单，通过 AccessLoop `/api/routes` 发起一次真实无新增演示障碍的计算；不要浏览器直连供应商。真实调用经过统一预算并记录 requestId、服务端版本和耗时。
2. 检查返回唯一 LineString、非负有限距离/时间、所有点在批准 bbox 内、两端吸附不超过配置上限。特别核对 courtyard 层级：若吸附到上方 University Walk 或错误入口，不发布候选。
3. 在无管理员公众会话中，对 A 的**实际路线片段引用**生成预览并明确确认；若当前真实路线没有经过 A，则在已核验持久化 preset 中选择恰当片段，不能提交任意客户端折线替代 PassageRef。
4. 复用相同 S/T 与完全相同限制重算，检查有效避让不相交，验证是否实际采用 B 或其他现场批准的备选。没有有效备选时保留 `NO_ROUTE`，不要放宽参数。
5. 第二个公众会话重复相同输入，检查不携带第一个会话的个人几何、routeRef 或私有上下文；停用/过期后再复核有效集与旧路线提示。
6. 将真实结果与现场证据补入 D 交接和统一验收表，再决定是否发布成演示配置。当前本文不将任何步骤记为已通过。
