# 工作包 A：AI 技术验收提示词

复制下面整段到独立验收会话。实际验收结果在执行时写入 `docs/acceptance/wp-a.md`，此文件保留可复用提示词。公共验收要求见 [权威验收文档](../../authority/ACCEPTANCE.md)。

~~~text
请独立验收 AccessLoop 工作包 A，范围包含 P0 和 P1。

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
8. docs/work-packages/a-frontend-map/README.md、本包交接 docs/handoffs/wp-a.md（如已存在）。

公共约束、接口字段与分支详细规则以以上 authority 文件为唯一维护处；本提示词保留本包业务任务。实现 Schema、文档、fixture 与调用方同步要求按 API_CONTRACTS 执行。

验收前按 docs/authority/COLLABORATION.md 只读核查本包分支 codex/a-frontend-map、阶段交付及 PR base=dev；验收集成结果时核对指定的dev提交。使用独立 clone/worktree，复用已归属的目录；禁止在同一目录并发切换分支，禁止直接在 dev/main 开发。详细同步/分支/子 agent 规则只读取 COLLABORATION。

先固定并记录本次比较的 base（dev 对应提交）与 head（待验收提交）、当前分支和 PR 链接，再开始验证；复用证据必须能对应同一 head 或可核对的同一集成提交。head 或目标 dev 的 base 变化后重新记录并评估差异，只复验失败项及受影响主流程。核查开发交付 PR 的 base 为 dev；若验收记录需通过 PR 交付，也按 COLLABORATION 提交到 base=dev，并按可用工具要求附加 PR。核查阶段 PR 由 D 按授权集成到 dev 的记录与集成 SHA；平台保护实际要求人工审批时，记录具体阻塞。

实际运行相关静态检查和浏览器操作，核对代码差异与受影响的共享契约，不仅依据开发者描述判断。不修改产品代码。

检查：
1. Stitch 已成为可操作页面；360px 宽度无阻塞主操作的溢出，标签/焦点/文字状态及列表替代可用。
2. 拒绝定位后可选点；地点四种状态、坐标转换、轮椅参数及单位正确。
3. 普通规划和个人绕行可用；拖图、切面板和重绘不增加 Directions 调用；路线片段及预设通道都能交给 B 使用。
4. 版本或有效集改变后10秒内提示，轮询不请求 ORS；一个迟到响应案例不能覆盖较新路线。
5. P1 真实搜索可选结果并规划；少量样例检查无结果、区域外、等待和故障，避免旧搜索覆盖新输入。
6. P1 管理员公共发布、纠错和解除后，两个公众会话的地图/过时提示正确更新；过期不显示为已恢复安全。公众请求不包含私有照片或管理字段。

使用固定数据和必要失败样例，不压测、不做覆盖率或大规模环境矩阵。可复用同集成提交可核对的真实闭环证据。真实搜索/API未接通标记阻塞；只有P0通过不能写整包通过。

输出P0、P1及整包的“通过/未通过/外部条件阻塞”，附简短结果与证据。失败项给复现步骤、影响和文件位置；小幅风格偏好不作为技术阻塞。将结果写入 docs/acceptance/wp-a.md，另给人工只需点击页面的检查步骤。
~~~
