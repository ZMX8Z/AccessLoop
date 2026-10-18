# A 当前交接：Stitch 与真实公众页面整合（2026-10-18）

本节替代下方历史阶段的“当前入口”。A 固定分支 `codex/a-frontend-map`，独立目录 `/Users/coreyli/.codex/worktrees/accessloop-a-fixes/AccessLoop`；入口仓库 dev 未开发。开始时工作树干净、无 merge，应用会话清单没有其他活跃 A 会话；成功 fetch 后从 `4678661` 快进到最新 dev。没有 reset/stash/rebase/强推或切换其他包分支。

- baseDevCommit：`526b2f4265391ea5f433f7a70efccd34eae30ffd`（含 #20）。
- codeEvidenceCommit：`b288bd90902ca33d5a1720d413b3029551d9d4b9`。初始独立受检 `3b128b5`，三项 P2 修复受检 `7d19b6e`，字体/恢复受检 `e7ff5e9`，最终M1收紧受检 `b288bd9`；完整证据见验收。
- 阶段PR：[全六屏真实页面整合 #21](https://github.com/ZMX8Z/AccessLoop/pull/21)，已推送并附加，base=`dev`，由D统一集成，尚未合并。
- deliveryHead：由本阶段 PR 正文的最终 head SHA 固定；后续仅文档/截图提交不冒充产品证据提交。PR base=`dev`，D 统一集成，本会话不合并。
- 实际生产入口：[localhost:3121/route](http://localhost:3121/route)，APP_BASE_URL 与 origin 一致。仅替换本会话的 3121 进程，原 3000 服务未停止。

## 原稿 → React → 接口 → URL

| 原稿 | 实现 | 唯一真实接口 | 当前 URL |
| --- | --- | --- | --- |
| R1 compact preview | 持久 RoutePlanner、MapView/Leaflet、页内搜索/参数/图层面板 | region、places、passages、search、routes、routing-context | `/route`；`/`、`/live` 重定向这里 |
| R2 active journey | 同一地图实例、路线摘要和真实 LineString 参考节点 | 沿用 R1 结果，不新增 Directions | `/route/journey`；缺当前路线显示守卫 |
| P1 photo | B PhotoUpload，单按钮私有上传后分析或明确人工继续 | session、uploads | `/report` |
| P2 AI scan | B ReportWizard/AIAnalysisFeedback/ReportForm/AvoidanceDrawer | analyze、reports、avoidance-preview、avoidance | `/report/confirm`；缺照片显示守卫 |
| P3 submitted | 实际报告编号、当前个人/公共范围 | 服务端保存/确认结果；刷新只读校验本人有效记录 | `/report/success/[id]` |
| M1 my reports | B ReportsList，All/Active Detour/Resolved | reports?scope=mine；公共历史明确单独切换 | `/my-reports` |
| M2 / R3 | B ReportDetail，授权读取、修正、启停/续期、复制/打印 | reports/[id]、photos/[id]、export 及既有命令 | `/my-reports/[id]`、`/route/barriers/[id]` |

兼容：`/reports`→`/my-reports`，`/reports/new`→`/report`，`/reports/[id]`→`/my-reports/[id]`。`/preview` 是明确标识的合成服务回归入口，提供迟到响应/公共有效集控件；`/stitch/*.html` 仅保留 Design Demo 设计参考，不是默认公众入口。真实页不使用 iframe、整页 HTML 注入、public/stitch/app.js 或 sessionStorage 报告。

## 状态与边界

PublicApp 在 Next layout 持有 RoutePlanner；普通 Link、Tab 和步骤只改变可见页，保持路线输入、轮椅限制、照片/表单及列表筛选。路径变化在渲染新页前关闭旧面板并捕获报告来源，结束行程回 R1。P1/P2 为无 Tab 专注步骤，P3 恢复 Report 高亮。新一轮报告重置已完成记录，不重放旧提交。

迁移前列出的行为已逐项保留：唯一请求/匿名 Cookie；同源业务接口；坐标[经度,纬度]与米/百分比；真实350ms搜索、防抖取消；显式规划与等待/失败保留输入；5秒 context 版本/activeDigest 屏障；自然过期与 routeRef 到期；区域配置变更立即清旧设施，刷新失败不能复活；地图来源许可/unknown/不完整库存；瓦片失败跟踪、销毁清理和标记焦点；双通道引用、自动后端预览、明确同意、幂等与会话隔离。

新增真实规划结果只聚焦一次；时钟、轮询、Tab 及面板不重置视口，也不调用 Directions。长时间上报/非可见 Route 时暂停未变化设施源的定时刷新；context 和报告仍5秒读取，配置变化仍立即更新配置/通道。回 Route 后按原一分钟设施节流刷新。

P3 刷新恢复仅允许：无本地/上传草稿、无当前报告，服务端详情为 PrivateDTO、本人列表明确含 ID、当前个人确认有效。公共、管理员可读但本人列表不含、截断未含、已停用/过期、仅保存或读取失败仍显示守卫；不通知 onChanged、不写入、不调用供应商。新草稿和换 URL 会取消旧恢复请求。

## 设计核对与真实数据差异

六份原始 code.html/screen.png 和 DESIGN 已实际读取/查看，原文件未修改。顶部品牌、teal/lavender/mint、浮动搜索、地图主视图、白色圆角摘要、三 Tab、三步进度、成功图标和列表筛选按原稿恢复。Inter 可变字体及 OFL 从 Google Fonts 官方仓库本地提供，不新增 package/lockfile 依赖。桌面使用地图/摘要分栏，360px 地图优先、面板85dvh内滚动，触控至少44px并保留底部安全区。

- 原稿假坡度/照片测宽/98% Match/Audio/已到达/安全保证均省略或写未知；请求限制不冒充测量。
- R2 只显示实际路线几何参考节点及坐标，没有实时导航或经过节点判定。
- P2 因真实观察时间、坐标、通道、后端预览与明确同意比静态稿更长，全部可滚达；不固定高度裁提交。
- P3 显示真实 UUID 及个人有效期，没有校园派工或公共发布假成功。
- 本轮上传图片明确写 SYNTHETIC UI TEST / NOT FIELD EVIDENCE；预设通道为后端既有 synthetic 通道，不能算校园现场核验。

## 跨包修改与交接

A 本轮按用户授权修改 `hazards/client/**` 的布局、步骤、规范链接和客户端衔接，保留 B 的 ReportForm/AvoidanceDrawer/api.ts 请求与确认语义。详情变更派发 `accessloop:reports-changed`，父路线立即失效，列表刷新；路径与用法已同步 B 交接。没有修改 C 的 Collections/迁移/仓储/鉴权或 D 的路由/供应商服务、依赖和构建配置。README 和地图部署说明仅修正入口事实，列为 D 合并时需接收的文档改动。

实际命令、浏览器、双会话和失败证据见 [当前 A 验收](../acceptance/wp-a.md)。人工只按 [A MANUAL](../work-packages/a-frontend-map/MANUAL.md) 点击。

---

## 以下为保留的历史交接

# A 交接：Stitch 三 Tab 页面与公共客户端

2026-10-17。阶段范围：用户指定的原始 Stitch HTML、最新页面架构和已有公共客户端代码上传。P0/P1 真实整包尚未通过；不是部署交付。

## Git 基线与归属

- 仓库：ZMX8Z/AccessLoop；分支 `codex/a-frontend-map`；PR 目标 `dev`，由 D 串行集成。
- baseDevCommit：`d3e06bded36f2ca4cef98cd2a802dc633acf8a01`，由已登录的 GitHub Desktop fetch 后核实。
- 从用户新 clone 的最新 dev 创建 A 固定分支；保留原本 `origin/codex/a` 本地分支。
- 仅迁入离线交付清单中的 50 个文件；已有文件中只替换公众首页与全局样式，两者在 dev 与原始 ZIP 基线一致。其余均为新增文件。
- 未修改 package.json、lockfile、后端、数据库迁移、Payload 或其他包交接文档。
- 代码提交、PR 和本轮检查结果见 [A 验收记录](../acceptance/wp-a.md)。

## 页面入口与用户要求

- `/` 与 `/preview` 进入 `/stitch/route.html`。Route / Report / My Reports 三个主要 Tab 派生下属页面。
- R1 内 Start Journey 按钮切换至 R2；R2 保留同一示例地图，显示路线节点，支持暂停、上报和结束行程。
- P1 → P2 → P3 支持本地照片选择、人工修正、校验和保存演示记录；M1/M2 提供列表、筛选、详情和打印。
- `/live` 保留已有 React 真实 API 消费界面；仍需和最新 C/D 后端联调。
- 原始 HTML、六屏截图和设计文件在 `docs/design/stitch/source/`。页面架构以用户修改的 `docs/design/AccessLoop_页面架构_Stitch.md` 为准。
- 具体映射、生成方式和限制见 [Stitch 三 Tab 交接](stitch-pages-v2.md)。报告页为用户明确要求的视觉交互样例，正式报告功能继续由 B/C 接入。

## A → B 共用接口

`src/shared/client/api.ts`：

- `await ensureSession()`：初始化/复用匿名 Cookie，会话失败可重试；`resetSession()` 用于失效后重新初始化。401 不自动重放写请求，不能恢复旧报告归属。
- `request(path, zodSchema, RequestInit)`：同源业务请求，no-store，成功包络解析，`ApiError(code,message,requestId,retryAfterSec)`；15s 请求超时。支持 multipart，避免错误写入 Content-Type。
- `createIdempotencyKey()`：一次业务动作创建一个键，重试相同操作复用；新动作另建。
- `LatestRequest.begin()` 返回 signal/current()；变更输入时 cancel()，异步结果仅 current() 为真才应用。

`src/components/map/PassagePicker.tsx`：controlled 组件。

```tsx
<PassagePicker
  bbox={region.bbox}
  location={form.location}
  route={currentRoute}
  passages={presetPassages}
  value={form.passage}
  preview={preview?.avoidGeometry ?? null}
  now={nowMs}
  onLocationChange={location => updateForm({ location })}
  onChange={passage => updateForm({ passage })}
/>
```

- `PassageRef` 直接复用 `src/shared/contracts`，不提交任意个人多边形；支持 routeRef + 两端包含索引及 presetPassageId + passageVersion。
- nowMs 由父组件定时更新；过期 routeRef 禁用。B 应只传未过时路线，并在上下文/位置/观察时间/通道变更时取消旧预览。
- B 持有报告表单及当前已保存报告版本；选择变更后按 API_CONTRACTS §7.3 自动请求预览，将返回几何传入 preview；组件不自行请求报告、保存或确认避让。
- 位置支持地图及键盘可用的经纬度表单。收到 preview 只展示范围；明确 consent 由 B 负责。
- `MapView` 可单独作为位置、路线和预览视图；GeoJSON 统一 `[longitude, latitude]`。

`src/features/routing/client/models.ts` 已直接复用 D 正式发布的共享响应 Schema。C 尚未发布完整报告响应 Schema，仅保留最小报告图层投影；后续随 C 正式实现归并，不修改 HTTP 契约。

## 验证与人工点击

本轮基于最新 dev 执行全项目 ESLint、生产构建（含 TypeScript）及测试，结果见验收记录。
前次浏览器已验证三 Tab、R1 → R2 保留地图、报告校验/保存/列表、Resolved 筛选和 360px 无横向溢出。相关静态 HTML/JS/CSS 本轮迁入时保持原样；截图位于 `docs/acceptance/screenshots/stitch-v2/`。

人工打开 `/`，点击 Start Journey，检查地图和路线节点；再点击 Report Barrier，选样例照片，修正并保存演示报告，检查 My Reports 列表和详情。所有页面明确显示 Design Demo。

## 未完成与交接边界

- Stitch 页面仅为浏览器 sessionStorage 交互演示，不调用真实上传、GLM、ORS 或公共发布服务。
- 地图是本地 SVG 示意图，地点、节点、距离及照片样例不代表实测；不能用于真实导航。
- `/live` 的真实搜索/规划、个人绕行和公共管理双会话同步尚未与当前 C/D 服务验收。最新 dev 已包含会话和路由后端，不再沿用旧 ZIP 的“仅 health 接口”判断。
- 独立验收、D 合并和部署尚未完成；本次仅上传已完成的阶段成果。


## D 协助修复与复验（2026-10-17）

用户授权 D 帮 A 修复，保留原固定分支和 PR #11 历史。同步 baseDevCommit=`9997880921d65739d9efd3bfc3bd507385e57d58`，codeEvidenceCommit=`a83ddf5b2fad948bf1b837666ad2f224e373c6cd`；交付 head 由 PR 元数据固定。

- 生成器移除根元素固定宽高与纵向裁切。360×800 浏览器实际从 Route → Report → 样例图 → Confirm，scrollWidth=360、scrollY=632.5、提交按钮 top=609.8；填写字段并提交后显示 Demo Report Saved。见[修复截图](../acceptance/screenshots/pr-11-mobile-fixed.png)。这是本地 Design Demo 保存。
- PassagePicker 只复用当前 routeRef 的合法整数索引；换路线重置，发出前检查当前点数。
- D 响应校验直接引用共享 Schema，修复版本0、空几何、时区偏移时间三项漂移。
- poll/plan 共用上下文发布屏障；观察到变化立即取消在途规划；区域参数与相同配置版本的上下文一起发布。自然到期产生的新有效集仍可推进。
- 回归直接执行实际组件处理器；迟到规划、配置参数不匹配和等待区域期间旧规划三种交错均先失败后通过。独立 Standards/Spec 复核通过；固定提交的完整检查见验收记录。

此修复不改变 A0 阶段范围。真实报告、个人绕行、公共管理与双会话、Zenith 和 P0/P1 总验收仍待后续接线。
