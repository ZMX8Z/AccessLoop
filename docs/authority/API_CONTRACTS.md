# AccessLoop API 契约

版本：v1.0；日期：2026-10-17；适用范围：完整 P0/P1 MVP。

**本文是待实现契约，不表示接口、Payload 配置、外部服务或数据库已经存在或通过验收。** 骨架提供 `/api/health`；D 已实现 region/places/passages/routing-context/routes/search 的严格处理器与供应商服务，但在 C 的真实仓储安装前这些端点明确返回 503。其余接口与完整联调仍由对应工作包继续实现。缺少原始字段定义的地方，本文给出一致的 MVP 默认值；实现时不得由各工作包另定同义字段。

本文件是业务 API、共享 DTO、状态、权限和版本语义的唯一维护位置。项目范围见 [PROJECT.md](PROJECT.md)，阅读入口见 [权威文档索引](README.md)与[仓库 README](../../README.md)，需求和架构分别见[需求文档](AccessLoop_需求文档_v1.0.md)与[技术文档](AccessLoop_技术文档_v1.0.md)。分支、合并目标及接口变更交接统一遵循 [COLLABORATION.md](COLLABORATION.md)，本文不另列分支表。验收口径见 [ACCEPTANCE.md](ACCEPTANCE.md)。

## 1 共用传输、身份与校验

### 1.1 路径与响应

- AccessLoop 业务接口使用 `/api/*`；Payload Admin 使用 `/admin`；Payload 原生认证和受保护读取使用 `/cms-api/*`。三者运行在同一个 Next.js + Payload 应用。
- 除上传、图片、导出及 Payload 原生接口外，请求和响应使用 `application/json`，字段名使用 camelCase。模型结果内部保留本文件定义的 snake_case 字段，不由前端另行改名。
- JSON 成功响应为 `{ "data": T, "requestId": "..." }`；错误响应为 `{ "error": { "code": "...", "message": "...", "details": {} }, "requestId": "..." }`。`details` 可省略；`message` 使用适合界面展示的英文，不含上游响应原文或秘密。
- 每个响应含 `X-Request-Id`，与 JSON 中的 `requestId` 一致。服务端生成不可预测的请求标识，不将 Cookie、对象键、供应商密钥或会话标识用作该值。
- 图片成功响应是二进制，导出成功响应是 HTML；通过 `X-Request-Id` 关联请求，失败仍返回 JSON 错误包络。Payload 原生接口沿用 Payload 的原生响应结构，通过响应头提供请求标识，不假定其也使用业务 `data` 包络。
- 路线、会话、routing-context、本人报告、私有图片、导出和管理接口均设置 `Cache-Control: private, no-store`。MVP 其他业务 GET 也默认 `no-store`，供应商与业务缓存由服务端显式管理。
- 不提供浏览器直连 ORS、GLM、OSS 的密钥或任意代理 URL。所有业务请求属于服务器当前配置的单一区域，客户端不通过 `regionId` 切换实例或绕过区域约束。

成功与失败示例：

