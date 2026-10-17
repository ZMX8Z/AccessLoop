# 工作包 B：上报、报告与管理交互前端

**负责人：**B：第二名前端成员。

本包必须交付完整 P0 与 P1。P0 是阶段交付，P1 为必交；本目录是待执行工作说明，不表示功能、部署或验收已完成。

本包固定分支为 `codex/b-frontend-reports`；创建基准、持续同步来源和 PR 目标均为 `dev`。开发前必读 [COLLABORATION.md](../../authority/COLLABORATION.md)，按其完成分支/工作目录预检与安全同步，使用独立 clone/worktree 并复用已归属本包的分支；禁止在同一工作目录并发切换分支或直接在 `dev`/`main` 开发。A/B/C 交付技术验收通过的阶段 PR，由 D 按协作约定串行集成到 `dev`。用户已授权最终集成；详细合并和平台保护处理以该协作约定为准。

## 开始与交付

1. 先读根 [AGENTS.md](../../../AGENTS.md) 与 [authority 入口](../../authority/README.md)。
2. 开发会话复制 [START.md](START.md) 的完整提示词；独立验收会话复制 [ACCEPTANCE.md](ACCEPTANCE.md)。
3. 开发时写入 `docs/handoffs/wp-b.md`；技术验收时写入 `docs/acceptance/wp-b.md` 并记录 `dev` base/head 与证据提交。这两个路径是执行时产物。
4. AI 准备页面入口、演示数据和必要账号后，人工使用 [MANUAL.md](MANUAL.md) 只检查页面功能、界面和文案。

## P0/P1 责任

| 阶段 | 本包负责 |
| --- | --- |
| P0 | 照片上传、AI 证据/用户修正、报告保存、自动预览及明确确认、个人避让启停/续期、人工降级、复制打印及演示稿。 |
| P1 | 脱敏公共报告展示；真实 Payload Admin 中的证据地图、核实/重新核实/纠错/驳回/解除/重开表单、只读审计、区域配置与调用摘要界面。 |

- [ ] B0/P0：照片、分析修正、报告保存、自动预览/确认、人工降级。
- [ ] B1/P0：本人报告、启停和重新确认、复制打印及演示脚本。
- [ ] B2/P1：公共报告展示；Payload Admin 证据/地图、核实/纠错/驳回/解除/重开表单。
- [ ] B3/P1：区域配置、简单调用摘要、审计展示及与 C 的正式后台挂载联调。

## 本包目录与文件所有权

下表沿用技术文档的规划目录；以 D 骨架交付的实际布局核对文件清单，在 `routing`/`hazards` 内分开 client/server。共享修改先按 [协作约定](../../authority/COLLABORATION.md) 交接给唯一负责人。

| 目录或文件 | 本包边界 |
| --- | --- |
| `src/app/(frontend)/` 中上报/报告功能页面 | 沿用 A 的公众外壳与视觉，不改共享页面外壳。 |
| `src/features/hazards/client/` | 上报、报告、确认及个人状态的客户端交互。 |
| `src/components/admin/` | 证据/地图、管理命令、区域配置与摘要自定义组件。 |
| 无浏览器依赖的导出展示模板及打印样式 | 实际目录随骨架确定；向 C 交付可服务端复用的导出。 |

## 依赖与最小交接

| 关系 | 可开始开发所需交付 |
| --- | --- |
| 依赖 A | Stitch 视觉、公共请求工具、地图与路线片段/预设通道/预览组件。 |
| 依赖 C | 上传、分析、报告、确认/导出、管理身份、管理命令和正式后台挂载。 |
| 依赖 D | 地理/配置验证、真实调用摘要；通过 C 的受保护管理接口消费。 |
| 交付 C/D | 向 C 交付纯展示模板、管理组件导出/注册说明；和 D 完成约 120 秒演示稿。 |

依赖未就绪时按权威契约用清楚标识的 fixture 继续独立任务；基础依赖按阶段 PR 交付，真实联调及外部服务验证按公共验收要求完成。

## 共用权威文档

公共规则只在以下资料维护，本包不复制其内容：

- [PROJECT.md](../../authority/PROJECT.md)：项目范围、共同决定与分工。
- [API_CONTRACTS.md](../../authority/API_CONTRACTS.md)：HTTP字段、权限、状态、版本和幂等语义；内部交接见 COLLABORATION。
- [COLLABORATION.md](../../authority/COLLABORATION.md)：分支、目录、共享修改、同步、阶段 PR 和集成流程。
- [ACCEPTANCE.md](../../authority/ACCEPTANCE.md)：共同技术验收、人工分工、检查点和总追踪表。
- [需求文档](../../authority/AccessLoop_需求文档_v1.0.md)、[技术文档](../../authority/AccessLoop_技术文档_v1.0.md)、[选型调研](../../authority/AccessLoop_开源后端与后台选型调研.md)：业务与架构依据；优先级按 [authority 入口](../../authority/README.md) 处理。
