# 工作包 C：完整开发启动提示词

复制下面整段到本包开发会话，按本包 [README](README.md) 的交付边界执行。权威文档只在 [authority](../../authority/README.md) 维护。

~~~text
你负责 AccessLoop 工作包 C：数据、AI 与报告后端，必须完成 P0 和 P1。

开始前按顺序阅读：
1. 根目录 AGENTS.md 和 README.md；
2. docs/authority/README.md：权威资料入口与优先级；
3. docs/authority/PROJECT.md：已确认范围与业务规则；
4. docs/authority/API_CONTRACTS.md：HTTP字段、状态、权限、版本与幂等；
5. docs/authority/COLLABORATION.md：分支预检、目录所有权、内部交接、同步与阶段PR；
6. docs/authority/ACCEPTANCE.md：阶段/整包验收规则、证据与追踪表；
7. 按本包任务查阅 docs/authority/AccessLoop_需求文档_v1.0.md 和 docs/authority/AccessLoop_技术文档_v1.0.md 的相关章节；需要选型依据时查看同目录选型调研；
8. docs/work-packages/c-backend-data-ai/README.md、本包交接 docs/handoffs/wp-c.md（如已存在）。

公共约束、接口字段与分支详细规则以以上 authority 文件为唯一维护处；本提示词保留本包业务任务。实现 Schema、文档、fixture 与调用方同步要求按 API_CONTRACTS 执行。

分支与交付先按 docs/authority/COLLABORATION.md 执行：完成当前目录/分支/工作树/归属预检及安全同步，在本包固定分支 codex/c-backend-data-ai 上开发；需新建时从 dev 创建，持续同步 dev，PR base 为 dev。记录同步后的 base 与交付 head 提交。使用独立 clone/worktree；复用已归属本包的分支/工作目录，不在同一目录并发切换分支；禁止直接在 dev/main 开发。子 agent 如需分支，按 COLLABORATION 的父包前缀规则执行并先集成回本包分支。

尽早将仓储/事务接口、匿名会话和上传/报告契约按阶段 PR 交付到 dev，支持 D 与 A/B 联调；完成 P0 后继续管理与配置 P1。

交付时按 COLLABORATION 完成检查、交接和 PR，PR base 必须为 dev；若可用工具要求附加 PR，则用相应工具附加实际创建的 PR。将技术验收通过的阶段 PR 交给 D，由 D 依 COLLABORATION 串行合并到 dev；最终所有包都需进入 dev。用户已授权最终集成，常规阶段合并无需重复询问；只有平台保护实际要求人工审批时才报告具体阻塞。

这是直接开发任务，可用子 agent 分别处理上传/模型和报告/管理服务；主 agent 统一数据模型、迁移、权限及事务。P0通过是阶段交付，继续完成P1。

先检查 D 的骨架和交接，保留其他成员改动；复用同一应用和 Payload 数据连接，接管数据、权限、事务及后台挂载。

P0 子任务：
1. 接管Payload配置、Collections、版本化迁移、BusinessRepository、内部表和审计。按COLLABORATION完成P0预设通道基础持久化及读取交接。尽早给D提供会话/区域、有效避让快照、routeRef、缓存、预算原子预留及摘要读取接口。
2. 实现POST /api/session及归属校验；管理员身份与匿名身份分离。写请求校验Origin和必要CSRF。
3. 验证真实JPEG/PNG、大小与解码，处理图片去EXIF，写OSS私有桶；提供授权图片读取并关闭CMS上传、文件、缩略图和关系展开旁路。OSS适配不通则用ali-oss，不回退本地持久化。
4. 完成GLM真实图片探针、分析接口、固定工具参数Schema及服务端语义校验。仅提取指定结果函数，不执行模型要求的任意工具；无有效结果明确降级。接入D预算门禁和会话缓存。
5. 保存不可由客户端覆盖的原始分析及版本；报告用户修正另存。有有效障碍分析时最终返回ai_assessed，否则pending，均不自动启用。
6. 完成报告创建/修改/本人读取、公共白名单读取、预览、确认/续期、停用及授权导出，复用B的纯展示模板和D的通道几何服务。
7. 确认复算并核对previewDigest；已有报告写入携带expectedVersion和幂等键。事务原子写确认、版本、审计、幂等结果，确认绑定提交后版本。
8. 修改照片/位置/通道使旧确认失效；过期按查询推导；旧AI不能覆盖新状态。所有实体写入共享Payload事务上下文。

P1 子任务：
9. 完成Payload管理员身份/角色和受控初始化；报告管理者与区域运营者权限分开，公众不能创建管理账号。
10. 用原生Payload列表/详情提供报告筛选、私有证据、AI原文/用户修改和只读审计。正式挂载B交付的地图、动作、配置与摘要组件。
11. 实现review动作verify/correct/reject/resolve/reopen。覆盖首次公共核实、verified重新核实、公共范围/有效期纠错、驳回、有证据解除及重开pending。
12. 公共核实检查独立证据、合法公共几何和有效期；原图保持私有，公共响应只出白名单。不能把客户端status或通用CRUD作为业务命令。
13. 公共变化增hazard_version；管理动作导致个人确认失效时同事务停用并增其personal_version；resolved/rejected不再参与个人有效集，reopen不恢复旧确认。未改变确认依据时维持合法版本绑定。
14. 基于P0已持久化的预设通道，提供受保护的单区域配置读写命令，支持通道增删改及变更增版；与D完成校验/影响检查，非法或破坏现有有效数据的修改明确冲突，不静默迁移。
15. 审计保存足够的版本信息，后台能显示操作者、动作、理由、时间和版本；业务事件不可通用编辑或删除。
16. 挂载受保护的调用摘要读取接口，调用D聚合服务；区域配置仅运营者可写。完成B组件在真实/admin中的功能联调。

边界：
- D实现ORS/POI/搜索、地理规则、预算策略及聚合；你实现数据库原子操作和管理鉴权，不另开ORM/连接。
- B提供自定义管理组件，你负责注册/挂载；不得双方都认为对方会完成接入。
- package/lockfile/部署由D合并，及时交接依赖和环境变量需求。

验证与交付：
- 真实上传/授权读取、少量真实GLM、个人确认与公共核实主流程；错误用桩，少量确定性用例检查归属、幂等、版本冲突和回滚。
- 加入一个管理命令失败或冲突案例，证明状态、双范围版本和审计不部分成功；不做极端文件或压力矩阵。
- 缺凭据继续其余实现，明确外部阻塞；人工降级不代表真实AI已完成。
- 写入docs/handoffs/wp-c.md：迁移/初始化、API/仓储交接、后台挂载、P0/P1检查证据、缺项及人工页面入口。
~~~
