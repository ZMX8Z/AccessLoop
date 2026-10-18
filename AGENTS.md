# AccessLoop AI 协作入口

本仓库由 A/B 两名前端、C/D 两名后端并行完成 P0 与 P1。四包共用一个应用和一套权威文档。

## 开始工作前

1. 阅读 [权威文档索引](docs/authority/README.md) 和 [项目决定](docs/authority/PROJECT.md)。
2. 阅读 [协作与分支规则](docs/authority/COLLABORATION.md)，确认自己所属包、固定分支、当前工作目录及未提交改动。功能开发在本包独立 clone/worktree 和固定分支执行。
3. 阅读 [统一 API 契约](docs/authority/API_CONTRACTS.md)，再阅读 [工作包目录](docs/work-packages/README.md) 中自己的 README.md 和 START.md。
4. 修改数据、状态、权限或部署时，查阅 [技术文档](docs/authority/AccessLoop_技术文档_v1.0.md) 对应章节；确认产品行为时查阅 [需求文档](docs/authority/AccessLoop_需求文档_v1.0.md)。

## 开发与集成

- P0 是阶段完成；本轮整包必须包含 P1。按所属 START.md 直接开发，可用子 agent，主 agent 负责集成和交付。
- dev 是共同基线与唯一集成目标；使用 COLLABORATION.md 的分支命名表，全部阶段 PR 以 dev 为 base。D 统一合并，其他包不直接在 dev/main 开发。
- 使用独立工作目录，保留已有改动；共享文件按负责人合并。固定分支已存在时安全复用，不重置或强推他人历史。
- 接口字段统一引用 API_CONTRACTS.md。共享 Schema 实现该契约，文档、Schema、fixture 和调用方在同一交付中同步。
- 四包内只保留职责、任务和执行/验收提示词，不复制独立的 API、项目规则或分支规范。
- 阶段依赖先交付到 dev，其他包同步后继续；依赖暂缺时按已确认契约开发独立部分，最终完成真实联调。

## 验收与交付

- 按 [统一验收规则](docs/authority/ACCEPTANCE.md) 和本包 ACCEPTANCE.md 检查；人工只执行 MANUAL.md 的功能与界面操作。
- 实际命令以 package.json 和运行环境为准。骨架及业务完成状态以所属交接/验收记录为准，不宣称未运行的构建、服务或外部能力已通过。
- 记录 baseDevCommit、headCommit、检查结果和真实/桩验证证据；外部依赖未验证如实标记阻塞。
- 交接写入 docs/handoffs/wp-<a|b|c|d>.md，技术验收结果写入 docs/acceptance/wp-<a|b|c|d>.md；这两类是执行记录，不替代权威规则。

## Zenith

Use the checked-in .agents/skills/zenith-setup/SKILL.md to prepare this repository for Zenith. Read the Compose, test, and publish skills there as the work progresses. Run `zenith check` after adapting Dockerfile and zenith-compose.yml to the actual app. Keep secrets out of Git.

You do not need Docker installed locally; Zenith builds and runs containers on the platform, so use `zenith up` for previews. Zenith also provides outbound app email through its SMTP relay. Configure x-zenith.env using the Compose skill for previews and published apps.