```json
{"data":{"status":"ok"},"requestId":"req-01"}
```

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This report has changed. Reload it before confirming.",
    "details": {"currentVersion": 4}
  },
  "requestId": "req-02"
}
```

### 1.2 匿名 Cookie 与管理员

`POST /api/session` 初始化匿名身份。Cookie 固定命名为 `accessloop_session`，设置 `HttpOnly; SameSite=Lax; Path=/`，生产环境另设 `Secure`，不设 `Domain`、`Expires` 或 `Max-Age`。Cookie 是签名的不透明凭据，后端以其派生的会话散列建立归属；原始凭据和散列都不进入响应 DTO。签名密钥跨应用重启保持稳定。刷新可继续本会话，关闭浏览器后不承诺恢复，不提供公众账号或跨设备恢复。

所有浏览器写请求，包括 multipart 上传及只读 POST，校验 `Origin` 与服务端配置的应用来源相等；来源缺失或不匹配返回 `403 FORBIDDEN`。配合 SameSite Cookie 作为 MVP 的 CSRF 防护，不开放任意跨域凭据访问。匿名会话过期、无效或缺失时，需身份的接口返回 `401 UNAUTHENTICATED`；前端重新初始化，不能据报告编号找回旧归属。

管理员使用 Payload 的 `admins` auth Collection 和原生登录会话，登录入口为 `/admin`；保留原生 `/cms-api/admins/login`、`/cms-api/admins/logout`、`/cms-api/admins/me` 认证入口，其格式以锁定的 Payload 版本为准。管理账号受控初始化，公众注册关闭。匿名 Cookie 不能升级或替代管理员身份。

| 角色 | 允许的管理操作 |
| --- | --- |
| `report_admin` | 受保护的报告、证据和审计读取；五种报告管理动作；调用摘要读取 |
| `operator` | 包含上述权限，并可读写区域配置；账号及角色管理仅经受控运营流程 |

管理列表、详情、AI 原文、证据和审计优先使用受保护的 Payload 读取，例如 `/cms-api/hazard-reports`、`/cms-api/hazard-reports/{id}`、`/cms-api/ai-analyses/{id}`、`/cms-api/report-events`。不另建同义管理 CRUD。前端隐藏按钮不构成鉴权；`/cms-api` 的 Collection、字段、文件、缩略图与关系展开同样校验权限。

公众页面只调用 `/api/*`。管理状态动作与区域修改只走本文业务命令；通用 Payload CRUD 不得修改归属、报告状态、公共几何、确认、业务版本、AI 原文、预算或审计，也不能绕过统一上传处理。业务服务经同一 Payload 仓储和事务连接写入。

### 1.3 共用类型与默认值

下列是契约表示法，实施时在 `src/shared/contracts/` 建立对应运行时 Schema 并推导 TypeScript 类型。所有对象默认拒绝未知字段；不进行宽松字段猜测。`Id` 为服务端生成的不透明字符串，客户端不能从格式推导权限；`Version` 为从 1 开始的整数，公共/个人上下文版本可从 0 开始；`Instant` 为带时区的 ISO 8601 时间，响应统一使用 UTC `Z`。

```ts
type Id = string;
type Version = number;
type Instant = string;
type Position = [longitude: number, latitude: number];
type BBox = [west: number, south: number, east: number, north: number];
type LineString = { type: "LineString"; coordinates: Position[] };
type AvoidGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

type ReportCategory =
  | "construction" | "steps_or_kerb" | "surface_damage"
  | "obstruction" | "other";
type ReportStatus = "pending" | "ai_assessed" | "verified" | "resolved" | "rejected";
type AIStatus = "completed" | "uncertain" | "unavailable";
type Accessibility = "yes" | "limited" | "no" | "unknown";

type PassageRef =
  | { routeRef: Id; startIndex: number; endIndex: number }
  | { presetPassageId: Id; passageVersion: Version };
```

- GeoJSON 全部为 WGS84 `[经度, 纬度]`，经度在 `[-180,180]`，纬度在 `[-90,90]`；前端 Leaflet 转换只能发生在展示边界。bbox 须 west < east、south < north，MVP 不处理跨日期变更线的区域。
- 距离、宽度、路缘高度和缓冲使用米，时长使用秒，坡度使用百分比；数值必须有限。文本是纯文本，按 Unicode 字符计数并安全转义后展示。
- 描述 1–1000 字符，理由/证据摘要 1–1000 字符，名称 1–120 字符；前后空白去除后不能为空。可选字段省略表示不修改；仅明确允许的字段可以提交 `null`。
- 观察时间不得晚于服务端当前时间。个人有效期默认 `observedAt + 3600s`，公共有效期默认核实证据的 `observedAt + 86400s`；提交时已过期则拒绝，不从请求到达时间重新计算有效期。这两个时长可由部署运营配置，响应下发实际值。
- MVP 应用保护默认值：routeRef 有效 900s；预览最多有效 300s；原文件最多 5 MiB、解码后最多 2000 万像素、处理后长边最多 2048 像素；路线吸附偏差最多 50m；报告点到所选通道最多 20m；区域初始缓冲 2m。缓冲可配置为 0.5–5m。这些是待 D 在目标区域验证的应用默认值，不是供应商上限或实测安全结论。
- 有效障碍最多 20 个、合并避让几何最多 200 顶点、总面积最多 200000m²；超限返回错误，不截掉部分障碍。几何均验证边界、闭合、自相交、有限坐标、非零面积及顶点数。

`PassageRef` 两种分支互斥，不能混用字段。路线片段索引是校验后返回的唯一 LineString 坐标数组的 **0 起始、两端包含**索引，满足 `0 <= startIndex < endIndex < coordinates.length`。routeRef 必须属于当前匿名会话、当前区域且未过期。预设通道必须是当前持久化配置中的 ID，`passageVersion` 精确匹配；不得用客户端任意折线或多边形代替个人通道引用。

## 2 接口总表

`会话` 表示需要有效匿名 Cookie；`管理` 表示需要 Payload 管理身份。P1 也是本次必交范围，尚未实现时关闭相应写入口，不能返回虚假成功。

| 方法 | 路径 | 身份 | 阶段与输出 |
| --- | --- | --- | --- |
| POST | `/api/session` | 公开 | P0；初始化/复用匿名会话 |
| GET | `/api/region` | 公开 | P0；当前区域与可用路线参数 |
| GET | `/api/routing-context` | 会话 | P0；双版本、有效集摘要与最近到期 |
| GET | `/api/places?bbox=…` | 公开 | P0；地点及无障碍规范化状态 |
| GET | `/api/passages` | 公开 | P0；持久化预设通道及版本 |
| GET | `/api/search?q=…` | 公开 | P1；真实区域内地址搜索 |
| POST | `/api/uploads` | 会话或管理 | P0；multipart 验证上传，返回 photoId |
| GET | `/api/photos/{id}` | 作者或管理 | P0；处理后图片二进制 |
| POST | `/api/analyze` | 会话 | P0；服务端图片分析 |
| POST | `/api/reports` | 会话 | P0；创建报告，不启用个人避让 |
| GET | `/api/reports?bbox=…&scope=public\|mine` | 公开/会话 | P0/P1；公共白名单或本人报告 |
| GET | `/api/reports/{id}` | 公开/作者/管理 | P0/P1；按权限选择 DTO |
| PATCH | `/api/reports/{id}` | 作者 | P0；未公共发布报告的事实修正 |
| POST | `/api/reports/{id}/avoidance-preview` | 作者 | P0；只读预览，不启用 |
| POST | `/api/reports/{id}/avoidance` | 作者 | P0；明确确认/续期 |
| DELETE | `/api/reports/{id}/avoidance` | 作者 | P0；停用本人的个人避让 |
| PATCH | `/api/reports/{id}/review` | 管理 | P1；五种受保护管理动作 |
| POST | `/api/routes` | 会话 | P0；有效路线和本会话 routeRef |
| GET | `/api/reports/{id}/export` | 同详情读取 | P0/P1；授权 HTML 打印页 |
| GET | `/api/admin/region` | operator | P1；配置及配置版本 |
| PATCH | `/api/admin/region` | operator | P1；校验后持久化区域/预设通道 |
| GET | `/api/admin/usage-summary` | 管理 | P1；最近 24h 调用摘要 |
| GET | `/api/health` | 公开 | P0；最小存活状态 |

## 3 版本、幂等和有效集

### 3.1 版本与写入规则

| 字段 | 含义与规则 |
| --- | --- |
| `rowVersion` | 单报告私有业务版本；所有成功的报告业务变更增加 1。报告写请求的 `expectedVersion` 对应该值；不进入公共 DTO 或公共摘要 |
| `publicRevision` | 独立公共发布快照版本；从未发布时为 null，首次 verify 为 1，仅管理员认可的公共发布、重新核实、纠错、驳回、解除、撤下等公共变化增版。个人确认/续期/停用不改变它 |
| `hazardVersion` | 当前区域公共数据/路由约束版本；公共发布快照变化及影响公共读取或路由的合法配置变更增版；本人私有动作不改变它 |
| `personalVersion` | 当前区域与当前匿名会话的版本；本人报告创建、修正、确认、续期或停用增版；不得增加其他不受影响会话的版本 |
| `configVersion` | 单区域持久化配置版本；每次成功修改增加 1。区域命令的 `expectedVersion` 对应该值 |
| `passageVersion` | 单预设通道持久化版本；通道变更后增版，旧引用失效；未改动的通道保留版本 |
| `activeDigest` | 当前有效公共集和本会话个人集的摘要；公共部分只使用公共发布快照及 publicRevision，个人部分才使用本人 rowVersion/确认版本，另含影响路由的配置。自然过期也会改变摘要 |

已有报告的 PATCH、确认、停用、review，以及区域 PATCH 必须提供正整数 `expectedVersion` 和 `Idempotency-Key`。创建上传、分析、报告只提供幂等键，不提供 `expectedVersion`。session 本身幂等；只读 preview、routes 不使用业务写幂等键，分别复算和复用业务缓存。

幂等键是客户端生成的 8–128 字符不透明字符串，以“解析后的身份 + 方法 + 规范化路径 + 键”为作用域，保留至少 24h。上传另以解析后的 purpose 区分作用域，并将文件内容散列纳入请求指纹；不得因同时存在两种 Cookie 随意切换主体。服务端比较规范化请求内容；相同键与相同内容重放原业务结果，不重写、不增版、不重复调用供应商。相同作用域同键不同内容返回 `409 IDEMPOTENCY_CONFLICT`。重放先于版本冲突检查，因此成功写入后用同一键重试不会因原 `expectedVersion` 变旧而失败。每次 HTTP 响应可有新的 requestId，业务结果与原提交一致。

事务内核对身份、幂等、报告/配置版本和状态，原子写入业务记录、双范围版本、足够展示的审计及幂等结果。失配返回 `409 VERSION_CONFLICT`；只向已授权主体返回 `details.currentVersion`。C/D 使用同一 Payload 管理的连接与事务上下文，不能分别提交后声称原子。

### 3.2 生效规则

公共有效集：最新公共发布快照仍处于已发布的 verified 状态、快照公共几何合法、快照 `validUntil > now`。公共事实、观察时间、几何、核实信息与状态由管理员认可后独立保存，不实时拼接私有报告字段。个人有效集：当前会话的 `active=true`、未过期、报告不是 resolved/rejected、确认版本匹配且个人几何合法。AI 分析、报告生命周期、个人开关分别保存。pending/ai_assessed 都允许明确人工确认的个人避让；`completed` 不自动开启任何避让。

摘要按确定顺序规范化：公共项包含 `{id,publicRevision,publicAvoidGeometry,validUntil}`，个人项包含 `{id,rowVersion,confirmationReportVersion,avoidGeometry,validUntil}`，再加入区域及影响路由的配置摘要。公共项严禁混入 rowVersion、个人通道、个人观察时间或确认信息。例：已公共核实报告的作者停用个人避让时，其 rowVersion 和本人 personalVersion 增加；publicRevision、hazardVersion 与其他会话的公共摘要保持不变。

确认绑定事务提交后的 `rowVersion`。照片、位置、观察时间或通道的持久化修改使旧确认失效并停用；仅不改变确认依据的事实修正可以保留个人几何，但必须原子更新其合法版本绑定。管理动作使确认失效时，在同事务停用并增加受影响会话的 `personalVersion`。resolve/reject 停止该报告的个人生效；reopen 不恢复旧确认。个人停用始终不解除仍有效的公共障碍。

自然过期按读取时计算，不依赖定时任务，不要求为时钟流逝写一次版本。客户端每 5 秒读取 routing-context，比较 `hazardVersion`、`personalVersion` 和 `activeDigest`，在 10 秒内把旧路线标为过时；`configVersion` 变化还应刷新区域/通道配置。轮询不得调用 ORS。客户端自己的请求序号防止旧路线、旧搜索、旧 AI 响应覆盖新输入。

## 4 区域、地点、通道与搜索

### 4.1 `POST /api/session`

请求体为 `{}`。无有效 Cookie 时创建会话并 `Set-Cookie`；有效时复用，均返回 200：

```json
{
  "data": {"ready": true, "regionId": "region-unsw", "isDemo": true},
  "requestId": "req-session"
}
```

不返回会话 ID、散列或恢复令牌；复用不清空已有个人数据。

### 4.2 `GET /api/region`

无请求体。返回 `RegionDTO`：

```ts
type Restrictions = {
  maximum_incline: number;       // 百分比
  maximum_sloped_kerb: number;   // 米
  minimum_width: number;         // 米
};
type RegionDTO = {
  id: Id; name: string; bbox: BBox; timezone: string; isDemo: boolean;
  hazardVersion: number; configVersion: Version;
  personalValiditySec: number; publicValiditySec: number;
  avoidanceBufferM: number;
  routing: {
    profile: "wheelchair";
    defaultRestrictions: Restrictions;
    supportedRestrictions: {
      maximum_incline: number[];
      maximum_sloped_kerb: number[];
      minimum_width: number[];
    };
  };
};
```

`timezone` 是有效 IANA 时区。MVP 初始默认限制为 `{maximum_incline:6, maximum_sloped_kerb:0.06, minimum_width:0.9}`；初始白名单只包含这组值，D 实测后可通过部署配置增加已验证选项。调用方只能使用下发白名单，不把示例视为供应商全部允许值或通行安全阈值。区域 bbox、名称和通道几何须由 D 实测交接，本文件不捏造实地坐标。

### 4.3 `GET /api/routing-context`

必须有会话，无请求体，返回：

```json
{
  "data": {
    "regionId": "region-unsw", "hazardVersion": 12, "personalVersion": 3,
    "configVersion": 2, "activeDigest": "sha256:effective-set",
    "nextExpiryAt": "2026-10-17T04:00:00Z", "evaluatedAt": "2026-10-17T03:10:00Z"
  },
  "requestId": "req-context"
}
```

`nextExpiryAt` 是当前有效并集中最早到期时间，无有效避让时为 `null`。无个人避让仍返回该会话真实的 `personalVersion`；不得用公共缓存中的 0 覆盖它。不返回其他会话数据，不调用 ORS。

### 4.4 `GET /api/places?bbox=…`

`bbox` 为必填逗号分隔的四个数；必须在当前区域内，最大请求范围不超过整个配置区域。固定最多 100 条；不提供分页或更多过滤参数。结果为 `{items:PlaceDTO[],truncated:boolean}`；超过 100 条时 `truncated=true`，不得声称已完整覆盖。

```ts
type PlaceDTO = {
  id: Id; name: string; category: "toilet" | "entrance" | "rest_area" | "other";
  location: Position; accessibility: Accessibility;
  accessibilityNote: string | null;
  source: string; sourceId: string; fetchedAt: Instant; isDemo: boolean;
  rawAccessibility: { wheelchair: string | null; toiletWheelchair: string | null };
};
```

来源标签不足、不可识别或冲突时为 unknown，保留原标签。厕所类别不推导厕所无障碍；地点可进入不推导沿途道路可通行。`source/sourceId` 为经白名单映射的数据来源，不返回任意供应商内部对象。

### 4.5 `GET /api/passages`

无请求参数，返回当前持久化配置中的 `{configVersion,items:PresetPassageDTO[]}`：

```ts
type PresetPassageDTO = {
  id: Id; passageVersion: Version; name: string;
  geometry: LineString; isDemo: boolean;
};
```

几何只供展示和后端再次引用验证，客户端不能编辑后作为 PassageRef 提交。`isDemo` 继承当前区域配置。重启后 ID、版本和几何不变，不能每次启动随机生成。

### 4.6 `GET /api/search?q=…`（P1）

`q` 必填，去空白后 2–100 字符；不接受任意供应商地址。服务器将查询限制到当前区域，最多返回 5 条，响应 `{query:string,items:SearchResultDTO[]}`：

```ts
type SearchResultDTO = {
  id: Id; name: string; location: Position; source: string;
};
```

ID 在同一来源同一结果间稳定；结果只提供选点信息，不增加报告权限。无匹配或所有候选均在区域外时返回 200 和 `items:[]`；上游故障返回相应错误，不能冒充无结果。结果坐标再次由 routes 验证。相同区域/标准化查询可缓存，真实调用计入独立 Geocoding 预算。

## 5 图片与 AI

### 5.1 `POST /api/uploads`

请求为 `multipart/form-data`，文件字段为 `file`，可选文本字段 `purpose` 枚举为 report/review_evidence，缺省为 report；携带 `Idempotency-Key`。仅接受实际解码成功的 JPEG/PNG；不接受文件 URL、客户端 owner/role、额外归属字段或原始对象键。服务端核对 MIME/文件头、大小和像素，缩放并重新编码去 EXIF 后存入 OSS 私有 Bucket；不回退到本地持久化。

- `purpose=report`：无论是否同时存在管理员 Cookie，都必须有有效匿名会话，并绑定该会话；缺失匿名身份返回 401，不回退绑定管理员。
- `purpose=review_evidence`：必须有有效管理身份，并绑定服务端解析出的管理员；匿名 Cookie 不作为该照片的归属。该照片只能用于受保护补证，不能作为公众报告照片或送入本人分析。

purpose 只是用途选择，不是客户端自报身份或权限。幂等作用域使用已解析身份、用途和请求内容，不能让两个 Cookie 的优先级决定所有者。MVP 公众表单可省略 purpose，管理补证表单显式提交 review_evidence。成功 201：

```json
{
  "data": {"photoId":"photo-01","purpose":"report","mime":"image/jpeg","bytes":183204,"width":1536,"height":2048},
  "requestId":"req-upload"
}
```

返回的尺寸和字节数指处理后文件。上传接口不返回公开 URL、OSS objectKey 或签名凭据。CMS 默认上传、文件和缩略图入口不得绕过处理或读取授权。

### 5.2 `GET /api/photos/{id}`

report 照片只允许所属匿名会话或管理员读取；review_evidence 照片只允许管理员读取，不能因同浏览器匿名 Cookie 而公开给匿名主体。成功 200 返回处理后图片二进制，设置正确 `Content-Type`、`X-Request-Id`、`Cache-Control: private, no-store`、`X-Content-Type-Options: nosniff`。MVP 采用应用授权代理，不需要前端持有 OSS 签名 URL。不存在或无权读取统一 `404 NOT_FOUND`，不泄露他人照片是否存在。原图和处理后图均不因公共核实而公开。

### 5.3 `POST /api/analyze`

请求 `{photoId:Id,consent:true}`，携带幂等键。`consent` 表示用户已明确选择将照片送往配置的外部识别服务，不等同于个人避让确认。只接受本匿名会话当前区域、purpose=report 的照片，即使同时登录管理员也不扩大范围；后端读取图片字节调用模型。相同会话、图像内容、模型、promptVersion、schemaVersion 的 completed/uncertain 可用结果可缓存复用，不因前端重绘重复调用；unavailable 不进入可复用分析缓存，不能永久阻止服务恢复后的新调用。

```ts
type AnalysisDTO = {
  analysisId: Id; photoId: Id; aiStatus: AIStatus;
  result: VisionResult | null;
  unavailableReason: null | "no_valid_tool_result" | "invalid_output" | "refused"
    | "provider_timeout" | "provider_unavailable";
  model: string; promptVersion: string; schemaVersion: string;
  createdAt: Instant; cacheHit: boolean;
};
```

成功 200 返回 `AnalysisDTO`。可用结构但不能形成障碍建议时为 uncertain，保留经校验结果；拒绝、无有效工具结果、结构错误或调用失败为 unavailable，`result=null`，保存失败原因后允许人工填报。原幂等键仍重放原 unavailable 结果；用户显式重试须使用新幂等键，重新经过预算门禁。预算门禁尚未允许发起调用时直接返回 429/503 错误，不生成伪造完成记录；429 的倒计时统一读取 `error.details.retryAfterSec`。内部持久化失败也不包装成分析成功。completed/uncertain 时 `unavailableReason=null`。

### 5.4 原生 GLM 工具参数与服务端 Schema

默认 `VISION_PROVIDER=glm`、`VISION_MODEL=glm-4.6v-flash`，密钥只在服务端。供应商请求使用原生图片输入和唯一结果函数 `record_hazard_analysis` 的工具参数 Schema；不是只要求模型在普通文本里输出 JSON，也不把供应商原生严格 Schema 保证作为前提。实际账号/模型的图片、工具参数与延迟能力仍须真实探针验证。

下面 `parameters` 同时是后端完整结构校验 Schema；后端再执行后述语义校验。`tool_choice` 等供应商选项由适配器依锁定 SDK 的真实能力配置，本文不宣称某个 strict 标记已受支持。

```json
{
  "type": "function",
  "function": {
    "name": "record_hazard_analysis",
    "description": "Record only visible evidence about a possible passage obstruction.",
    "parameters": {
      "type": "object",
      "additionalProperties": false,
      "required": ["image_quality","hazard_present","category","visible_passage","description","evidence","uncertainties"],
      "properties": {
        "image_quality": {"type":"string","enum":["usable","poor","unusable"]},
        "hazard_present": {"type":["boolean","null"]},
        "category": {"type":"string","enum":["construction","steps_or_kerb","surface_damage","obstruction","other","uncertain"]},
        "visible_passage": {"type":"string","enum":["blocked","partially_blocked","clear","unknown"]},
        "description": {"type":"string","minLength":1,"maxLength":1000},
        "evidence": {"type":"array","maxItems":10,"items":{"type":"string","minLength":1,"maxLength":300}},
        "uncertainties": {"type":"array","maxItems":10,"items":{"type":"string","minLength":1,"maxLength":300}}
      }
    }
  }
}
```

`VisionResult` 就是该 parameters 对象的值，合法例子：

```json
{
  "image_quality":"usable","hazard_present":true,"category":"construction",
  "visible_passage":"blocked","description":"A construction barrier crosses the visible path.",
  "evidence":["The barrier spans the visible passage."],
  "uncertainties":["The image does not show possible alternatives outside the frame."]
}
```

后端仅提取唯一、完整、可解析、名称精确匹配的结果函数参数；不执行模型提出的任意工具，不从普通文字或多个冲突结果中猜一个。结果先验证完整 Schema，再检查：只有 `usable + hazard_present=true + category!=uncertain + blocked/partially_blocked + 非空 evidence` 才为 completed、形成个人避让建议；其他结构合法但低质量、未见障碍、null、unknown 或语义矛盾的结果为 uncertain。结构不合法为 unavailable，不补字段、不强转真假。

图片中文字和模型输出均是不可信内容。模型不得决定经纬度、精确宽度/坡度、地理多边形、角色、公共核实或生效范围。前端只能读取服务器保存的 analysisId/result，不能提交修改后的 AI 原文。用户修正另存报告事实字段；过时分析不会自动回写报告或覆盖新照片与用户编辑。

## 6 报告 DTO 与读取

### 6.1 私有与公共输出

```ts
type PersonalAvoidanceDTO = {
  active: boolean; effective: boolean;
  passage: PassageRef; avoidGeometry: AvoidGeometry;
  decisionSource: "ai_user_confirmed" | "user_manual";
  observedAt: Instant; confirmedAt: Instant; validUntil: Instant;
  confirmationReportVersion: Version;
};
type PublicVerificationDTO = {
  source: "admin_field_check" | "trusted_maintainer";
  verifiedAt: Instant; validUntil: Instant; resolvedAt: Instant | null;
};
type PrivateReportDTO = {
  id: Id; regionId: Id; rowVersion: Version; status: ReportStatus;
  publicRevision: Version | null;
  photoId: Id; analysis: AnalysisDTO | null;
  location: Position; category: ReportCategory; description: string; observedAt: Instant;
  passage: PassageRef | null; personalAvoidance: PersonalAvoidanceDTO | null;
  publicAvoidGeometry: AvoidGeometry | null;
  publicVerification: PublicVerificationDTO | null;
  publicActivity: "active" | "expired" | "inactive";
  createdAt: Instant; updatedAt: Instant; isDemo: boolean;
};
type PublicReportDTO = {
  id: Id; regionId: Id; publicRevision: Version;
  status: "verified" | "resolved" | "rejected";
  location: Position; category: ReportCategory; description: string; observedAt: Instant;
  publicAvoidGeometry: AvoidGeometry;
  publicVerification: PublicVerificationDTO;
  publicActivity: "active" | "expired" | "inactive";
  isDemo: boolean;
};
```

**PublicReportDTO 是精确白名单**：只允许以上字段，事实、observedAt、几何、状态与核实信息来自最新经管理员认可的公共发布快照，以 publicRevision 标识；区域展示标识沿用当前受控公共配置。不得序列化整个 Collection 后删几个字段。不得包含私人 rowVersion、photoId、图片 URL、原图、analysis/analysisId、原始模型输出、完整证据、用户修正历史、会话散列、管理员身份、内部理由、PassageRef、个人几何、个人观察时间或个人有效期。公共来源只显示上述安全枚举，不公开私有 evidence 中的链接、照片或人员信息。本轮不增加公共图片发布能力。

只有曾经公共发布、最新公共发布快照仍允许展示且状态属于 verified/resolved/rejected 的报告可进入公共 DTO；从未发布的 rejected 报告仍私有。过期保持快照 status=verified，`publicActivity=expired`，不新增 expired 生命周期状态，也不声称已恢复通行。resolved/rejected 为 inactive，可保留最后一次已发布几何作为历史展示，不能用于避让。reopen 变为 pending 后撤下公共展示并增加已有 publicRevision，保留历史但不返回公共 DTO，直到重新核实；撤下后重新发布不重置版本。

`PrivateReportDTO` 供作者业务页面和授权详情使用，不包括会话散列或全部管理审计。其中 publicRevision/publicAvoidGeometry/publicVerification/publicActivity 描述独立公共快照，不能用私人 observedAt 或个人确认数据填充；publicRevision 从未发布时为 null。管理员的完整内部证据与历史通过受保护 Payload 读取，不将其混入公共 DTO。`personalAvoidance.effective` 由 §3.2 实时推导，不只依赖 active 字段。

### 6.2 `GET /api/reports` 与 `GET /api/reports/{id}`

列表 `scope` 可为 public/mine，默认 public；`bbox` 可省略，省略为当前区域，提供时规则同 places；最多 100 条，响应 `{items:PublicReportDTO[]|PrivateReportDTO[],truncated:boolean}`。public 只返回白名单，mine 必须有会话且只返回本人报告，管理员身份不会把 mine 变成所有报告列表。

详情根据身份返回：作者或管理员得到 PrivateReportDTO；其他人仅在符合公共发布条件时得到 PublicReportDTO；其余统一 `404 NOT_FOUND`。成功 200，始终禁止共享缓存。公开身份不能通过编号猜测私人记录。

## 7 报告创建、修改与个人避让

### 7.1 `POST /api/reports`

携带幂等键，输入：

```ts
type CreateReportInput = {
  photoId: Id; analysisId?: Id;
  location: Position; category: ReportCategory; description: string; observedAt: Instant;
  passage?: PassageRef;
};
```

照片必须是本匿名会话当前区域、purpose=report 的照片。analysisId 若提供，必须对应同一照片、会话及当前分析配置；引用过时分析返回 `409 ANALYSIS_STALE`，不静默忽略。无 analysisId 允许人工填报；用户须填写可确定的 ReportCategory，不能把模型 uncertain 直接当作已确认类别。

有效 completed 分析关联报告时 status=ai_assessed；无分析、uncertain 或 unavailable 均为 pending。原始分析与用户事实分别保存。成功 201 返回 PrivateReportDTO，`rowVersion=1`、`publicRevision=null`、`personalAvoidance=null`，不自动启用；增加本人 personalVersion 以刷新本人报告层，不改变公共版本。客户端不能提交 status、AI 原文、可信标志、公共几何或归属。

```json
{
  "photoId":"photo-01","analysisId":"analysis-01",
  "location":[151.2301,-33.9174],"category":"construction",
  "description":"A barrier blocks the path entrance.","observedAt":"2026-10-17T03:00:00Z",
  "passage":{"presetPassageId":"passage-01","passageVersion":2}
}
```

例中坐标只是格式说明，不代表实测通道。

### 7.2 `PATCH /api/reports/{id}`

仅作者可修正 status 为 pending/ai_assessed 且从未公共发布的报告。已发布、已驳回或已解决的记录通过管理命令处理，返回 `409 INVALID_TRANSITION`。请求含 `expectedVersion`，其余可修改字段为 CreateReportInput 的字段；至少实际修改一项，`analysisId:null` 可解除分析关联，`passage:null` 可清除通道。

换照片必须同请求提供匹配新照片的 analysisId 或显式 `analysisId:null`，不能保留旧分析。变更照片或分析关联后，后端按创建报告相同规则重新确定 pending/ai_assessed；未变更关联时不让迟到 AI 改写状态。更换照片/分析关联/位置/观察时间/通道保存时，清除旧确认、停用个人避让；未改变确认依据的修正按 §3 保持绑定。成功 200 返回新 PrivateReportDTO，rowVersion 与本人 personalVersion 增版。不能借 PATCH 修改原始分析、公共状态或几何。

### 7.3 `POST /api/reports/{id}/avoidance-preview`

请求为下列完整输入，无幂等键，不写业务状态、不增加版本、不调用 ORS：

```ts
type PreviewInput = {
  expectedVersion: Version;
  observedAt: Instant;
  passage: PassageRef;
};
type PreviewDTO = {
  expectedVersion: Version; observedAt: Instant; passage: PassageRef;
  configVersion: Version;
  avoidGeometry: AvoidGeometry; validUntil: Instant;
  previewDigest: string; expiresAt: Instant;
};
```

坐标取报告当前位置；后端校验报告归属与版本、生命周期、观察时间、routeRef/预设通道版本、位置与通道匹配及缓冲几何。pending/ai_assessed/verified 均可预览个人避让，resolved/rejected 不可。输入时间是用户此次重新确认的观察时间，不要求等于旧报告时间；确认后保存于 personalAvoidance.observedAt，不改写原报告或已发布公共事实。提交新时间本身不自动续期。

```json
{
  "expectedVersion":2,"observedAt":"2026-10-17T03:00:00Z",
  "passage":{"routeRef":"route-01","startIndex":4,"endIndex":7}
}
```

成功 200 返回 PreviewDTO。previewDigest 为服务器生成的不可伪造摘要/令牌，绑定会话、区域、报告与版本、照片和关联分析、报告位置、此次 observedAt、PassageRef 及所引用几何/版本、配置版本、几何算法版本、生成结果和到期时间。expiresAt 取生成后 300s、routeRef 到期（如适用）和 validUntil 的最早值。摘要可无状态签名实现；客户端不能自己计算一个摘要替代服务器预览。

```json
{
  "data": {
    "expectedVersion":2,"observedAt":"2026-10-17T03:00:00Z",
    "passage":{"presetPassageId":"passage-01","passageVersion":2},
    "configVersion":2,
    "avoidGeometry":{"type":"Polygon","coordinates":[[[151.2300,-33.9173],[151.2302,-33.9173],[151.2302,-33.9175],[151.2300,-33.9175],[151.2300,-33.9173]]]},
    "validUntil":"2026-10-17T04:00:00Z","previewDigest":"signed-preview-token",
    "expiresAt":"2026-10-17T03:05:00Z"
  },
  "requestId":"req-preview"
}
```

示例多边形仅展示结构，实际范围必须由同一后端几何服务计算。浏览器自动请求并展示预览，不表示已同意避让；未保存的表单选择不会改变现有有效集。

### 7.4 `POST /api/reports/{id}/avoidance`

携带幂等键，输入为 `PreviewInput + {previewDigest:string,consent:true}`，不得传个人多边形、decisionSource、confirmedAt、validUntil 或公共 scope：

```json
{
  "expectedVersion":2,"observedAt":"2026-10-17T03:00:00Z",
  "passage":{"routeRef":"route-01","startIndex":4,"endIndex":7},
  "previewDigest":"signed-preview-token","consent":true
}
```

服务端重新读取当前数据，用预览同一算法复算，检查令牌、归属、版本、通道、输入及到期完全匹配。缺少明确 consent 返回 `422 CONFIRMATION_REQUIRED`；令牌缺失或不匹配/过期返回 `409 PREVIEW_STALE`；报告版本变化返回 `409 VERSION_CONFLICT`。所有失败均不启用或部分更新。

成功 200 返回新 PrivateReportDTO；原子保存本次个人确认的观察时间/通道/几何、active=true、confirmedAt=服务器当前时间、有效期及提交后确认版本，增加 rowVersion 和本人 personalVersion，写审计和幂等结果。decisionSource 由服务端决定：有匹配 completed 障碍分析为 ai_user_confirmed，否则为 user_manual。报告生命周期、公共发布快照、publicRevision、hazardVersion 及其他会话公共摘要均不因个人确认/续期改变；此次 observedAt 只写 personalAvoidance，不覆盖公共快照 observedAt。续期使用完全相同的预览、明确确认流程，不提供无观察时间的自动续期。

### 7.5 `DELETE /api/reports/{id}/avoidance`

携带幂等键，JSON 请求体 `{expectedVersion:Version}`。仅作者操作，将本人的 active 设为 false，增加 rowVersion 和本人 personalVersion，成功 200 返回新 PrivateReportDTO。已经 inactive 或从未启用且版本仍匹配时返回当前 DTO，不重复增版；幂等重放也不重复增版。不会改变公共快照、publicRevision、hazardVersion、公共有效集或其他会话公共摘要。

## 8 管理动作与公共发布（P1）

### 8.1 `PATCH /api/reports/{id}/review`

所有动作要求 Payload 管理身份、幂等键、`expectedVersion`、`action`、非空 `reason`。操作者与角色从服务端身份读取，不接受客户端 actor/verifiedBy/status。

```ts
type ExtraEvidence =
  | { kind: "field_observation"; observedAt: Instant; summary: string; photoId?: Id }
  | { kind: "trusted_maintainer"; observedAt: Instant; summary: string; sourceReference: string };
type CorrectedFields = {
  location?: Position; category?: ReportCategory; description?: string; observedAt?: Instant;
};
type ReviewBase = { expectedVersion: Version; reason: string };
type ReviewInput = ReviewBase & (
  | { action: "verify"; extraEvidence: ExtraEvidence;
      publicAvoidGeometry: AvoidGeometry; validUntil?: Instant }
  | { action: "correct"; corrections?: CorrectedFields;
      extraEvidence?: ExtraEvidence; publicAvoidGeometry?: AvoidGeometry; validUntil?: Instant }
  | { action: "reject" }
  | { action: "resolve"; extraEvidence: ExtraEvidence }
  | { action: "reopen" }
);
```

`sourceReference` 是 1–500 字符的可信维护方记录标识或 HTTPS 来源，仅存私有证据，不作为服务器自动抓取 URL。field_observation 必须是管理员独立观察记录；可选 photoId 必须为 purpose=review_evidence、由管理身份授权读取的证据照片，且不能是原报告照片；不能复用匿名 report 上传冒充独立补证。trusted_maintainer 必须是运营确认的可信来源。服务端校验来源资格、时间、归属与完整性；同一匿名会话重复报告、原照片、AI 自评或原有个人确认不满足额外核实。证据内容保存为私有记录；公共 source 分别映射 admin_field_check/trusted_maintainer。

运营通过服务端环境变量 `TRUSTED_MAINTAINER_REFERENCES` 配置获准的 `sourceReference`，格式为 JSON 字符串数组，最多 100 项。接口按完整字符串精确匹配，不按域名或前缀放行，也不抓取 URL。未配置时名单为空，trusted_maintainer 核实返回 `EVIDENCE_REQUIRED`；独立实地观察方式仍可使用。

| action | 允许起始状态 | 最小行为与条件 |
| --- | --- | --- |
| verify | pending、ai_assessed、verified | 首次核实或重新核实；必须有独立 extraEvidence 和合法 publicAvoidGeometry。verifiedAt 由服务器写；validUntil 缺省为证据观察时间 + 公共默认时长，显式值须在 `(now, 证据观察时间+公共时长]` |
| correct | pending、ai_assessed、verified、resolved、rejected | 至少修改一个事实/公共范围/有效期字段，不覆盖 AI 原文；保留生命周期。verified 的任何公开事实、几何或有效期修正都必须提交新的 extraEvidence，并重验完整公共几何和有效期。非 verified 不接受公共几何/有效期输入，不借纠错恢复生效 |
| reject | pending、ai_assessed、verified | 转为 rejected，停止公共与个人生效，保留理由；从未发布的报告不因此公开 |
| resolve | verified | 依据独立 extraEvidence 解除公共障碍，转为 resolved，写 resolvedAt，停止该报告个人生效；自然过期不能冒充已解除 |
| reopen | resolved、rejected | 转为 pending，清除旧有效确认/公共生效，不恢复旧个人避让；保留历史，需重新分析/确认或重新核实 |

公共几何只能由管理员在 verify 或适用的 correct 中提交，必须经过 D 的几何验证，并与报告位置及独立证据对应；**公众确认接口始终不接受公共几何**。verify/correct 不能仅凭任意多边形或原始 AI 结果发布。

对于仍为 verified 的 correct，可以省略未改变的公共几何/validUntil，但完整最终记录必须在新证据下有效；需要延期则显式提交新 validUntil。correct 对非 verified 报告只改事实，不重新激活任何范围。影响照片、位置、通道或生命周期的管理变更须停用个人确认；未改变确认依据时维护提交后版本绑定。

所有成功动作 200 返回 PrivateReportDTO。管理员认可的公开事实、快照 observedAt、几何、核实信息和状态独立保存为公共发布快照。首次 verify 建立 publicRevision=1；对已发布内容的 verify/correct/reject/resolve/reopen 等公共变化推进 publicRevision，撤下也增版。仅修改从未发布的私人报告不生成公共版本、不改 hazardVersion。

rowVersion、公共发布快照及 publicRevision、hazardVersion（发生公共变更时）、受影响 personalVersion、审计与幂等结果在同事务提交。管理员只调整公共范围且不改变个人确认依据时，可以保留个人确认，但必须把其 confirmationReportVersion 绑定提交后的 rowVersion；发生个人有效集变化时相应 personalVersion 也更新。审计至少持久化操作者 ID/角色、action、reason、时间、前后状态、rowVersion/publicRevision、公共/个人/配置相关版本与可展示的变更摘要；只有 before/after hash 不足以支持后台。

首次核实示例：

```json
{
  "expectedVersion":3,"action":"verify","reason":"A separate field check confirmed the obstruction.",
  "extraEvidence":{"kind":"field_observation","observedAt":"2026-10-17T03:10:00Z","summary":"An administrator independently checked this passage."},
  "publicAvoidGeometry":{"type":"Polygon","coordinates":[[[151.2300,-33.9173],[151.2302,-33.9173],[151.2302,-33.9175],[151.2300,-33.9175],[151.2300,-33.9173]]]},
  "validUntil":"2026-10-18T03:10:00Z"
}
```

这只是输入结构；不能作为已发生现场核查的证据。状态不允许、证据不足或几何不合法时返回错误，不能部分公开。

## 9 路线与有效性

### 9.1 `POST /api/routes`

保持原技术文档的参数名和单位，不另造 frontend/server 两套字段：

```json
{
  "start":[151.2290,-33.9170],"end":[151.2330,-33.9180],"profile":"wheelchair",
  "restrictions":{"maximum_incline":6,"maximum_sloped_kerb":0.06,"minimum_width":0.9}
}
```

`start`、`end`、`profile`、`restrictions` 及上述三个 restriction 字段全部必填。profile 仅允许 wheelchair，限制值须在 region 下发白名单内，拒绝未知字段。客户端不提交 avoid_polygons、个人报告 ID 列表、全局几何、版本或缓存 scope。所有有效公共障碍与本会话有效个人避让由服务器读取。

```ts
type RouteDTO = {
  route: {
    type: "FeatureCollection";
    features: [{ type: "Feature"; geometry: LineString; properties: Record<string, never> }];
  };
  distanceM: number; durationS: number;
  hazardVersion: number; personalVersion: number; configVersion: Version;
  activeDigest: string; routeRef: Id; routeRefExpiresAt: Instant;
  routingScope: "public" | "personal"; personalValidUntil: Instant | null;
  avoidedReportIds: Id[]; computedAt: Instant;
  source: "ors"; cacheHit: boolean; warnings: string[];
};
```

成功 200 返回 RouteDTO；MVP 只返回一条候选 LineString，不提供多路线比较 API。以下坐标和数值仅为合法响应结构示例，不代表该直线已满足路线验证：

```json
{
  "data": {
    "route":{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"LineString","coordinates":[[151.2290,-33.9170],[151.2300,-33.9168],[151.2330,-33.9180]]},"properties":{}}]},
    "distanceM":680,"durationS":620,
    "hazardVersion":12,"personalVersion":3,"configVersion":2,
    "activeDigest":"sha256:effective-set","routeRef":"route-01","routeRefExpiresAt":"2026-10-17T03:15:00Z",
    "routingScope":"personal","personalValidUntil":"2026-10-17T04:00:00Z",
    "avoidedReportIds":["report-01"],"computedAt":"2026-10-17T03:00:00Z",
    "source":"ors","cacheHit":false,
    "warnings":["This route includes your temporary avoidance, which is not publicly verified.","Some path information may be incomplete."]
  },
  "requestId":"req-route"
}
```

`routingScope=personal` 表示至少采用一个本会话有效个人避让；personalValidUntil 是其中最早到期时间。无个人避让为 public、personalValidUntil=null。avoidedReportIds 仅包括本次实际采用的公共与本人报告，不包括他人个人报告。warnings 为经过服务端控制的英文说明，不回传供应商原始错误内容。

### 9.2 成功发布前必须完成的检查

1. 校验输入、区域与白名单，在一致快照读取 hazardVersion、personalVersion、配置和 activeDigest；公共项来自 publicRevision 标识的公共发布快照，个人项才绑定本会话私有 rowVersion/确认版本。读取失败时不能把未知避让集当空集。
2. 解析并合并有效公共/个人几何。端点落入有效避让范围返回 ENDPOINT_BLOCKED；超限拒绝，不删除障碍。无障碍时省略供应商 avoid_polygons，不传空 Polygon。
3. 查询匹配上下文的缓存或同键在途请求；真实调用须先取得共享 ORS 预算。请求保留相同起终点与限制，永不通过删障碍/放宽条件重试。
4. 校验上游 FeatureCollection，转换为唯一非空、至少两点的 LineString；distanceM/durationS 非负有限；路线与吸附端点在区域内、吸附偏差不超过实际配置、路线不穿越有效避让几何。无有效结果不得返回空 features 的成功。
5. 发布前重读双版本、有效集和影响路由的配置。变化则丢弃旧结果，有预算时至多重算一次，否则 `409 ROUTE_STALE`；不能发布已知过期结果。
6. 为本会话创建最长 900s 的 routeRef。即使公共几何缓存命中，也分别建立会话 routeRef，不把别人的凭据或个人上下文装入共享缓存。

业务缓存键规范化包含区域、供应商/适配器版本、输入、scope、hazardVersion、personalVersion 和 activeDigest。公共摘要与缓存只依赖公共发布快照及 publicRevision，不读取私人 rowVersion；作者个人动作不会使其他会话的公共缓存失效。没有个人避让时可共享几何，键中 personalVersion 规范化为 0，但响应附本会话真实版本；有个人避让时缓存及在途去重都按会话隔离。路线缓存最长 60s，且不超过有效避让最早到期。缓存命中也重查有效性；过时路线不能作为实时成功降级。

## 10 区域配置、调用摘要与导出

### 10.1 `GET/PATCH /api/admin/region`

仅 operator 可读写，GET 200 返回 `{region:RegionDTO,presetPassages:PresetPassageDTO[]}`，其中 `region.configVersion` 是写入所需版本。

PATCH 携带幂等键、配置 expectedVersion、reason 和至少一个实际修改项：

```ts
type RegionPatchInput = {
  expectedVersion: Version; reason: string;
  changes: {
    name?: string; timezone?: string; bbox?: BBox;
    isDemo?: boolean; avoidanceBufferM?: number;
    presetPassages?: { id?: Id; name: string; geometry: LineString }[];
  };
};
```

`presetPassages` 若提供，为完整替换清单，省略则不修改；已有项必须带现有 id，新项省略 id 由服务器生成；不接受客户端 passageVersion。服务端比较实际内容，新增版本为 1，修改项增 passageVersion，未改项保留版本，删除项不再可引用。整个配置由 configVersion 防并发覆盖。

```json
{
  "expectedVersion":2,"reason":"Adjust the buffer for the validated campus passage.",
  "changes":{"avoidanceBufferM":2.5,"isDemo":true}
}
```

配置及通道写入 PostgreSQL，重启后保留。D 校验 bbox、通道、缓冲与现有报告/确认的影响；C 在同一事务保存配置版本、必要上下文版本、审计和幂等结果。会使现有有效几何或确认失去合法性的修改返回 `409 CONFIG_CONFLICT`，`details` 仅向 operator 给出需先处理的报告 ID；不静默裁切、移动或重写已确认几何。

仅影响未来缓冲计算的修改不重写已确认几何，但使旧预览失效；影响地理约束/路由的合法修改增加 hazardVersion，使在途结果与相应缓存失效。名称/时区/演示等展示变更增加 configVersion 以刷新展示，不无条件增加所有 personalVersion。成功 200 返回与 GET 相同结构。TTL、供应商密钥、路线参数白名单仍由部署运营配置管理，不借此接口增加通用系统配置编辑器。

### 10.2 `GET /api/admin/usage-summary`

report_admin/operator 可读，无自定义时间参数，固定最近 24h，不返回密钥、指纹、Cookie、私有位置或行程：

```json
{
  "data": {
    "windowStart":"2026-10-16T03:00:00Z","windowEnd":"2026-10-17T03:00:00Z",
    "services": {
      "ors":{"calls":12,"waits":2,"errors":1,"cacheHits":5},
      "vision":{"calls":4,"waits":0,"errors":1,"cacheHits":2}
    }
  },
  "requestId":"req-usage"
}
```

四项均为非负整数真实聚合：calls 统计实际上游尝试（重试各计一次），waits 统计预算/频率门禁导致的等待拒绝事件，errors 统计真实上游调用失败及无效结果，cacheHits 统计业务结果复用。去重等待者不能重复算真实调用；合法 uncertain AI 结果不算上游错误。无记录返回 0；不能用预算余额、fixture 或页面访问量冒充摘要。不增加外部监控栈。

ORS、Vision、Geocoding 的原子预算按服务与密钥共享持久化；重启不清空，网络请求在事务外，重试必须重新预留。POI 调用也遵循其独立服务预算，不借 Directions 额度。本摘要只展示本次要求的 ORS/AI 两项。

### 10.3 `GET /api/reports/{id}/export`

读取权限与报告详情相同。成功 200 返回 `text/html; charset=utf-8` 的可打印报告页，复用 B 的无浏览器依赖纯展示模板；不提供额外 PDF 生成接口。作者/管理员可展示 PrivateReportDTO 对应内容和授权图片入口；公开读取只基于 PublicReportDTO，默认无图、无原始 AI/内部证据。

页面显示编号、事实、观察时间、AI/人工标识（私有范围）、个人/公共影响与有效期、来源及数据限制；用户和模型文本全部转义。配合 private/no-store 与 X-Request-Id；越权/不存在返回 JSON 404。不得出现未执行的市政提交或修复声明。

### 10.4 `GET /api/health`

成功 200 返回 `{data:{status:"ok"},requestId}`。仅表明应用存活，不暴露内部配置、密钥、数据库连接、模型权限或各外部服务状态，不以此宣称部署全链路通过。

## 11 错误语义与关键失败

| HTTP | error.code | 调用方行为 |
| --- | --- | --- |
| 400 | INVALID_INPUT / INVALID_GEOMETRY | 保留输入；details.fields 可给 `{path,message}` 列表 |
| 401 | UNAUTHENTICATED | 初始化匿名会话或使用 Payload 登录，不能自动找回旧报告 |
| 403 | FORBIDDEN | 权限/来源不足，不自动重试 |
| 404 | NOT_FOUND | 不存在或不可见，不泄露私人对象存在性 |
| 409 | VERSION_CONFLICT | 读取当前记录，保留编辑并重新预览/确认 |
| 409 | IDEMPOTENCY_CONFLICT | 同键不同请求；修正客户端键使用 |
| 409 | ROUTE_STALE / ANALYSIS_STALE / PREVIEW_STALE | 丢弃过时结果，按当前输入重算、分析或预览；不启用避让 |
| 409 | INVALID_TRANSITION / CONFIG_CONFLICT | 不允许当前状态动作或配置破坏有效数据，显示明确原因 |
| 413 / 415 | FILE_TOO_LARGE / INVALID_MEDIA | 显示文件大小、格式或解码限制 |
| 422 | NO_ROUTE / ENDPOINT_BLOCKED / SNAP_TOO_FAR / OUT_OF_COVERAGE | 调整入口/起终点；不得自动放宽限制 |
| 422 | CONFIRMATION_REQUIRED / INVALID_PASSAGE / EVIDENCE_REQUIRED | 补齐明确同意、合法通道或独立证据，不部分提交 |
| 429 | RATE_LIMITED | 含 Retry-After 响应头和 details.retryAfterSec，显示倒计时 |
| 503 | QUOTA_EXHAUSTED / PROVIDER_UNAVAILABLE | 稍后再试；已知时 details.resetAt 给重置时间 |
| 502 / 504 | INVALID_PROVIDER_RESULT / PROVIDER_TIMEOUT | 外部结果无效/超时；保留输入 |
| 500 | INTERNAL_ERROR | 一致性写入回滚，保留输入，提供 requestId |

不接受或无法解析的 HTTP 方法按框架返回 405，但错误体仍采用可控的 JSON 包络。所有 details 均走白名单，不能透传数据库错误、供应商 body、内部 SQL、照片对象键或会话信息。

上游 403 只有明确配额错误才映射 QUOTA_EXHAUSTED；401 或其他 403 属供应商鉴权/配置不可用，映射 PROVIDER_UNAVAILABLE 并在后台记脱敏错误类别，不能提示用户登录 AccessLoop 或一律说额度不足。超时/5xx 或上游 429 至多一次有限重试，每次重新取预算；配额与鉴权错误不自动重试。前台等待总时长目标不超过 15s，不能无限排队。analyze 已被接纳后的模型失败按 §5.3 返回 unavailable，路由/搜索等仍按本错误表返回失败。

版本冲突和限流示例：

```json
{"error":{"code":"PREVIEW_STALE","message":"This preview has expired. Review the updated area before confirming."},"requestId":"req-stale"}
```

```json
{"error":{"code":"RATE_LIMITED","message":"Please wait before trying again.","details":{"retryAfterSec":12}},"requestId":"req-wait"}
```

## 12 实现来源与内部交接

组件、后台挂载、导出模板、仓储、地理与预算的跨包交接在 [COLLABORATION.md 的内部交接约定](COLLABORATION.md#4-最小内部交接)单一维护，本文只定义它们使用的 DTO 与接口语义。

实现后 `src/shared/contracts/` 的运行时 Schema 是字段定义的执行来源，本文保留对外语义和例子；DTO 白名单、所有枚举、错误、fixture、调用方和本文必须在同一接口交接中同步。只按本文最小 P0/P1 输入输出实施，不新增公众账号、任意个人多边形、公共原图、自动公共核实或通用管理 CRUD。


## 13 D 服务阶段接入状态（2026-10-17）

D 的可执行 DTO 现位于 `src/shared/contracts/{geo,region,route-result,routing}.ts`，实现记录见 [D 服务交接](../handoffs/d-service-integration.md)。该交接只描述接线；HTTP 语义仍由本文维护。`RoutingRepository` 是 C 单一 Payload 仓储的内部端口，预算和 routeRef 原子提交必须由真实持久化实现满足；只有接口和测试替身不计持久化通过。供应商请求固定在官方 HeiGIT HTTPS 路径，搜索按来源白名单和 bbox 二次过滤；没有结果与上游失败保持不同语义。
