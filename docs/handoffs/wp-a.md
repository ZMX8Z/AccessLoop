# A 交接：Stitch 三 Tab 页面与公共客户端

2026-10-17。阶段范围：用户指定的原始 Stitch HTML、最新页面架构和已有公共客户端代码上传。P0/P1 真实整包尚未通过；不是部署交付。

## Git 基线与归属

- 仓库：ZMX8Z/AccessLoop；分支 `codex/a-frontend-map`；PR 目标 `dev`，由 D 串行集成。
- baseDevCommit：`5e4867d8b6141aacbc8fc4988f4aa41287bd370a`，由已登录的 GitHub Desktop fetch 后核实。
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

`src/features/routing/client/models.ts` 是当前最小共享骨架缺少响应 Schema 时的客户端运行时校验，字段取自 authority，不修改 HTTP 契约。C/D 发布正式响应 Schema 后应归并到共享入口，避免长期两套执行定义。

## 验证与人工点击

本轮基于最新 dev 执行全项目 ESLint、生产构建（含 TypeScript）及测试，结果见验收记录。
前次浏览器已验证三 Tab、R1 → R2 保留地图、报告校验/保存/列表、Resolved 筛选和 360px 无横向溢出。相关静态 HTML/JS/CSS 本轮迁入时保持原样；截图位于 `docs/acceptance/screenshots/stitch-v2/`。

人工打开 `/`，点击 Start Journey，检查地图和路线节点；再点击 Report Barrier，选样例照片，修正并保存演示报告，检查 My Reports 列表和详情。所有页面明确显示 Design Demo。

## 未完成与交接边界

- Stitch 页面仅为浏览器 sessionStorage 交互演示，不调用真实上传、GLM、ORS 或公共发布服务。
- 地图是本地 SVG 示意图，地点、节点、距离及照片样例不代表实测；不能用于真实导航。
- `/live` 的真实搜索/规划、个人绕行和公共管理双会话同步尚未与当前 C/D 服务验收。最新 dev 已包含会话和路由后端，不再沿用旧 ZIP 的“仅 health 接口”判断。
- 独立验收、D 合并和部署尚未完成；本次仅上传已完成的阶段成果。
