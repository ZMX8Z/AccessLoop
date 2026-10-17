# AccessLoop 四人工作包入口

完整 P0/P1 计划已拆成四个工作包文件夹；本文件仅作兼容导航，不再维护重复的启动词或公共规则。

| 工作包 | 入口 |
| --- | --- |
| A 视觉、地图与路线前端 | [A 工作包](work-packages/a-frontend-map/README.md) |
| B 上报、报告与管理交互前端 | [B 工作包](work-packages/b-frontend-reports/README.md) |
| C 数据、AI 与报告后端 | [C 工作包](work-packages/c-backend-data-ai/README.md) |
| D 路由、地理与集成部署 | [D 工作包](work-packages/d-backend-routing/README.md) |

- [使用顺序与总导航](work-packages/README.md)
- [权威文档索引](authority/README.md)
- [统一 API 契约](authority/API_CONTRACTS.md)
- [统一分支、共享文件与合入 dev 规则](authority/COLLABORATION.md)
- [统一验收规则与全项目追踪](authority/ACCEPTANCE.md)

每包均有 README.md、START.md、ACCEPTANCE.md、MANUAL.md；直接复制 START.md 中的完整提示词交给该包 Codex。所有工作包读取同一套 authority 文档，阶段成果统一由 D 集成到 dev。
