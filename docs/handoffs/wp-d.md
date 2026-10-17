# D 交接：P0/P1 服务基础阶段

当前集成回执见[四包阶段集成](../acceptance/d-four-package-integration.md)：B #8已合入dev `9cfd186`，统一产物构建和31项合后回归通过；Vision显式日预算已配置，新一次真实请求仍429/1305。以下较早阶段状态保留历史，最终P0/P1尚未通过。

日期：2026-10-17。分支：`codex/d-backend-routing`。独立目录：`/Users/coreyli/.codex/worktrees/d-backend-routing/AccessLoop`。

## 固定提交与阶段

- baseDevCommit：`1ad24d707370a80fb0dc11da20b7e55be6d310c7`（已成功 fetch；权威文档与四包材料已在 dev）。
- headCommit / codeEvidenceCommit：`11b70ec667b09dee261d25f1889a9876ab3395cc`；随后执行记录提交不改运行代码，PR 实际 head 见 PR 元数据。
- 服务基础阶段 [PR #4](https://github.com/ZMX8Z/AccessLoop/pull/4) 已合入 dev；deliveryHead=`df3ea0ce5cf588d00d7b61ccdc97adce602ca7fd`，integratedDevCommit=`27c8c8c38cf13634b26fb58dadd5255cd380b993`，合后再次 `pnpm check` 93/93通过。
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
| P0 区域/地点/持久通道 | HTTP/Schema/来源规范化与仓储端口已实现 | C0 仓储已合入；已验证区域/地点数据仍待导入 |
| P0 双通道预览/确认几何 | 地理与引用桩通过 | C 真实报告确认事务、A/B 操作联调 |
| P0 ORS/个人绕行/隔离 | 服务、供应商和并发/迟到/自然过期桩通过 | C0 原子接线及真实ORS连接已过；仍待真实公众个人绕行闭环 |
| P0 预算重启保留 | 无内存生产替代；原子接口/门禁逻辑桩通过 | C0 持久化及本机预算/事件重启已过；仍待确认/照片业务恢复 |
| P1 搜索 | 适配器/缓存/区域/故障桩通过 | 持久预算及真实Geocoding连接已过；仍待GET接口与A结果选点闭环 |
| P1 公共生命周期双会话传播 | 公共快照与摘要/过期逻辑桩通过 | C管理命令、B正式挂载、A轮询与真实联调 |
| P1 区域命令与摘要 | D纯函数及服务桩通过 | C事务/鉴权/持久查询与B界面 |
| 重启/备份恢复 | 隔离PG真跑初始迁移/备份/重启/恢复，见JSON证据 | Zenith照片、确认、预算、过期业务恢复 |
| 线上入口/二维码 | 未部署，无可交付线上地址 | 实际Zenith项目及平台模板、真实HTTPS入口 |

本轮 P0、P1 和整包结果均为**外部条件/依赖阻塞**；本次通过范围仅为 D 服务基础阶段，未声称全项目完成。

## 地点与固定数据

[校园候选调查](../deployment/campus-survey.md)给出官方 GIS 与 OSM 可追溯坐标、共享起终点和两条候选通道，以及数据版本/旧图日期。它不是现场或 ORS 实测；两条通道缺 wheelchair/宽度/坡度标签、存在层级不确定性，未导入生产。C 不得把 `src/shared/fixtures/d-routing.ts` 作为已实测校园种子。

## 验证与恢复证据

- `pnpm check`：ESLint、Next路由类型、TypeScript、94/94测试通过（最新四字段接线修正）。
- `pnpm build`：Webpack生产构建成功，包含公众入口、admin、cms-api、health及D六接口。
- 独立只读审查：本轮报告的错误码、去重空窗、全请求/等待者截止时间、统计写入迟到问题已修复；必要回归19/19通过。
- [本地恢复证据](../deployment/local-recovery-evidence.json)：独立临时 PostgreSQL 17.6 实测迁移8表、备份校验和、重启保留合成JSON、空库恢复一致及拒绝覆盖非空库；已清理临时集群。这不是照片/真实业务预算恢复证据。
- [部署入口](../deployment/README.md)、[恢复说明](../deployment/recovery-runbook.md)、[演示草案](../deployment/demo-120s.md)。

## 当前依赖与最小缺项

1. C0 [PR #7](https://github.com/ZMX8Z/AccessLoop/pull/7) 已合入 `5e4867d8b6141aacbc8fc4988f4aa41287bd370a`，真实仓储/会话/持久预算及D接线阻塞已解除；C1照片/AI/报告/确认和后续管理仍待交付。见[C0集成验收](../acceptance/c0-integration.md)。
2. A尚未发现远端阶段分支/PR；B已推送`adc4277`但尚无阶段PR，审查存在真实失败回退为桩成功、共享Schema重名和导出未接权限等阻塞，见[B审查](b-integration-review.md)。修复后再集成，不以单模块测试替代联调。
3. 用户已提供ORS/Vision及应用秘密；ORS与Geocoding已通过持久预算真实连接，Vision尚待C1与独立预算配置。主目录 `.env` 已安全同步到忽略的D `.env.local`；独立本机PG已配置、迁移及重启验证，见[本机开发库](../deployment/local-development-db.md)。OSS五项已由用户补齐，已同步D并通过本机基础读写/私有/签名过期/删除检查；用户更新管理员密码后已受控初始化，真实Payload Local API密码登录、签名令牌认证及enabled operator身份校验通过。秘密不提交、不写入此记录。
4. Zenith实际项目/模板、部署连接与端口/出网/秘密注入规范；当前插件搜索未返回Zenith集成，不编造manifest，也不改变私有仓库可见性。
5. 校园候选的现场/真实ORS核验。线上二维码及演示入口待真实部署后生成。

## 人工操作

人工按本包 [MANUAL](../work-packages/d-backend-routing/MANUAL.md)与120秒草案操作页面；不要求人工运行命令/查库。当前没有完整在线闭环可供最终验收。数据库与密钥配置由开发代理继续处理，不转为人工技术验收任务。


## 仓储接线与本机环境跟进阶段

- baseDevCommit：`27c8c8c38cf13634b26fb58dadd5255cd380b993`。
- codeEvidenceCommit / headCommit：`58fb0022ce24522545b6ca0555244dafc223e740`；运行代码仅将 routeRef 发布 context 显式限制为仓储声明的四字段，避免严格适配器因额外字段拒绝接线。
- 新增回归先失败后通过；最新 `pnpm check` 94/94 和生产 `pnpm build` exit0，独立只读复核15/15通过。
- 本机PG保留运行于127.0.0.1:55437；迁移仅一次、重复迁移无新增、重启保留、密码错误拒绝及SELECT1真实通过。/.local/及全部秘密文件已忽略且权限受限。
- 本阶段 [PR #5](https://github.com/ZMX8Z/AccessLoop/pull/5) 已合并；deliveryHead=`bd09cce8b023e5b380e5f9b05fddeb25ba145b52`；integratedDevCommit=`ca342d38db01fd2fcd88ba6b2cba0c48b3018ba8`。集成树与已构建head完全一致，合后`pnpm check`94/94通过；所有其他P0/P1与真实供应商/四包/Zenith阻塞仍如上。


## 最新环境与交付记录

- 用户更新管理员密码后，受控初始化exit0；通过同一Payload配置真实Local API密码登录、签名令牌认证和enabled operator身份，未打印/持久化token或密码。证据见[管理员验证](../deployment/admin-verification-evidence.json)。这不代替B/C后台自定义组件挂载或浏览器总验收。
- `pnpm start`实际在prestart以exit1拒绝缺少的5项OSS配置；没有回退临时照片存储。
- dev集成目录与D固定分支已安全同步；当时无A/B/C开放阶段PR；随后C0阶段已合入，最新状态见下节。后续仅同步执行记录的PR可复用同一运行代码证据。


## C0 集成、真实连接与候选数据阶段

- 本阶段 baseDevCommit：`5e4867d8b6141aacbc8fc4988f4aa41287bd370a`。C0 deliveryHead=`8c8526cdfb6bbab078b10ac08b0d02b51d465b75`，集成SHA同base；详细命令和范围见[C0集成验收](../acceptance/c0-integration.md)。
- 真实ORS/Geocoding各一次HTTP200已通过C持久预算执行；ORS固定公开候选返回56.8m/5顶点。只证明连接及候选几何，不代表实地轮椅通行或公众闭环。此前本地探针零HTTP失败也保留，不把预留数量冒充上游调用数。
- 本机开发库已私有备份、应用三个C0增量，重启后管理员/4迁移/3预算预留/4脱敏事件均保留。未导入未实测校园区域。
- [候选数据交接](../deployment/campus-data-handoff.md)新增两条来源可追溯通道、两个端点及10个地点；所有地点无障碍标签保持unknown，三个发布门保持false。不是C受控seed，不接运行时。
- B固定head双轴审查及5条TypeScript导出冲突已记录；未修改或合并B源代码。A/B与C1及P1后续仍待交付。
- 最新D工作树 `pnpm check` exit0，108通过/0失败/3默认跳过。新交付仅候选JSON、语义测试和执行记录；运行时与已构建C0集成树一致，可复用同树构建/真实DB/HTTP证据。
- 本阶段head/PR以交付PR元数据及后续执行记录为准。完整P0/P1、现场核验、OSS、Zenith、图片/确认恢复和120秒在线演示仍未完成。

本次准备阶段 codeEvidenceCommit/headCommit：`08f160dad39777e26841c69339114811bd9cda67`；baseDevCommit：`5e4867d8b6141aacbc8fc4988f4aa41287bd370a`。后续仅执行记录提交不改变运行代码，最终deliveryHead与集成提交见本阶段PR元数据。


## OSS 配置与连接解除阻塞

- baseDevCommit/codeEvidenceCommit：`d3e06bded36f2ca4cef98cd2a802dc633acf8a01`。运行代码、依赖、Schema及迁移未改，本阶段只同步忽略环境和交付执行记录。
- 主目录.env五项OSS非空，已仅同步这些值到D的.env.local；两文件均0600，秘密未打印/提交。
- `pnpm deploy:probe --http --database --egress`通过本地health、PG和ORS/OSS/GLM TLS；`pnpm exec tsx scripts/check-environment.ts`独立exit0，原先OSS缺失的启动配置门禁已解除。
- [OSS真实连接证据](../deployment/oss-connection-evidence.json)：随机合成对象上传200、授权读取200、匿名403、签名200、同一短期链接先200后过期403、删除204及删除后404。两次探针对象均已删除；首次过短签名时序的失败明确保留，没有计作通过。
- C接线参数见[部署交接](../deployment/README.md#oss-接入实测参数交接给-c)。C0当前没有photos Collection或照片API，D没有越权修改C配置/集合。
- 剩余：C1照片/GLM/报告/确认与Vision预算、A/B真实UI、C后续管理、现场通道、Zenith及业务恢复。OSS不再列为“配置缺失”，仍待照片/Zenith端到端验收。


## A0 PR #11 独立审查

PR head=`3b5e8db54b1098dbd61c22acb12aca09a8b0edbd`，target dev=`2f38fcdc449c400dfcfbb916e2c64730a2bfcdbb`。阶段未通过，未合入：360px报告确认页根画布锁定且无法滚至提交；共享PassagePicker换路线后可沿用越界旧索引。隔离合并树check113通过/3跳过、build exit0，不能替代功能验收。完整双轴报告、复现和截图见[A审查](a-pr-11-review.md)。Schema归并与后续A1迟到context风险分别列明，未把明确Design Demo或未交付后续功能本身算作A0失败。


## A0 修复集成与 C1 准备跟进（2026-10-17）

- C 准备阶段 PR #13 已按固定head独立核查合入，integratedDevCommit=`9997880921d65739d9efd3bfc3bd507385e57d58`；图片/OSS/GLM探针模块可用，尚未启用照片/报告业务入口。
- 用户授权D帮助A后，在A固定分支修复手机确认页、通道索引、重复响应Schema和迟到context/配置并发发布；A PR #11 deliveryHead=`4678661d826b7077a292953cae06703eb52ab489`，integratedDevCommit=`1b17f3cfb6c787fb96d0dc01f098d3f3ea9f7b14`。独立复审及完整check/build通过，360px演示实际保存成功；仅为A0阶段。
- D `7a5697f` 补齐明确403配额识别、无效模型输出错误统计；真实GLM单次探针仍返回429/1305。已通过C仓储核对持久预留、脱敏事件与24h摘要，见[集成记录](../acceptance/d-integration-2026-10-17.md)和[Vision证据](../deployment/vision-connection-evidence.json)。正式C分析服务需接入分类器；未把错误结果或人工降级计作模型通过。
- P0/P1和四包总验收保持未完成：B修复交付、C1报告/照片/确认与管理、真实A/B联调、现场通道与Zenith仍待完成；OSS本机连接已过，GLM实时能力仍受上游限制。


本次统一运行证据提交为 `09946eb9f4ceaaa34e141a5554286484b1f01fe6`，同步base为 `1b17f3cfb6c787fb96d0dc01f098d3f3ea9f7b14`；`pnpm check`149通过/3跳过、生产构建exit0。阶段PR记录deliveryHead与最终集成SHA；完整命令、独立审查和限制见本次集成记录。


## C15 后续集成与地点/恢复阶段（当前状态）

C15已合入dev 6dfd3c559842b462d3139b89628e033995110bde；本D阶段以此为base，最终产品证据5b4ba4ced0ee721ab0948f9eaa9c825471209e6e。deliveryHead及integratedDevCommit由本阶段PR元数据锁定。完整命令、独立Standards/Spec与限制见[最新阶段](../acceptance/d-post-c15-integration.md)，C见[C15验收](../acceptance/c15-integration.md)。前述历史“C1未交付/无B PR”已经更新为本节状态。

- P0：C照片/人工报告/自动预览/明确确认及授权导出生产HTTP、真实OSS双会话权限通过；A地图使用C正式Schema。D地点适配/24h缓存/截断/预算已实现，但真实HeiGIT非法NaN、Overpass406，地点实时能力未通过；校园未实测。
- P0/P1：新增真实PG的C管理→D快照/路由缓存/各自routeRef→A过时判断回归1/1，通过个人隔离、重新核实、双会话公共集、自然到期、解除/重开；ORS为桩，未计导航验收。
- P1：C后台、区域命令、受保护真实摘要及原生旁路边界已挂载和生产HTTP复验；B公众报告流程仍在修复，P0/P1浏览器总闭环待验。
- 部署恢复：本机生产bundle的真实私有照片/合成报告/确认、原Cookie、预算事件重启与独立空库恢复通过；自然到期不复活，末次时间窗断言失败及独立复核均保留。Zenith和OSS对象独立备份回填未验证，测试归档不能当可用生产照片备份。
- 最终check：191通过、0失败、11项默认集成跳过；build exit0；本地日志与可提交脱敏证据可追踪，未重复GLM/ORS实测。
- 最新PR：C15已合入；B8已修正base为dev，旧head仍阻塞，修复使用B固定分支/独立工作树。D14集成SHA为1d2cd2b9b3420a9b0c072a3b54ec258839a95b19。

当前仍无Zenith在线入口或二维码。最小外部缺项：可用GLM账号响应、可用实时地点源、校园固定通道实测资料、Zenith真实项目/模板/部署权限。用户已提供数据库/OSS/ORS/Vision和管理员配置，不能再将“缺OSS密钥”列作阻塞。人工继续按所属MANUAL操作；未实测数据不导入生产。

## 配套对象恢复跟进

D PR #16已合入dev 0da6e8fa9cb473c10cc359d5316e57f4f2aacafb（deliveryHead c5b1bdce3655649bcc5d9683a9e60bc7f26ce857），完整树一致，合后36/36定向回归通过。同一产品树后续一次[配套对象恢复](../deployment/object-recovery-evidence.json)exit0，13检查/5清理通过：独立私有副本hash、仅本次原对象删除确认404后回填、配套空库和原Cookie/第二会话权限、到期重启不复活、既有6预算/10事件保持。补上前述“对象独立回填未验证”的本机缺项，保留旧记录。只验证单个明确合成样本，不代表全库照片备份或Zenith恢复；测试清理后归档不是生产恢复点。当前P0/P1仍缺B公众闭环、真实GLM/地点源、校园实测与Zenith。

配套对象演练的摘要复核范围：源/恢复库比较预算、事件、管理员和迁移计数；相同24h窗口聚合只在源库复核，恢复库未单独查询该聚合。

## B 修复工程准入与四包接线跟进

D协助B在其独立固定分支保留历史同步dev d49eef50a59cd3c42b6c6ce3996a075822a68228，修复产品4b642c63dc8cdb3918123934673c3d72e242f646。五项独立发现均修复；两轴各31/31（重叠）无剩余工程阻塞，全量check219通过/11默认集成跳过/0失败，D最终生产build exit0。真实C/OSS、明确合成区域的浏览器人工上传→报告→自动预览→确认/续期/描述修正/停用、授权导出/复制及第二会话404通过；360px无横向溢出。[B验收](../acceptance/wp-b.md)含截图与JSON，原生打印预览仍人工待验。新head交付/集成SHA见PR #8元数据。

D17恢复证据阶段实际集成SHA为d49eef50a59cd3c42b6c6ce3996a075822a68228；配套对象回填缺项已在本机解除。其后本次B浏览器无模型/ORS/搜索/地点调用。四包已有阶段成果共享，但P0/P1总验收仍须在最终集成提交完成真实GLM、地点、ORS/搜索公众闭环、校园实测和Zenith；未将本机人工路径算作最终完成。
