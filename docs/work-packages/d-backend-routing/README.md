# 工作包 D：路由、地理、部署与总集成

**负责人：**D：后端路由、部署成员及唯一集成负责人。

本包必须交付完整 P0 与 P1。P0 是阶段交付，P1 为必交；本目录是待执行工作说明，不表示功能、部署或验收已完成。

本包固定分支为 `codex/d-backend-routing`；创建基准、持续同步来源和 PR 目标均为 `dev`。开发前必读 [COLLABORATION.md](../../authority/COLLABORATION.md)，按其完成分支/工作目录预检与安全同步，使用独立 clone/worktree 并复用已归属本包的分支；禁止在同一工作目录并发切换分支或直接在 `dev`/`main` 开发。D 先交付骨架阶段 PR，并按协作约定串行合并各包技术验收通过的阶段 PR 到 `dev`，记录集成 SHA 并回归。用户已授权最终集成；详细合并和平台保护处理以该协作约定为准。

## 开始与交付

1. 先读根 [AGENTS.md](../../../AGENTS.md) 与 [authority 入口](../../authority/README.md)。
2. 开发会话复制 [START.md](START.md) 的完整提示词；独立验收会话复制 [ACCEPTANCE.md](ACCEPTANCE.md)。
3. 开发时写入 `docs/handoffs/wp-d.md`；技术验收时写入 `docs/acceptance/wp-d.md` 并记录 `dev` base/head 与证据提交。这两个路径是执行时产物。
4. AI 准备页面入口、演示数据和必要账号后，人工使用 [MANUAL.md](MANUAL.md) 只检查页面功能、界面和文案。

## P0/P1 责任

| 阶段 | 本包负责 |
| --- | --- |
| P0 | 应用骨架、最低可用契约、地点/通道、实测演示区域、ORS、共用避让几何、统一分服务预算、缓存/去重/上下文传播、Zenith 部署。 |
| P1 | 真实地址搜索、公共管理及自然过期后的地图/路由传播、区域影响验证、调用摘要服务、四包集成、技术总验收、重启与最小备份恢复。 |

- [ ] D0：骨架、契约框架、辅助文档和 Zenith 最小部署探针。
- [ ] D1/P0：地点/通道、ORS、避让几何、共享预算、缓存和上下文传播。
- [ ] D2/P1：真实搜索、公共管理后的路由更新、区域影响验证、调用摘要。
- [ ] D3：四包集成、P0/P1 技术总验收、重启/恢复及线上演示入口。

## 本包目录与文件所有权

下表沿用技术文档的规划目录；以 D 骨架交付的实际布局核对文件清单，在 `routing`/`hazards` 内分开 client/server。共享修改先按 [协作约定](../../authority/COLLABORATION.md) 交接给唯一负责人。

| 目录或文件 | 本包边界 |
| --- | --- |
| `package.json`、lockfile、构建/部署配置、环境变量示例 | 共享依赖和部署配置由 D 统一整合。 |
| `src/features/routing/server/`、`src/features/places/` | ORS 路线、通道/地理规则、有效集、缓存和区域地点/搜索服务。 |
| `src/server/providers/` 中 ORS、POI/Geocoding 适配 | Vision 适配由 C 维护；通过 C 的统一仓储访问数据。 |
| 公共错误/地点/通道/路线/搜索共享契约及所属业务 API | 契约字段统一在 authority 与实现 Schema 维护，避免复制。 |
| `docs/authority/`、根 `AGENTS.md` 与 `README.md` | 维护已有权威资料、架构/需求/技术说明和项目导航，保持单一事实来源。 |
| 骨架阶段的 Payload 配置/数据入口 | 骨架进入 dev 后明确交接给 C；后续通过 C 仓储与配置负责人协作。 |

## 依赖与最小交接

| 关系 | 可开始开发所需交付 |
| --- | --- |
| 依赖 C | 统一 Payload 仓储/连接、会话/区域/有效集快照、原子预算、私有报告与管理命令、权限和持久化。 |
| 依赖 A/B | 公众地图/路线、上传确认/报告及真实后台界面；协调 B/C 正式挂载管理组件。 |
| 先交付四包 | 骨架阶段 PR 到 dev、最低可用 Schema/fixture、健康检查、Zenith 部署探针和固定演示数据。 |
| 最终集成 | 按阶段顺序串行合并技术验收通过的四包 PR 到 dev，并在同一集成提交验证真实 P0/P1 与恢复。 |

依赖未就绪时按权威契约用清楚标识的 fixture 继续独立任务；基础依赖按阶段 PR 交付，真实联调及外部服务验证按公共验收要求完成。

## 共用权威文档

公共规则只在以下资料维护，本包不复制其内容：

- [PROJECT.md](../../authority/PROJECT.md)：项目范围、共同决定与分工。
- [API_CONTRACTS.md](../../authority/API_CONTRACTS.md)：HTTP字段、权限、状态、版本和幂等语义；内部交接见 COLLABORATION。
- [COLLABORATION.md](../../authority/COLLABORATION.md)：分支、目录、共享修改、同步、阶段 PR 和集成流程。
- [ACCEPTANCE.md](../../authority/ACCEPTANCE.md)：共同技术验收、人工分工、检查点和总追踪表。
- [需求文档](../../authority/AccessLoop_需求文档_v1.0.md)、[技术文档](../../authority/AccessLoop_技术文档_v1.0.md)、[选型调研](../../authority/AccessLoop_开源后端与后台选型调研.md)：业务与架构依据；优先级按 [authority 入口](../../authority/README.md) 处理。
