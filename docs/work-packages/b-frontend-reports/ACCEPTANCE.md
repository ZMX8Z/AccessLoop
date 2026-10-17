# 工作包 B：AI 技术验收提示词

复制下面整段到独立验收会话。实际验收结果在执行时写入 `docs/acceptance/wp-b.md`，此文件保留可复用提示词。公共验收要求见 [权威验收文档](../../authority/ACCEPTANCE.md)。

~~~text
请独立验收 AccessLoop 工作包 B，包含 P0 公众流程和 P1 管理交互。

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
8. docs/work-packages/b-frontend-reports/README.md、本包交接 docs/handoffs/wp-b.md（如已存在）。

公共约束、接口字段与分支详细规则以以上 authority 文件为唯一维护处；本提示词保留本包业务任务。实现 Schema、文档、fixture 与调用方同步要求按 API_CONTRACTS 执行。

验收前按 docs/authority/COLLABORATION.md 只读核查本包分支 codex/b-frontend-reports、阶段交付及 PR base=dev；验收集成结果时核对指定的dev提交。使用独立 clone/worktree，复用已归属的目录；禁止在同一目录并发切换分支，禁止直接在 dev/main 开发。详细同步/分支/子 agent 规则只读取 COLLABORATION。

先固定并记录本次比较的 base（dev 对应提交）与 head（待验收提交）、当前分支和 PR 链接，再开始验证；复用证据必须能对应同一 head 或可核对的同一集成提交。head 或目标 dev 的 base 变化后重新记录并评估差异，只复验失败项及受影响主流程。核查开发交付 PR 的 base 为 dev；若验收记录需通过 PR 交付，也按 COLLABORATION 提交到 base=dev，并按可用工具要求附加 PR。核查阶段 PR 由 D 按授权集成到 dev 的记录与集成 SHA；平台保护实际要求人工审批时，记录具体阻塞。

核对本包交接、代码差异和受影响的共享契约。不修改产品代码；实际运行相关静态检查与浏览器流程。

检查：
1. 照片→分析修正→保存报告→自动预览→明确确认→详情/启停/打印能连续完成，路线片段和预设通道都可用。
2. AI不确定/失败时表单保留且人工路径需明确确认；一个迟到分析、一个重复点击/版本冲突案例不会覆盖编辑或重复生效。
3. 复制打印安全转义，状态/范围/有效期准确；公众报告不泄露私有照片、身份或完整管理证据。
4. P1 /admin中实际存在并可使用报告/证据地图和动作表单；核实/重新核实、纠错、驳回、解除、重开与后端结果一致，原始AI只读。
5. P1 审计显示操作者、理由、时间和版本；区域配置表单可保存合法内容并呈现一次非法/冲突结果；简单摘要由真实数据驱动且字段完整。
6. 与 C 的挂载和鉴权已联调，不接受未挂载组件或仅前端隐藏按钮作为后台完成证据。公共状态变化能在报告页正确展示。

使用少量固定场景；后端权限、事务和双会话证据可复用同提交 C/D 结果，不重复大矩阵。缺真实管理接口或账号时标记阻塞，不将fixture算作P1通过。

分别输出P0、P1和整包“通过/未通过/外部条件阻塞”，附证据与失败复现，写入 docs/acceptance/wp-b.md。提供人工仅检查页面功能与界面的操作清单。
~~~
