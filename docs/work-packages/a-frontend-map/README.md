# 工作包 A：视觉、地图与路线前端

**负责人：**A：当前使用 Stitch 搭建页面的成员。

本包必须交付完整 P0 与 P1。P0 是阶段交付，P1 为必交；本目录是待执行工作说明，不表示功能、部署或验收已完成。

本包固定分支为 `codex/a-frontend-map`；创建基准、持续同步来源和 PR 目标均为 `dev`。开发前必读 [COLLABORATION.md](../../authority/COLLABORATION.md)，按其完成分支/工作目录预检与安全同步，使用独立 clone/worktree 并复用已归属本包的分支；禁止在同一工作目录并发切换分支或直接在 `dev`/`main` 开发。A/B/C 交付技术验收通过的阶段 PR，由 D 按协作约定串行集成到 `dev`。用户已授权最终集成；详细合并和平台保护处理以该协作约定为准。

## 开始与交付

1. 先读根 [AGENTS.md](../../../AGENTS.md) 与 [authority 入口](../../authority/README.md)。
2. 开发会话复制 [START.md](START.md) 的完整提示词；独立验收会话复制 [ACCEPTANCE.md](ACCEPTANCE.md)。
3. 开发时写入 `docs/handoffs/wp-a.md`；技术验收时写入 `docs/acceptance/wp-a.md` 并记录 `dev` base/head 与证据提交。这两个路径是执行时产物。
4. AI 准备页面入口、演示数据和必要账号后，人工使用 [MANUAL.md](MANUAL.md) 只检查页面功能、界面和文案。

## P0/P1 责任

| 阶段 | 本包负责 |
| --- | --- |
| P0 | Stitch 页面迁入、公众外壳、公共组件/请求工具、地图与地点列表、选点/参数、路线与个人绕行、双通道选择及状态传播。 |
| P1 | 真实文字搜索界面；公共发布、重新核实、纠错、驳回、解除和过期后的地图展示与路线过时提示。 |

- [ ] A0：Stitch 页面迁入、公众外壳、公共请求工具与地图选择接口。
- [ ] A1/P0：区域地图、地点列表、选点和参数、普通路线、个人绕行、状态传播。
- [ ] A2/P1：文字搜索、公共障碍完整状态展示、公共变更后地图与路线更新。
- [ ] A3：与 B/C/D 联调，完成本包自检和人工功能脚本。

## 本包目录与文件所有权

下表沿用技术文档的规划目录；以 D 骨架交付的实际布局核对文件清单，在 `routing`/`hazards` 内分开 client/server。共享修改先按 [协作约定](../../authority/COLLABORATION.md) 交接给唯一负责人。

| 目录或文件 | 本包边界 |
| --- | --- |
| `src/app/(frontend)/` 中公众外壳、地图/路线页面及全局样式 | A 维护页面外壳；B 的上报/报告页面和 C/D 的业务 API 按职责分别维护。 |
| `src/components/map/` | 共享地图、列表和位置/通道/预览选择组件。 |
| `src/features/routing/client/` | 路线状态、选点、参数、搜索接入及地图图层的客户端功能。 |
| 公共请求工具及会话初始化客户端模块 | 沿用骨架实际目录，由 A 提供唯一共用入口。 |

## 依赖与最小交接

| 关系 | 可开始开发所需交付 |
| --- | --- |
| 依赖 D | 骨架、区域/地点/通道、路线、路由上下文、真实搜索及共享地理契约。 |
| 依赖 C | 匿名会话、脱敏公共报告/本人图层、个人及公共状态/版本服务。 |
| 交付 B | 尽早给出公共请求工具与地图选择/预览接口、导出路径、props/events 和用法。 |

依赖未就绪时按权威契约用清楚标识的 fixture 继续独立任务；基础依赖按阶段 PR 交付，真实联调及外部服务验证按公共验收要求完成。

## 共用权威文档

公共规则只在以下资料维护，本包不复制其内容：

- [PROJECT.md](../../authority/PROJECT.md)：项目范围、共同决定与分工。
- [API_CONTRACTS.md](../../authority/API_CONTRACTS.md)：HTTP字段、权限、状态、版本和幂等语义；内部交接见 COLLABORATION。
- [COLLABORATION.md](../../authority/COLLABORATION.md)：分支、目录、共享修改、同步、阶段 PR 和集成流程。
- [ACCEPTANCE.md](../../authority/ACCEPTANCE.md)：共同技术验收、人工分工、检查点和总追踪表。
- [需求文档](../../authority/AccessLoop_需求文档_v1.0.md)、[技术文档](../../authority/AccessLoop_技术文档_v1.0.md)、[选型调研](../../authority/AccessLoop_开源后端与后台选型调研.md)：业务与架构依据；优先级按 [authority 入口](../../authority/README.md) 处理。
