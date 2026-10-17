# D 交接：P0/P1 服务基础阶段

日期：2026-10-17。分支：`codex/d-backend-routing`。独立目录：`/Users/coreyli/.codex/worktrees/d-backend-routing/AccessLoop`。

## 固定提交与阶段

- baseDevCommit：`1ad24d707370a80fb0dc11da20b7e55be6d310c7`（已成功 fetch；权威文档与四包材料已在 dev）。
- headCommit / codeEvidenceCommit：`11b70ec667b09dee261d25f1889a9876ab3395cc`；随后执行记录提交不改运行代码，PR 实际 head 见 PR 元数据。
- 本阶段 PR：待发布，base 必须为 dev；合并后在本记录追加准确 deliveryHead / integratedDevCommit。
- 骨架历史：PR [#1](https://github.com/ZMX8Z/AccessLoop/pull/1)，集成 `912997dee420e0d2738b56aa0fb58d8965d9f894`；记录归档集成基线 `1ad24d707370a80fb0dc11da20b7e55be6d310c7`。
- 骨架已交接 C：Payload 配置、Collections、迁移、事务及仓储由 C 持有。本阶段 D 没有增加 ORM/应用数据库连接。

## 本次交付与接线

- 严格共享地理/区域/地点/通道/搜索/路线/上下文/调用摘要 Schema；结构 fixture 明确标为 synthetic。
- D 六个业务 HTTP 入口、统一错误/请求标识/禁止缓存、来源与匿名身份边界。C 仓储未安装时明确 503，不返回假区域/空避让/假路线。
- 地理：米制缓冲、路线片段与持久通道引用、20m 报告距离、闭合/自交/洞/面积/顶点/边界、端点阻塞、吸附与穿越检查；预览和确认复用同一函数。
- ORS：固定官方 HTTPS、轮椅限制原样透传、有效公共及当前会话个人避让合并、后验检查。
- 上下文：独立公共快照/publicRevision、本会话确认绑定；自然过期按读取时改变 activeDigest；两轮最多重算一次。
- 缓存：公共几何可共享，个人键与进行中 Promise 按服务器会话命名空间隔离；每次响应创建本人 routeRef，发布时要求 C 原子比较版本及新鲜摘要。Promise 保留到复核/缓存完成。各等待者保持自己的截止时间。
- 预算：按服务/密钥的持久原子预留接口，网络在事务外；配额、鉴权、429、超时等明确区分，重试重新预留，整个路线请求共享时限。真正上游调用开始后记录 call，统计迟到不会触发后台新调用。
- P1 搜索：真实 Pelias 适配、固定来源/bbox/数量、同查询缓存/去重，保留空结果和供应商失败区别。
- P1 配置/摘要：C 可调用完整区域影响验证及脱敏 24h 真实事件聚合；鉴权、命令事务与 B 后台展示仍待 C/B 挂载。
- 部署：脱敏配置/health/PG/TLS 探针、最小备份/空库恢复脚本、恢复说明、120 秒演示草案。

接线入口见 [d-service-integration.md](d-service-integration.md)，字段只在 [API_CONTRACTS](../authority/API_CONTRACTS.md)维护。

## P0/P1 清单与真实状态

| 项目 | 实现/验证 | 仍需完成 |
| --- | --- | --- |
| D0 骨架与统一文档 | 已进入 dev；原骨架检查可追溯 | Zenith 真实模板/部署 |
| P0 区域/地点/持久通道 | HTTP/Schema/来源规范化与仓储端口已实现 | C 持久化与已验证区域导入 |
| P0 双通道预览/确认几何 | 地理与引用桩通过 | C 真实报告确认事务、A/B 操作联调 |
| P0 ORS/个人绕行/隔离 | 服务、供应商和并发/迟到/自然过期桩通过 | C 原子预算/快照/routeRef后真实ORS闭环 |
| P0 预算重启保留 | 无内存生产替代；原子接口/门禁逻辑桩通过 | C 持久化实现及真实重启 |
| P1 搜索 | 适配器/缓存/区域/故障桩通过 | 持久Geocoding预算与A真实结果选点 |
| P1 公共生命周期双会话传播 | 公共快照与摘要/过期逻辑桩通过 | C管理命令、B正式挂载、A轮询与真实联调 |
| P1 区域命令与摘要 | D纯函数及服务桩通过 | C事务/鉴权/持久查询与B界面 |
| 重启/备份恢复 | 隔离PG真跑初始迁移/备份/重启/恢复，见JSON证据 | Zenith照片、确认、预算、过期业务恢复 |
| 线上入口/二维码 | 未部署，无可交付线上地址 | 实际Zenith项目及平台模板、真实HTTPS入口 |

本轮 P0、P1 和整包结果均为**外部条件/依赖阻塞**；本次通过范围仅为 D 服务基础阶段，未声称全项目完成。

## 地点与固定数据

[校园候选调查](../deployment/campus-survey.md)给出官方 GIS 与 OSM 可追溯坐标、共享起终点和两条候选通道，以及数据版本/旧图日期。它不是现场或 ORS 实测；两条通道缺 wheelchair/宽度/坡度标签、存在层级不确定性，未导入生产。C 不得把 `src/shared/fixtures/d-routing.ts` 作为已实测校园种子。

## 验证与恢复证据

- `pnpm check`：ESLint、Next路由类型、TypeScript、93/93测试通过。
- `pnpm build`：Webpack生产构建成功，包含公众入口、admin、cms-api、health及D六接口。
- 独立只读审查：本轮报告的错误码、去重空窗、全请求/等待者截止时间、统计写入迟到问题已修复；必要回归19/19通过。
- [本地恢复证据](../deployment/local-recovery-evidence.json)：独立临时 PostgreSQL 17.6 实测迁移8表、备份校验和、重启保留合成JSON、空库恢复一致及拒绝覆盖非空库；已清理临时集群。这不是照片/真实业务预算恢复证据。
- [部署入口](../deployment/README.md)、[恢复说明](../deployment/recovery-runbook.md)、[演示草案](../deployment/demo-120s.md)。

## 当前依赖与最小缺项

1. C阶段PR：实现并安装 `RoutingRepository`，尤其持久预算和提交时有效摘要复核；真实供应商调用只能在持久预留后进行。当前远端没有 A/B/C 阶段分支或可集成 PR。
2. A/B阶段PR：公众地图/上报/报告与正式管理组件挂载。D不以单模块测试替代联调。
3. 用户已提供ORS及应用秘密，主目录 `.env` 的非空项已同步到忽略的D `.env.local`；用户正在补齐Vision并授权本机专用PG配置。OSS 尚缺 endpoint/bucket/region/凭据。秘密不提交、不写入此记录。
4. Zenith实际项目/模板、部署连接与端口/出网/秘密注入规范；当前插件搜索未返回Zenith集成，不编造manifest，也不改变私有仓库可见性。
5. 校园候选的现场/真实ORS核验。线上二维码及演示入口待真实部署后生成。

## 人工操作

人工按本包 [MANUAL](../work-packages/d-backend-routing/MANUAL.md)与120秒草案操作页面；不要求人工运行命令/查库。当前没有完整在线闭环可供最终验收。数据库与密钥配置由开发代理继续处理，不转为人工技术验收任务。
