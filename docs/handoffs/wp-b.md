# 工作包 B 交接：上报、避让与管理交互前端

日期：2026-10-17。
责任人：B（前端第二成员）。
工作分支：`codex/b-frontend-reports`。
baseDevCommit：`1ad24d707370a80fb0dc11da20b7e55be6d310c7`。

---

## 一、已交付内容与架构清单

### 1. 契约模型与测试套件 (`src/shared/contracts/` & `tests/`)
- **严格 Schema 实现**：[`src/shared/contracts/hazards.ts`](../../src/shared/contracts/hazards.ts)
  - `UploadResponseDataSchema`：图片上传响应。
  - `VisionResultSchema` / `AnalysisDTOSchema`：AI 分析状态机（`completed` / `uncertain` / `unavailable`）。
  - `CreateReportInputSchema` / `PatchReportInputSchema`：事实采集及修改输入。
  - `AvoidancePreviewDTOSchema` / `AvoidanceConfirmInputSchema`：避让预览摘要令牌与强制 `consent: true`。
  - `PrivateReportDTOSchema` vs `PublicReportDTOSchema`：严格输出白名单，脱敏防隐私泄漏。
  - `ReviewInputSchema`：支持管理侧 5 种审核命令（`verify`, `correct`, `reject`, `resolve`, `reopen`）的判别联合类型。
  - `UsageSummaryDataSchema`：24 小时服务调用指标。
- **单元测试**：[`tests/hazards.test.ts`](../../tests/hazards.test.ts)，新增 8 组测试，与原有测试共计 **30/30 全绿**。

### 2. P0 客户端交互组件 (`src/features/hazards/client/`)
- [`PhotoUpload.tsx`](../../src/features/hazards/client/PhotoUpload.tsx)：拍照/相册选择、格式体积门禁、AI 授权前置勾选。
- [`AIAnalysisFeedback.tsx`](../../src/features/hazards/client/AIAnalysisFeedback.tsx)：识别类别、通行程度、视觉证据展示、不确定项提示及人工降级。
- [`ReportForm.tsx`](../../src/features/hazards/client/ReportForm.tsx)：事实收集（类别、描述、UNSW Kensington 坐标、受影响通道）、防竞态控制（用户编辑不被迟到 AI 覆盖）。
- [`AvoidanceDrawer.tsx`](../../src/features/hazards/client/AvoidanceDrawer.tsx)：自动请求预览多边形、展示有效期与防伪令牌、强制勾选 consent 激活个人避让、随时撤销或续期。
- [`ReportWizard.tsx`](../../src/features/hazards/client/ReportWizard.tsx)：P0 完整串联向导。
- [`ReportsList.tsx`](../../src/features/hazards/client/ReportsList.tsx)：本人上报与公共已核实报告双视图。
- [`api.ts`](../../src/features/hazards/client/api.ts)：标准化客户端 API 客户端，封装幂等键生成、错误包络解析及前后端解耦的独立 Fixture 降级保护。

### 3. P0 纯展示打印导出模板 (`src/features/hazards/server/`)
- [`export-template.tsx`](../../src/features/hazards/server/export-template.tsx)：无浏览器依赖的纯服务端渲染打印模板，包含编号、状态、事实、避让有效期、转义防 XSS 与官方声明。

### 4. P1 后台管理自定义组件 (`src/components/admin/`)
- [`AdminHazardReview.tsx`](../../src/components/admin/AdminHazardReview.tsx)：原始 AI vs 用户修改对比、5 种受保护管理动作表单，409 版本冲突保留输入。
- [`AdminRegionConfig.tsx`](../../src/components/admin/AdminRegionConfig.tsx)：区域参数、预设通道清单、避让缓冲距离（0.5m-5.0m）与演示标识配置表单。
- [`AdminUsageSummary.tsx`](../../src/components/admin/AdminUsageSummary.tsx)：24 小时 ORS 与 Vision 调用数、等待数、错误数、缓存命中聚合卡片。
- [`index.ts`](../../src/components/admin/index.ts)：统一导出供 C 在 `/admin` 挂载。

### 5. 公众页面路由 (`src/app/(frontend)/`)
- `/reports/new`：上报障碍物向导页面。
- `/reports`：报告列表（本人 vs 公共展示）。
- `/reports/[id]/export`：服务端渲染的授权打印凭证页面。
- `/admin-preview`：管理端自定义组件本地预览与交互测试页面。
- `/`：首页更新快速导航入口。

---

## 二、实际质量检查记录

1. `pnpm check`（ESLint + TypeCheck + 31 单元测试）：**全部通过 (0 errors, 0 warnings)**。
2. `pnpm build`（Next.js Webpack 生产构建）：**构建成功，所有页面生成完成**：
   - `○ /` (Static)
   - `○ /reports` (Static)
   - `○ /reports/new` (Static)
   - `○ /admin-preview` (Static)
   - `ƒ /reports/[id]/export` (Dynamic)

---

## 三、交接说明

### 1. 致后端 C：
- 管理后台自定义组件位于 `src/components/admin/`，已通过 `index.ts` 导出。请在 `src/payload.config.ts` 中的 `hazard-reports` 集合视图中挂载 `<AdminHazardReview />`，在 dashboard 挂载 `<AdminUsageSummary />`。
- 打印导出模板 `ReportExportTemplate` 可在服务端 `GET /api/reports/{id}/export` 路由中作为 HTML 直接流式返回。

### 2. 致前端 A：
- 公众页面使用了与主站兼容的标准语义化 HTML 与内联容器布局，可无缝承载您迁移的 Stitch 全局 CSS 变量与设计规范。

---

## 四、120 秒 Hackathon 演示稿大纲

- **00-20s [痛点引入]**：轮椅使用者出行常遇临时封路或施工，传统地图更新缓慢。
- **20-50s [现场上报与 AI 识别]**：进入 `/reports/new` 拍下 UNSW Kensington 图书馆坡道障碍，GLM 视觉模型秒级提取阻断证据与障碍类别。
- **50-80s [个人实时避让闭环]**：无需等待市政漫长审核，用户勾选“明确避让同意”，系统瞬间生成避让多边形并激活会话避让，重算无障碍绕行路线。
- **80-105s [打印凭据与公共发布]**：点击 `/reports/:id/export` 打印带凭证号的无障碍证明；展示管理员在 `/admin` 中完成现场复核并向全校发布。
- **105-120s [总结]**：AccessLoop 实现了真正保护隐私、端到端闭环的实时无障碍路线修正。
