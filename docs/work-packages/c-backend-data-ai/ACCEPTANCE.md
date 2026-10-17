# 工作包 C：AI 技术验收提示词

复制下面整段到独立验收会话。实际验收结果在执行时写入 `docs/acceptance/wp-c.md`，此文件保留可复用提示词。公共验收要求见 [权威验收文档](../../authority/ACCEPTANCE.md)。

~~~text
请独立验收AccessLoop工作包C，包含P0与完整P1。

阶段与整包验收先按权威 ACCEPTANCE.md 区分：阶段PR只验本阶段已声明范围，尚未进入阶段的P0/P1标为待交付；整包最终验收仍必须覆盖全部P0/P1。合入dev之前的技术验收不以已合并记录为前提，合并后再查集成SHA和回归结果。

验收只读核对分支、工作树与同步状态，不切换分支或merge改变待验收head；若确需同步，由开发会话完成后重新固定head。最终集成验收可直接读取dev提交；结果文件在所属工作包交接流程中提交。

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

验收前按 docs/authority/COLLABORATION.md 只读核查本包分支 codex/c-backend-data-ai、阶段交付及 PR base=dev；验收集成结果时核对指定的dev提交。使用独立 clone/worktree，复用已归属的目录；禁止在同一目录并发切换分支，禁止直接在 dev/main 开发。详细同步/分支/子 agent 规则只读取 COLLABORATION。

先固定并记录本次比较的 base（dev 对应提交）与 head（待验收提交）、当前分支和 PR 链接，再开始验证；复用证据必须能对应同一 head 或可核对的同一集成提交。head 或目标 dev 的 base 变化后重新记录并评估差异，只复验失败项及受影响主流程。核查开发交付 PR 的 base 为 dev；若验收记录需通过 PR 交付，也按 COLLABORATION 提交到 base=dev，并按可用工具要求附加 PR。核查阶段 PR 由 D 按授权集成到 dev 的记录与集成 SHA；平台保护实际要求人工审批时，记录具体阻塞。

核对本包交接、代码差异和迁移，按权威文档验证模型校验及匿名会话规则。不修改产品代码，可在隔离演示数据中验证。

检查：
1. 迁移、内部表和事务使用同一Payload连接；照片进入OSS私有桶。A/B会话不能互读或复用照片、分析、报告和routeRef，CMS/文件/关系旁路不能越权。
   P0基础阶段须核对预设通道表/迁移及初始数据已落库，D的passages读取使用同一仓储；重启后ID、版本和几何保持不变。P0闭环验证路线片段和预设通道均可完成预览/确认，可复用同提交B/D证据。
2. 少量真实图片能完成GLM分析并追踪来源；completed/uncertain/unavailable正确，AI原文与用户编辑分开，不接受客户端伪造状态。
3. 预览不生效，明确确认才生效；一个过期/旧版本/变更通道案例失效，一次幂等、冲突和回滚证据证明写入一致；旧AI不覆盖新状态。
4. P1真实/admin列表、证据、地图、动作、审计、配置和摘要已挂载，管理员与运营者权限正确。匿名直接管理命令或CMS改受保护字段被拒绝。
5. 首次核实和重新核实需独立证据、合法几何和有效期；纠错、驳回、解除、重开符合状态机；reopen不恢复旧确认，个人停用不解除公共障碍。
6. 管理动作原子更新公共/受影响个人版本和审计；一个失败/冲突案例不留下半套状态。公共DTO不泄露私有原图或身份。
7. P1区域/预设通道配置命令可保存运营修改并在重启后保留，通道变更按契约增版；一次非法/冲突配置被拒绝；审计可展示版本。摘要入口确实鉴权，非仅前端隐藏。

重启/备份及整体路由传播可复用D同提交证据。只检查必要主干和常见失败，不重复大规模异常矩阵。

分别输出P0、P1和整包“通过/未通过/外部条件阻塞”，附真实/桩验证证据及失败复现，写入docs/acceptance/wp-c.md。未接通模型/OSS或未挂载P1管理功能不能宣称整包通过。为人工提供页面入口，不要求其查库、看日志或调用API。
~~~
