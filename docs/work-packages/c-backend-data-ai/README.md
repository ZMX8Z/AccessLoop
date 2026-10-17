# 工作包 C：数据、AI 与报告后端

**负责人：**C：后端数据、AI 与报告成员。

本包必须交付完整 P0 与 P1。P0 是阶段交付，P1 为必交；本目录是待执行工作说明，不表示功能、部署或验收已完成。

本包固定分支为 `codex/c-backend-data-ai`；创建基准、持续同步来源和 PR 目标均为 `dev`。开发前必读 [COLLABORATION.md](../../authority/COLLABORATION.md)，按其完成分支/工作目录预检与安全同步，使用独立 clone/worktree 并复用已归属本包的分支；禁止在同一工作目录并发切换分支或直接在 `dev`/`main` 开发。A/B/C 交付技术验收通过的阶段 PR，由 D 按协作约定串行集成到 `dev`。用户已授权最终集成；详细合并和平台保护处理以该协作约定为准。

## 开始与交付

1. 先读根 [AGENTS.md](../../../AGENTS.md) 与 [authority 入口](../../authority/README.md)。
2. 开发会话复制 [START.md](START.md) 的完整提示词；独立验收会话复制 [ACCEPTANCE.md](ACCEPTANCE.md)。
3. 开发时写入 `docs/handoffs/wp-c.md`；技术验收时写入 `docs/acceptance/wp-c.md` 并记录 `dev` base/head 与证据提交。这两个路径是执行时产物。
4. AI 准备页面入口、演示数据和必要账号后，人工使用 [MANUAL.md](MANUAL.md) 只检查页面功能、界面和文案。

## P0/P1 责任

| 阶段 | 本包负责 |
| --- | --- |
| P0 | Payload 模型/迁移/仓储、预设通道基础持久化与版本读取、匿名会话、私有 OSS、真实 GLM、报告与用户修正、预览/个人确认/续期/停用、授权导出及事务/权限。 |
| P1 | 受控管理员/运营者、Payload 后台挂载、公共核实/重新核实/纠错/驳回/解除/重开业务命令、脱敏披露、审计、区域/预设通道配置命令及摘要鉴权。 |

- [ ] C0/P0：Payload 数据模型、迁移、仓储接口、预设通道初始数据/稳定 ID/版本读取、匿名会话和受控初始化。
- [ ] C1/P0：私有 OSS、真实 GLM、报告/确认/导出及业务事务。
- [ ] C2/P1：管理身份、公共核实/纠错/驳回/解除/重开、脱敏读取及审计。
- [ ] C3/P1：区域/预设通道配置命令、通道变更增版及影响检查、摘要鉴权、B 组件挂载和集成验证。

## 本包目录与文件所有权

下表沿用技术文档的规划目录；以 D 骨架交付的实际布局核对文件清单，在 `routing`/`hazards` 内分开 client/server。共享修改先按 [协作约定](../../authority/COLLABORATION.md) 交接给唯一负责人。

| 目录或文件 | 本包边界 |
| --- | --- |
| `src/payload.config.ts`、`src/collections/`、`src/migrations/` | D 骨架阶段明确交接后由 C 唯一维护数据配置和迁移。 |
| `src/app/(payload)/` | Payload `/admin`、`/cms-api` 及生成文件；注册 B 的管理组件。 |
| `src/server/auth/`、`src/server/storage/` | 匿名/管理身份、归属权限、业务仓储、事务和私有上传封装。 |
| `src/features/hazards/server/` | 报告、确认、公共管理状态机和审计业务服务。 |
| `src/server/providers/` 中 Vision 适配与所属业务 API | 负责会话/照片/AI/报告/管理命令入口；ORS/搜索提供商由 D 维护。 |
| `src/shared/contracts/` 中上传/AI/报告/确认/管理契约 | 与 D 的公共错误、地理和版本契约协调，按 authority 维护。 |

## 依赖与最小交接

| 关系 | 可开始开发所需交付 |
| --- | --- |
| 依赖 D | 可启动骨架、预览/确认共用几何、通道/公共几何/区域影响验证、分服务预算门禁和摘要聚合。 |
| 依赖 B | 导出纯展示模板、管理组件及其注册说明；C 负责权限、数据和正式挂载。 |
| 交付 D | 尽早提供会话/区域、有效避让一致快照、routeRef、缓存、预算原子预留和摘要仓储接口。 |
| 交付 A/B | 上传/分析/报告/预览/确认/管理接口与受控测试账号，保持公共 DTO 与私有证据分离。 |

依赖未就绪时按权威契约用清楚标识的 fixture 继续独立任务；基础依赖按阶段 PR 交付，真实联调及外部服务验证按公共验收要求完成。

## 共用权威文档

公共规则只在以下资料维护，本包不复制其内容：

- [PROJECT.md](../../authority/PROJECT.md)：项目范围、共同决定与分工。
- [API_CONTRACTS.md](../../authority/API_CONTRACTS.md)：HTTP字段、权限、状态、版本和幂等语义；内部交接见 COLLABORATION。
- [COLLABORATION.md](../../authority/COLLABORATION.md)：分支、目录、共享修改、同步、阶段 PR 和集成流程。
- [ACCEPTANCE.md](../../authority/ACCEPTANCE.md)：共同技术验收、人工分工、检查点和总追踪表。
- [需求文档](../../authority/AccessLoop_需求文档_v1.0.md)、[技术文档](../../authority/AccessLoop_技术文档_v1.0.md)、[选型调研](../../authority/AccessLoop_开源后端与后台选型调研.md)：业务与架构依据；优先级按 [authority 入口](../../authority/README.md) 处理。
