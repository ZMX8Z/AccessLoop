# 工作包 A：完整开发启动提示词

复制下面整段到本包开发会话，按本包 [README](README.md) 的交付边界执行。权威文档只在 [authority](../../authority/README.md) 维护。

~~~text
你负责 AccessLoop 工作包 A：视觉、地图与路线前端，必须完成 P0 和 P1。

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

分支与交付先按 docs/authority/COLLABORATION.md 执行：完成当前目录/分支/工作树/归属预检及安全同步，在本包固定分支 codex/a-frontend-map 上开发；需新建时从 dev 创建，持续同步 dev，PR base 为 dev。记录同步后的 base 与交付 head 提交。使用独立 clone/worktree；复用已归属本包的分支/工作目录，不在同一目录并发切换分支；禁止直接在 dev/main 开发。子 agent 如需分支，按 COLLABORATION 的父包前缀规则执行并先集成回本包分支。

优先交付 A0 的公共请求工具、公众外壳和地图选择组件，按 COLLABORATION 的阶段 PR 流程交付给 dev，供 B 尽早接入；随后继续本包 P0/P1。

交付时按 COLLABORATION 完成检查、交接和 PR，PR base 必须为 dev；若可用工具要求附加 PR，则用相应工具附加实际创建的 PR。将技术验收通过的阶段 PR 交给 D，由 D 依 COLLABORATION 串行合并到 dev；最终所有包都需进入 dev。用户已授权最终集成，常规阶段合并无需重复询问；只有平台保护实际要求人工审批时才报告具体阻塞。

这是直接开发任务。可以用子 agent 并行处理独立子任务，主 agent 负责整包集成、自检与交付。P0 完成只代表阶段完成，应继续完成 P1，不等待人工逐项批准常规实现选择。

先检查已有代码和交接，保留其他成员改动；由当前使用 Stitch 的成员负责，将已有可导出页面代码迁入同一应用。

职责与子任务：
1. 将 Stitch 导出迁入公众页面，负责全站视觉、移动端外壳、公共组件、加载/错误状态及共用 API 请求工具。
2. 尽早交付会话初始化、位置/通道选择及预览组件接口，供 B 的上报页和管理证据地图复用。组件输出共享 PassageRef，不自行保存报告。
3. 完成地图、地点列表、图例和详情；yes/limited/no/unknown 正确展示，保留来源。拒绝定位时仍可手工选点。
4. 完成起终点选择/交换、轮椅参数和单位、路线及距离时长展示；只在显式规划/重算或参数确认时计算。
5. 接入 region、places、passages、reports 公共/本人图层、routes 和 routing-context，展示个人影响及未公共核实说明。
6. 每 5 秒读取 routing-context，比较公共版本、个人版本与 activeDigest；变化或过期后10秒内提示重算，刷新相关地图层。轮询不调用 ORS，旧响应不覆盖新结果。
7. P1 接入 GET /api/search：输入防抖、取消或忽略过时响应；选择搜索结果设置起终点；正确处理无结果、区域外、限流及上游故障。
8. P1 展示 verified/resolved/rejected/expired 对应公共状态、来源和有效期。管理员发布/纠错/解除后，其他会话地图及路线提示同步更新；不能继续将旧公共结果标为当前。
9. 完成无路线、端点受阻、超区域、限流等待和服务不可用提示，失败保留输入；补齐区域、来源、演示标识及限制说明。

边界：
- B 负责上报/报告页面及管理自定义组件；C 负责数据/报告/管理后端；D 负责地理、搜索和路由。
- 公众外壳、全局样式、请求工具及公共地图由你维护；包管理、lockfile和构建由 D 统一合并。
- 浏览器只调用业务接口。使用脱敏 PublicReportDTO，不消费管理员私有详情。

执行与交付：
- 后端未就绪时按共享契约使用标识清楚的 fixture 开发，继续其他工作，随后完成真实联调；fixture 不算真实功能验收。
- 只执行相关静态检查、主流程与必要失败回归，不追求覆盖率或引入多套测试工具。
- 完成 P0 后继续本包 P1。只有 P0/P1 均完成才报告整包完成；外部依赖未验证则明确标记阻塞。
- 在 docs/handoffs/wp-a.md 交付实现清单、组件用法、检查证据、页面入口、基准/当前提交、遗留项和人工点击步骤。
~~~
