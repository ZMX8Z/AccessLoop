# D 服务接入交接（C/A/B）

日期：2026-10-17。此文件记录实现接线，不另定 HTTP 字段或业务规则；字段见 [API_CONTRACTS](../authority/API_CONTRACTS.md)，职责见 [COLLABORATION](../authority/COLLABORATION.md)。

## C：唯一持久化仓储

实现 `src/features/routing/server/repository.ts` 的 `RoutingRepository`，在 Node 服务初始化中调用 `installRoutingRepository(async () => repository)`（`runtime.ts`）。可通过 Next `instrumentation.ts` 的 Node register 加载；禁止在浏览器注册。每个 Node 进程必须接入同一 Payload 管理连接；本阶段没有生产内存替代。

- `resolveSession` 只解析已验证 Cookie，返回内部会话命名空间，不从 URL/body 信任会话身份。
- `readSnapshot` 在同一快照中返回区域、该会话版本、公共发布快照与本人确认；不得以私有 rowVersion 拼公共快照。
- `publishRouteReference` 必须在事务提交时比较四个上下文值，并按当前时间重算有效集摘要；版本相同但自然过期也返回 null。引用随机生成、归属会话/区域，禁止过期引用复活。
- `reserveBudget` 用 service + keyFingerprint 原子串行预留，滚动 60s/24h，保守计超时/重试；`blockBudget` 持久化上游等待/配额熔断。网络请求发生在事务外。不能仅写“检查后再插入”。
- 缓存存原始 JSON 和到期时间；查询失败必须抛错。可返回完整 bbox 地点候选，D 截到 100 并标 truncated，不能先截 100 后声称完整。
- usage 只存 service/event/time/受控错误类别；不保存行程、查询文本、Cookie、秘密或密钥指纹。`getUsageSummary` 聚合真实记录。D 的 `readUsageSummary`/`summarizeUsage` 位于 `src/server/providers/usage.ts`，由 C 在鉴权 endpoint 使用，B 消费共享 DTO。

预览与确认均使用 `resolvePassage`；C 在事务中的最终版本/预览摘要核对后调用相同地理函数，几何不得另写一套。配置命令调用 `validateRegionConfigChange`，使用事务读取的**全部有效公共与个人确认**及通道绑定；合法变更的版本、审计与幂等由 C 一次提交。

Vision 调用可复用 `ProviderGate.run({service:'vision', keyFingerprint, policy, operation})`，政策独立配置，缓存复用另记 cacheHit；有效 uncertain 结果不抛供应商错误。网络请求不可放进 Payload 事务。

## A/B：可消费接口

六个 D 端点已挂载到同一个应用。C 仓储尚未安装时明确返回 503；不会返回合成区域或空避让成功。A 使用 region 的白名单、context 轮询及真实 search；B 的路线选择用服务返回的本会话 routeRef 或持久化 preset ID/version，不自行提交个人多边形。最终 UI 和 C 后台挂载仍须真实联调。

## Fixture 与固定路线

`src/shared/fixtures/d-routing.ts` 是带 provenance 的合成契约样例，仅供单元/接线测试。不能落成“已实测”校园数据。真实区域/通道/起终点须以 D 的校园资料与 ORS 实测记录替换并经 C 受控导入；线上默认不得安装测试 fakeRepository。
