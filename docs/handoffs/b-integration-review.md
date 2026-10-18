# B 阶段集成审查记录

日期：2026-10-17。集成人：D。此文件记录固定提交的审查，不替代权威规则，也不修改 B 工作分支。

- B head：`adc42779af23db231b6b3a46d479751dc4e54162`。
- B 与 dev 的 merge-base：`1ad24d707370a80fb0dc11da20b7e55be6d310c7`；本次集成目标 dev：`7d0f552f9b99472c8a61ee7038f28a2539d45abe`。
- 差异命令：`git diff 1ad24d707370a80fb0dc11da20b7e55be6d310c7...adc42779af23db231b6b3a46d479751dc4e54162`。
- 提交：`f666c99` 报告 UI；`adc4277` 管理配置/预览。
- 依据：[API_CONTRACTS](../authority/API_CONTRACTS.md)、[COLLABORATION](../authority/COLLABORATION.md)、[PROJECT](../authority/PROJECT.md)、B START 与验收材料。

两个只读 agent 分别检查规范和需求，主 agent 随后直接读取固定 head 的关键代码确认。当前结论：**未通过集成准入**；不能将 B 记录中的前端 P0/P1 通过当作四包真实通过。未在 dev 安装 B 代码，未用演示成功覆盖真实错误。

## Standards

硬规则违反：

1. `src/shared/contracts/hazards.ts:12,25,347,409` 重新导出 D 已有的 AvoidGeometrySchema/AvoidGeometry、InstantSchema、RegionDTO、PresetPassageDTO；违反 COLLABORATION §3 共享负责人及单一实现要求。须复用公共地理/区域 Schema，补齐必填字段。
2. `src/features/hazards/client/AvoidanceDrawer.tsx:76,113`、`src/components/admin/AdminHazardReview.tsx:118` 等将真实失败转换成桩成功，违反 API §2/§11。正常业务路径必须保留失败；如需演示页面，必须明确隔离。
3. `src/app/(frontend)/reports/[id]/export/page.tsx:14–21` 未按身份读取 DTO，任意 ID 恒返回私人 fixture，违反 API §10.3 的授权读取流程。此处尚未泄漏真实报告，但不是可验收的私人导出功能。
4. `src/features/hazards/client/api.ts:41–67` 自建请求体系且缺统一会话初始化，违反 COLLABORATION §4 A→B 公共请求工具约定。A 尚未交付可作为当前依赖说明，不能算接入已完成。
5. `src/components/admin/AdminHazardReview.tsx:48,55,67` 输入留空时自动生成现场核查摘要、工单号、公共方框和有效期，违反 PROJECT 独立核实证据要求。证据与范围须由管理员明确提供并经服务端验证。

判断项：未发现额外需要阻止阶段合入的代码 smell。

## Spec

1. 已实现但错误：API §2“不能返回虚假成功”、§7.4；`AvoidanceDrawer.tsx:66–77` 初次预览直接使用 fixture，113–126 将确认失败转换为激活。上传、AI、保存和审核也有类似自动 fallback。
2. 范围外行为：API §8.1 独立观察记录；`AdminHazardReview.tsx:43–79` 用默认文字和虚构工单补缺失证据，并自行构造公共范围。仅输入理由即可尝试核实，不满足业务要求。
3. 已实现但错误：API §10.3“读取权限与报告详情相同”；导出页未读取身份或真实报告，任意 ID 都返回固定私人样例。
4. 缺失：API §4.2/§4.5；`hazards.ts:347–365` 的 RegionDTOSchema 缺 routing，PresetPassageDTOSchema 缺 isDemo，且公共 barrel 导出与 D 重名。必须同步 Schema、fixture 和消费方。

规范轴 5 项硬规则问题，最严重为真实失败显示成功；需求轴 4 项问题，最严重同样为预览/确认未遵守真实结果。两条审查线独立记录，未把 C1/A 未交付本身算作 B 代码缺陷。

## 主 agent 验证与修复后准入

主 agent 使用 TypeScript CompilerHost 在内存中将固定 B hazards.ts 及其 barrel export 叠加到当前 D/dev；没有改磁盘或切分支。实际得到 5 条 TS2308，分别为 AvoidGeometry、AvoidGeometrySchema、InstantSchema、PresetPassageDTO、RegionDTO。这是精确的共享类型冲突证据，不声称已运行整个 B 合并构建。

修复应由 B 在固定分支同步 dev 并交付阶段 PR。最低复验：断开 API 后不显示保存/确认/审核成功；401/403/409 保留错误和输入；缺独立证据拒绝核实；两个会话的私人导出互不可读；合并后的共享契约、类型、构建通过。正式后台挂载和真实上报仍需 C/A 联调。


## PR #8 最新核对（2026-10-17）

扫描全部开放PR后发现[#8](https://github.com/ZMX8Z/AccessLoop/pull/8)原目标为main，因此此前只筛dev的交付查询遗漏了该PR。D已按唯一集成目标约定将base修正为dev；head仍为本报告已审查的`adc42779af23db231b6b3a46d479751dc4e54162`，没有新修复提交。主agent再次读取AvoidanceDrawer.tsx:66–76（实际预览固定useMock=true）及client/api.ts，原真实失败/演示混用阻塞仍成立；没有合入。

C15已从B旧版式适配真实后台组件并正式挂载，这不代表B整个报告分支已通过。B后续应同步当前dev中的C正式Schema、A请求工具和C已挂载组件，避免以旧hazards.ts或同名admin组件覆盖已集成实现。

## PR #8 修复复验

原adc/e7的未通过记录保留。本次修复产品4b642c63、交付基线dev d49eef5已移除正常流程fixture、重复Schema、私人假导出及旧admin-preview，保留C正式后台/契约，接A公共工具；五项独立复现的问题均修复，Standards/Spec各31/31（重叠）无剩余工程准入阻塞。D最终生产build和真实C/OSS的隔离浏览器上传/报告/预览/确认/续期/修正/停用、第二会话404已通过；打印原生预览与外部全闭环仍未验。详情见[B技术验收](../acceptance/wp-b.md)，最终deliveryHead/integratedDevCommit见本次[PR #8](https://github.com/ZMX8Z/AccessLoop/pull/8)。本节替代“旧head尚无修复”的当前结论，但不改写历史审查。
