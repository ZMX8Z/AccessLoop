# AccessLoop

无障碍地点查询与临时障碍绕行的黑客松 MVP。

已确定技术栈：**Next.js + Payload + PostgreSQL + 阿里云 OSS 私有对象存储**。照片由阿里云托管，应用通过服务端存储适配器访问 OSS。Payload 提供数据管理、管理员认证及 Payload Admin；AI 识别、用户确认、个人避让与 ORS 路线由 AccessLoop 业务服务实现。

本轮交付完整 P0 与 P1：个人绕行闭环、地点搜索和 Payload Admin 公共核实/纠错。四人共用同一仓库，分别使用固定开发分支及独立工作目录，所有阶段成果合入 dev。统一 Next.js + Payload 骨架已初始化；D 的地理、路由、预算门禁、搜索与调用摘要服务已实现并进入阶段验证。C 的真实仓储接入、A/B 页面联调及 Zenith 部署尚未完成，不代表完整 P0/P1 已通过。

先阅读 [AI 协作入口](AGENTS.md)，再进入 [四人工作包目录](docs/work-packages/README.md)，选择自己的 START.md 执行。

| 入口 | 内容 |
| --- | --- |
| [权威文档目录](docs/authority/README.md) | 项目决定、需求、技术及选型依据 |
| [统一 API 契约](docs/authority/API_CONTRACTS.md) | 全部 P0/P1 接口字段和示例 |
| [协作与分支规则](docs/authority/COLLABORATION.md) | 固定分支、共享所有权、同步及合入 dev |
| [统一验收规则](docs/authority/ACCEPTANCE.md) | AI 技术验收、人工功能验收及全项目追踪 |
| [A：视觉、地图与路线前端](docs/work-packages/a-frontend-map/README.md) | Stitch、地图、路线、搜索 |
| [B：上报、报告与管理交互前端](docs/work-packages/b-frontend-reports/README.md) | 上报确认、报告、后台自定义组件 |
| [C：数据、AI 与报告后端](docs/work-packages/c-backend-data-ai/README.md) | Payload、OSS、GLM、权限与管理命令 |
| [D：路由、地理与集成部署后端](docs/work-packages/d-backend-routing/README.md) | 骨架、ORS、搜索、预算、部署与 dev 集成 |

## 本地启动

使用 `.nvmrc` 中的 Node.js 和 `package.json` 指定的 pnpm，执行 `pnpm install --frozen-lockfile`、`pnpm dev`。公众入口 `/`、健康检查 `/api/health`；配置独立 PostgreSQL、应用秘密并执行迁移及受控管理员初始化后使用 `/admin`。

完整命令、环境配置、四包接入及检查方式见 [本地开发说明](docs/DEVELOPMENT.md)。本阶段交接与实际证据见 [D 交接](docs/handoffs/wp-d.md) 和 [D 技术验收](docs/acceptance/wp-d.md)。

D 服务接线见 [仓储与前端交接](docs/handoffs/d-service-integration.md)。部署探针执行 `pnpm deploy:probe`，仅打印配置存在性；额外探测和恢复步骤见 [部署说明](docs/deployment/README.md)。秘密放独立工作目录的 `.env.local`，该文件不提交。

本机联调库已按用户授权独立配置，路径、端口和安全复用方式见 [本机 PostgreSQL](docs/deployment/local-development-db.md)；数据库与秘密留在本地忽略文件中。
