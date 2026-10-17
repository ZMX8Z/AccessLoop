# 工作包 D：完整开发启动提示词

复制下面整段到本包开发会话，按本包 [README](README.md) 的交付边界执行。权威文档只在 [authority](../../authority/README.md) 维护。

~~~text
你负责AccessLoop工作包D：路由、地理、部署与总集成，必须完成P0和P1。

开始前按顺序阅读：
1. 根目录 AGENTS.md 和 README.md；
2. docs/authority/README.md：权威资料入口与优先级；
3. docs/authority/PROJECT.md：已确认范围与业务规则；
4. docs/authority/API_CONTRACTS.md：HTTP字段、状态、权限、版本与幂等；
5. docs/authority/COLLABORATION.md：分支预检、目录所有权、内部交接、同步与阶段PR；
6. docs/authority/ACCEPTANCE.md：阶段/整包验收规则、证据与追踪表；
7. 按本包任务查阅 docs/authority/AccessLoop_需求文档_v1.0.md 和 docs/authority/AccessLoop_技术文档_v1.0.md 的相关章节；需要选型依据时查看同目录选型调研；
8. docs/work-packages/d-backend-routing/README.md、本包交接 docs/handoffs/wp-d.md（如已存在）。

公共约束、接口字段与分支详细规则以以上 authority 文件为唯一维护处；本提示词保留本包业务任务。实现 Schema、文档、fixture 与调用方同步要求按 API_CONTRACTS 执行。

分支与交付先按 docs/authority/COLLABORATION.md 执行：完成当前目录/分支/工作树/归属预检及安全同步，在本包固定分支 codex/d-backend-routing 上开发；需新建时从 dev 创建，持续同步 dev，PR base 为 dev。记录同步后的 base 与交付 head 提交。使用独立 clone/worktree；复用已归属本包的分支/工作目录，不在同一目录并发切换分支；禁止直接在 dev/main 开发。子 agent 如需分支，按 COLLABORATION 的父包前缀规则执行并先集成回本包分支。

先确认本套权威文档和四包材料已经进入dev；若仍是未提交文档，按COLLABORATION先在本包固定分支完成文档准备阶段PR并合入dev，使其他人能拉取共同材料。随后先交付可启动骨架及最低可用契约的阶段 PR 到 dev，不能等待整包完成。骨架合入后明确交接 Payload 配置/数据所有权给 C；其后继续按阶段 PR 交付并集成 P0/P1。

交付时按 COLLABORATION 完成检查、交接和 PR，PR base 必须为 dev；若可用工具要求附加 PR，则用相应工具附加实际创建的 PR。你是唯一集成负责人；依 COLLABORATION 按阶段顺序串行合并各包技术验收通过的 PR 到 dev，包含你的骨架阶段 PR。每次记录集成 SHA 并回归，最终四包全部进入 dev，并完成同一集成提交的 P0/P1 总验收。用户已授权最终集成，常规阶段合并无需重复询问；只有平台保护实际要求人工审批时才报告具体阻塞。

这是直接开发任务，可用子agent并行做供应商适配、地理纯函数或部署检查；主agent负责骨架、契约、集成和证据。P0完成后继续P1，不将P1作为有空再做。

先检查已有骨架、部署条件和交接，保留其他成员改动；维护同一应用，协调四包的公共接口、集成和部署。

公共准备：
1. 优先交付兼容版本锁定的应用骨架、/api、/cms-api、/admin和health，提交lockfile；同步验证Zenith真实模板、端口、出网、密钥注入，不编造manifest。
2. 与C冻结共享Schema、API示例、仓储与原子预算接口，尽早交付fixture。维护已存在的根目录 AGENTS.md 与 docs/authority/API_CONTRACTS.md，更新 README、环境示例及 docs/authority/ 中的需求/技术文档；公共规则只在 authority 对应文件维护，保持单一事实来源。
3. 骨架交接后将Payload配置、Collections、迁移和仓储所有权交C；你保留package/lockfile/构建/部署和公共文档整合，后续通过C仓储访问数据。

P0 子任务：
4. 在UNSW Kensington内实测小区域wheelchair路线，固定起终点和备选通道，交接有来源和演示标识的数据；实现region、places和passages。
5. 提供路线片段/预设通道验证、米制缓冲、预览/确认共用几何和公共几何校验，不信任客户端任意个人多边形。
6. 实现ORS适配与routes，合并有效公共障碍及当前会话个人避让，保持起终点和限制；检查LineString、吸附偏差、覆盖范围和避让相交。
7. 实现隔离缓存、同键进行中请求去重、会话routeRef及routing-context；结束时复核版本/有效集，旧结果不发布，公共缓存不携带他人routeRef。
8. 实现统一预算门禁，由C原子仓储持久化，ORS/Vision/Geocoding分别计量，重启不清空预算；完成等待、配额/鉴权区分及有限重试。

P1 子任务：
9. 实现GET /api/search的真实地址搜索，按区域限制结果、数量和来源，缓存相同查询并接入Geocoding预算，交A接入，保留无结果和上游故障语义。
10. 集成公共核实/重新核实、纠错、驳回、解除及过期后的公共版本/有效集；两个公众会话均能更新地图和路线提示，不把自然到期漏掉。
11. 为C区域命令提供bbox、预设通道、缓冲参数的校验和影响判断；拒绝破坏现有有效数据的配置，合法影响变更使旧预览/在途路线失效。
12. 提供最近24小时ORS/AI调用数、等待、错误、缓存命中聚合，使用真实脱敏记录；C挂载鉴权接口，B展示，不引入外部监控栈或保存私人行程。
13. 先集成P0闭环，再贯通真实搜索和管理公共流程；协调B/C后台组件正式挂载，不能只验证各模块单独可用。

部署与验收：
14. 部署Zenith，验证数据库/OSS/模型/ORS真实连接及关键权限；创建照片报告后重启，确认数据、图片、确认和预算仍在，过期避让不复活。
15. 完成一次最小备份恢复、可用版本恢复说明、在线二维码/页面入口与演示配置，和B完成约120秒核心演示稿。
16. 统一运行集成构建、类型检查和必要场景，不做20会话压测、30次P95或极端环境矩阵。共享证据可复用，避免重复真实API调用。

边界与交付：
- A地图/公众UI，B上报及后台自定义UI，C全部数据/管理命令和鉴权；你提供路由、搜索、地理、统计服务与部署。
- 不另建ORM/数据库连接，不将预算余额冒充调用/错误/缓存摘要。
- 外部凭据缺失时继续其余工作并集中列出最小缺项；历史录像、fixture和人工降级不能替代实时功能通过。
- 在docs/handoffs/wp-d.md提交P0/P1清单、构建/集成/恢复证据、API与部署说明、在线入口、固定数据、剩余阻塞及人工脚本；更新 docs/authority/ACCEPTANCE.md 的全项目验收表。
~~~
