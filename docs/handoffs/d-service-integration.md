# D 服务接入交接（C/A/B）

日期：2026-10-17。此文件记录实现接线，不另定 HTTP 字段或业务规则；字段见 [API_CONTRACTS](../authority/API_CONTRACTS.md)，职责见 [COLLABORATION](../authority/COLLABORATION.md)。

## C：唯一持久化仓储

实现 `src/features/routing/server/repository.ts` 的 `RoutingRepository`，在 Node 服务初始化中调用 `installRoutingRepository(async () => repository)`（`runtime.ts`）。可通过 Next `instrumentation.ts` 的 Node register 加载；禁止在浏览器注册。每个 Node 进程必须接入同一 Payload 管理连接；本阶段没有生产内存替代。C0已通过PR #7集成，实际状态和证据见[C0集成验收](../acceptance/c0-integration.md)。

- `resolveSession` 只解析已验证 Cookie，返回内部会话命名空间，不从 URL/body 信任会话身份。
- `readSnapshot` 在同一快照中返回区域、该会话版本、公共发布快照与本人确认；不得以私有 rowVersion 拼公共快照。
- `publishRouteReference` 必须在事务提交时比较四个上下文值，并按当前时间重算有效集摘要；版本相同但自然过期也返回 null。引用随机生成、归属会话/区域，禁止过期引用复活。
- `reserveBudget` 用 service + keyFingerprint 原子串行预留，滚动 60s/24h，保守计超时/重试；`blockBudget` 持久化上游等待/配额熔断。网络请求发生在事务外。不能仅写“检查后再插入”。
- 缓存存原始 JSON 和到期时间；查询失败必须抛错。可返回完整 bbox 地点候选，D 截到 100 并标 truncated，不能先截 100 后声称完整。
- usage 只存 service/event/time/受控错误类别；不保存行程、查询文本、Cookie、秘密或密钥指纹。`getUsageSummary` 聚合真实记录。D 的 `readUsageSummary`/`summarizeUsage` 位于 `src/server/providers/usage.ts`，由 C 在鉴权 endpoint 使用，B 消费共享 DTO。

预览与确认均使用 `resolvePassage`；C 在事务中的最终版本/预览摘要核对后调用相同地理函数，几何不得另写一套。配置命令调用 `validateRegionConfigChange`，使用事务读取的**全部有效公共与个人确认**及通道绑定；合法变更的版本、审计与幂等由 C 一次提交。

Vision 调用复用 `ProviderGate.run({service:'vision', keyFingerprint, policy, operation, isErrorResult: outcome => outcome.aiStatus === 'unavailable'})`，政策独立配置，缓存复用另记 cacheHit。无效供应商输出保留 unavailable 降级并记一次 INVALID_PROVIDER_RESULT 错误，不自动重试；合法 uncertain 不计错误。分类器是内部服务接口，C15正式分析服务已接入；真实 GLM 仍须按账号实测，不能把人工降级计为识别通过。网络请求不可放进 Payload 事务。预算解析复用 `parseVisionPolicy`，配置取 `.env.example`；不将其他开发库的策略复制到当前环境。

## A/B：可消费接口

六个 D 端点已挂载到同一个应用。C0已在Node初始化安装真实仓储，C15已挂载报告/确认和管理流程；未导入合法区域时仍明确返回503，不会返回合成区域或空避让成功。A 使用 region 的白名单、context 轮询及真实 search；B 的路线选择用服务返回的本会话 routeRef 或持久化 preset ID/version，不自行提交个人多边形。C15后台已正式挂载并通过生产HTTP鉴权/命令复验；B公众上报前端与A真实路线仍须联调。

## Fixture 与固定路线

`src/shared/fixtures/d-routing.ts` 是带 provenance 的合成契约样例，仅供单元/接线测试。不能落成“已实测”校园数据。真实区域/通道/起终点须以 D 的校园资料与 ORS 实测记录替换并经 C 受控导入；线上默认不得安装测试 fakeRepository。


## OSS 本机连接补充

用户已补齐OSS五项配置，D本机通过S3兼容上传/读取/匿名拒绝/签名有效与过期/删除验证；配置参数和证据见[部署记录](../deployment/README.md#oss-接入实测参数交接给-c)。C在所属photos配置/存储适配器接入这些已验证选项；D未改Payload配置或Collections。基础OSS权限通过不代替照片API的归属、去EXIF和授权代理验收。

## 地点与 C15 后续接线

生产组合由 PlacesService → ProviderGate → C RoutingRepository 组成；地点读取不再使用 C 旧 getPlaces 的未实现占位。运行配置选择 createPlacesAdapter，详细策略只在[技术文档§8/§11](../authority/AccessLoop_技术文档_v1.0.md)维护。C getCache/putCache负责24小时缓存持久化，D保留源截断位与进行中请求；响应前复核configVersion/bbox。A客户端直接复用C正式的公私报告Schema，私人完整DTO验证后投影为地图所需字段，不保留照片/AI证据。

真实POI两次尝试尚未通过，见[连接证据](../deployment/poi-connection-evidence.json)；不会以空数组替代供应商失败。跨C管理命令→D有效集/缓存/routeRef→A路线过时判断的实库回归已通过，外部ORS使用确定性适配，明确不等于实地导航验收。C15验收与业务恢复范围见[D最新阶段记录](../acceptance/d-post-c15-integration.md)。
