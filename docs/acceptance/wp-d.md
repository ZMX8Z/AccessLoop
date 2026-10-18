# D 技术验收：服务基础阶段（P0/P1）

最新公众界面集成见[Stitch 真实主入口验收](../acceptance/d-stitch-live-integration.md)：复用 A PR #21，默认进入真实 `/route`，三 Tab 已接现有业务与 Leaflet；旧 `/live`/静态 HTML 兼容跳转。该阶段与 Zenith、校园实测和完整 P0/P1 验收分别记录。

最新部署阶段见[Zenith验收](../acceptance/d-zenith-preview.md)：用户已授权并实际上传，固定版本、干净生产构建和check277/12/0通过；平台BuildKit反复重试后已停止，暂无在线入口、平台数据库或P0/P1通过结论。可转交的具体作业材料见[排查记录](../deployment/zenith-build-triage.md)。

地图/cloud阶段见[最新验收](../acceptance/d-map-cloud.md)：真实Leaflet/OSM底图、cloud补充设施15条及来源/许可、生产浏览器和262通过/11跳过/build exit0已验。底图、Token、许可选择及保留Demo入口见[部署接线](../deployment/maps-and-facilities.md)。原HeiGIT/Overpass失败保留，但“无任何实时设施来源”已解除；模型上一阶段已通过。以下旧阶段状态按时间保留，完整P0/P1仍缺现场、最终导航/搜索/公共管理闭环、人工验收和Zenith。

上一模型阶段见[付费GLM验收](../acceptance/d-paid-vision.md)：用户指定glm-4.6v并确认充值，本机真实私有照片分析/重放/缓存通过；全量check220通过/11跳过，build exit0。前次[四包集成](../acceptance/d-four-package-integration.md)及以下旧模型失败均保留历史。该模型阶段当时尚未验证地点源；后续地点补充见上述地图/cloud阶段，校园实测、Zenith与最终P0/P1仍未通过。

日期：2026-10-17。固定分支：`codex/d-backend-routing`。

| 字段 | 值 |
| --- | --- |
| baseDevCommit | `1ad24d707370a80fb0dc11da20b7e55be6d310c7` |
| headCommit / codeEvidenceCommit | `11b70ec667b09dee261d25f1889a9876ab3395cc` |
| stage | D地理/路由/预算/搜索/摘要/部署准备基础；非完整P0/P1 |
| PR / deliveryHead / integratedDevCommit | [#4](https://github.com/ZMX8Z/AccessLoop/pull/4) / `df3ea0ce5cf588d00d7b61ccdc97adce602ca7fd` / `27c8c8c38cf13634b26fb58dadd5255cd380b993` |
| runtime | Node22.14.0 / pnpm10.20.0 / 本地PG17.6 |

## 执行结果

| 命令/场景 | 结果 | 证据范围 |
| --- | --- | --- |
| `pnpm check` | 通过，exit0 | ESLint、Next路由类型、TS、93/93测试 |
| `pnpm build` | 通过，exit0 | 单应用生产Webpack，D六接口/admin/cms-api/health |
| 地理19项 | 通过（合成数据） | 缓冲、洞、自交、顶点/面积/障碍上限、端点/吸附/相交、配置冲突 |
| ORS/Pelias适配14项 | 通过（fetch桩） | 固定域、限制与避让、来源/bbox、数量、稳定ID及错误映射 |
| 预算/路由必要19项独立复核 | 通过（仓储/时钟桩） | 持久预留边界、有限重试、缓存/个人隔离、自然过期、两轮stale、去重填缓存空窗、共同deadline、等待者独立超时、迟到统计不得新发请求 |
| 实际挂载处理器 | 通过（未装仓储时） | 503安全错误包络、fresh requestId、private/no-store；health保持200；405可控 |
| 搜索/地点/usage | 通过（仓储/供应商桩） | 空结果与失败、区域/数量、配置变化失效、unknown标签、真实事件聚合语义 |
| `bash -n scripts/backup-restore.sh` | 通过 | 单独脚本语法及10项部署脚本用例 |
| 隔离本地PG备份恢复 | 通过（真实PG） | [JSON](../deployment/local-recovery-evidence.json)；迁移8表、备份、重启、空库恢复及拒绝非空覆盖；合成sentinel不等于业务记录 |
| 用户本地配置探针 | 部分通过/阻塞 | 专用本机PG迁移/重启/密码认证/SELECT1通过；ORS/GLM仅TLS通过，秘密已同步；OSS缺失，用户更新密码后管理员已受控创建并验证Local API登录/令牌身份 |
| 真实ORS/Geocoding/GLM、OSS、Zenith | 未验证/外部条件阻塞 | 未绕过C持久预算直接调用；无真实部署/线上二维码 |
| A/B/C集成与管理正式挂载 | 未通过（依赖未交付） | C0随后已集成，A/B和C1/P1仍待交付；未声称四包已合入 |

## 独立审查

只读reviewer依据authority及当前工作树检查，定位的四类实质边界已各自RED→GREEN修复。最终19项必要回归通过并同意合入“D服务基础阶段”；不覆盖真实数据库事务、供应商权限、线上流程或人工验收。

## 阶段判定

- 本阶段D独立服务/部署准备：通过。
- P0：外部条件/跨包依赖阻塞，未完成真实个人绕行闭环。
- P1：外部条件/跨包依赖阻塞，未完成真实搜索及公共管理闭环。
- 整包/全项目/人工验收：未完成。

运行代码、依赖、迁移变化须复验受影响项；后续纯执行记录提交可复用本次代码证据。骨架历史证据见git历史中的本文件与PR#1；本次不重复真实外部调用。


## 跟进验证：C原子仓储输入与本机开发库

- baseDevCommit：`27c8c8c38cf13634b26fb58dadd5255cd380b993`。
- headCommit/codeEvidenceCommit：`58fb0022ce24522545b6ca0555244dafc223e740`。
- 新增严格四字段发布测试RED→GREEN，独立只读差异复核15/15通过。
- `pnpm check`：exit0，94/94；`pnpm build`：exit0，所有既有动态入口。
- `pnpm deploy:probe --database`：exit0，POSTGRES_SELECT_1；数据库/两项应用秘密/ORS/Vision配置存在（不输出值），OSS缺失。
- [持久本机PG证据](../deployment/local-development-db.md)：初始迁移/status及重复执行、只执行一次记录、专用集群重启保留、非超级应用角色、错误密码拒绝、私有文件权限与忽略规则。
- 服务基础集成`27c8c8c`上再次`pnpm check` 93/93通过，且整个提交树与已构建PR head一致。跟进[PR #5](https://github.com/ZMX8Z/AccessLoop/pull/5) deliveryHead=`bd09cce8b023e5b380e5f9b05fddeb25ba145b52`，integratedDevCommit=`ca342d38db01fd2fcd88ba6b2cba0c48b3018ba8`，合后`pnpm check`94/94通过，完整树与已构建head一致。
- P0/P1/总验收判定仍为外部/跨包依赖阻塞，没有把新本地库当作C业务事务/真实外部能力通过。


## 受控管理员与生产门禁

用户更新密码后，`pnpm admin:bootstrap`退出0；同一Payload配置的真实密码登录、签名token认证与enabled operator校验通过，见[脱敏证据](../deployment/admin-verification-evidence.json)。没有在提交或记录中保存用户名/密码/token。`pnpm start`因明确缺少OSS五项配置在prestart退出1，符合生产门禁；不会因此声称生产启动或照片功能通过。


## C0 合入后的依赖与真实连接验收

C0 [PR #7](https://github.com/ZMX8Z/AccessLoop/pull/7) deliveryHead=`8c8526cdfb6bbab078b10ac08b0d02b51d465b75` 已串行合入dev，integratedDevCommit=`5e4867d8b6141aacbc8fc4988f4aa41287bd370a`；该head与集成树一致。完整证据见[C0集成验收](c0-integration.md)。Unix真实数据库套件121通过/0失败/1HTTP待单独执行；HTTP随后1/1通过；lint/typecheck/build exit0。C0工程准入通过，C整包并未通过。

D同步该base并加入离线校园交接后，`pnpm check` exit0：108通过、0失败、3默认跳过；新增候选5项全过。原始XML与20个node/两条way坐标及标签核对一致。数据与测试不改变运行代码，复用上述同树构建证据。

[真实连接记录](../deployment/provider-connection-evidence.json)：ORS一次HTTP200、Geocoding一次HTTP200，均先由C持久原子仓储预留。专用PG重启保留管理员、迁移、预算和脱敏事件。之前本地探针的零HTTP输入错误已明确披露；不以其call事件证明上游调用。Vision/OSS/Zenith、现场和四包UI总闭环仍未通过。

[B阶段审查](../handoffs/b-integration-review.md)未通过准入：正常业务路径桩回退掩盖真实失败等问题待B修复。D P0/P1整体判定保持未完成。

本次准备阶段 codeEvidenceCommit/headCommit：`08f160dad39777e26841c69339114811bd9cda67`；baseDevCommit：`5e4867d8b6141aacbc8fc4988f4aa41287bd370a`。后续仅执行记录提交不改变运行代码，最终deliveryHead与集成提交见本阶段PR元数据。


## OSS 本机真实连接验证

baseDevCommit/codeEvidenceCommit=`d3e06bded36f2ca4cef98cd2a802dc633acf8a01`。用户更新主目录.env后，D仅同步五项OSS配置，未修改运行源码/依赖/迁移。独立生产配置检查exit0；health/PG/TLS探针通过。真实S3兼容探针完成上传、读取、私有匿名拒绝、签名有效/过期及删除；9项最终检查通过，两个自建探针对象均清理，见[JSON证据](../deployment/oss-connection-evidence.json)。首次短签名时序失败保留且未计通过。

本轮没有产品代码变化，不重复全量构建和供应商路由调用；复用同运行树的C0集成证据。OSS配置/本机基础权限阻塞已解除；C照片API与会话隔离、GLM、Zenith和最终P0/P1仍未通过。


## 2026-10-17 后续集成

C13准备阶段、A11修复与D供应商硬化的固定提交、独立审查、真实GLM失败和真实24h事件摘要见[本次集成记录](d-integration-2026-10-17.md)。A11已经合入dev `1b17f3cfb6c787fb96d0dc01f098d3f3ea9f7b14`，A0可用不代表A完整P0/P1。D最终统一树检查结果追加到同一记录；最终P0/P1判定保持未完成。


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

付费模型阶段：baseDevCommit=7da9f32fe62b2916de038b949db3a28f5a351af2，codeEvidenceCommit=f7357ac14d7123e3ff394e4073d269d07365580f。运行默认值、当前fixture/调用方和authority同步，沿用原key持久账本；首次1113后用户确认充值才解除该上游封锁，3条原预留保留。后续生成图连通5121ms与真实私有照片HTTP分析7508ms成功，原键重放及新键缓存不新增请求；自建数据/OSS对象已清理。两轴独立vision各19/19（重叠）无发现。最终deliveryHead/集成SHA见本阶段PR元数据，完整范围见上述付费验收。

## 真实底图与设施补充交接

baseDevCommit=2d85e52c7e488c706f1fad606a67ebf55ec317d2，codeEvidenceCommit/headCommit=938cfc29d2b91f31102f562b5a1ffc8ff2de863c；最终交付/集成SHA见本阶段PR元数据。Leaflet依赖/锁文件、共享MapView、设施Schema、HTTP与客户端已同批同步；A/B保持既有props。C预算/缓存仓储所有权不变，无迁移/新连接。两轴发现均修复并独立复核。真实事件、原失败、截图与清理详见上述阶段验收；本阶段没有ORS/模型/搜索外呼。

本机http://localhost:3000/live保留isDemo=true的独立设施演示区域，C初始化所需一条synthetic通道明确标为未实测，不作为生产校园种子。云设施是实际读取；源故障、许可与unknown在UI可见。主/工作树环境均仅本地保存cloud配置。现场与Zenith缺项不因设施连通而消失。

## Zenith 预览失败修复准备（2026-10-18）

baseDevCommit=`9891b3ba7a8e6f14fa5cb3b59a34d713f654cfae`；codeEvidenceCommit=`86a3892635b117d5ea4c9311ab39985cdcef2ab3`，最终交付 head 见本阶段 PR。已安全同步 dev 并先集成 D 子分支 CLI 锁定提交；原预览因 Node22.23.3 与项目要求22.14.0 不符而失败。Docker 版本已固定，按用户选择加入平台持久 PostgreSQL 与顺序 C 迁移/初始化、私有账本接管。没有增加 ORM、修改 C Collection 或覆盖本机数据。

统一 check270通过/11默认集成跳过/0失败，无环境文件生产构建exit0，两轴独立复核通过。初次私有准备26项29789字节，源库只读，源码压缩包不含秘密；上传前须按最终 head 刷新导出。相同密钥的旧实例须停用或共用原子仓储，快照不能充当双库同步。

自动审批在执行前拒绝了向 Zenith 传输私有源码和数据库/OSS/供应商/管理员配置，`up` 未执行；待用户明确授权后再做真实平台验收。本阶段 draft PR 尚未集成，无新线上入口或二维码，不表示 D 或全项目 P0/P1 完成。[完整验收](../acceptance/d-zenith-preview.md)、[操作与待验步骤](../deployment/zenith-preview.md)。此前“缺 Zenith 模板/入口”已更新为：模板、contract/schema、认证 CLI 已具备，传输授权与修复后平台验证待完成。

## 已授权的 Zenith 兼容修复跟进

用户明确授权后已上传。平台渲染不接受 input/pre_start 的实测差异已解决；受控空库入口、C原生迁移与账本接管的该轮产品/上传提交为2ec148e9a914833b23c414b60bff14ed81c609ae。check274通过/12默认跳过/0失败，真实PG schema保护回归1/1及独立两轴复核通过。该轮会话01M56JV8MV4VTSHRF0NZTEGNYF已进入平台构建，线上HTTP/持久性仍待验；此前“待传输授权”不再代表当前状态。完整范围见[Zenith验收](../acceptance/d-zenith-preview.md)。

Zenith 控制面已于2026-10-18 15:13（Sydney）恢复；原会话随后连续三个 BuildKit 作业在 Next 编译阶段重试，仅返回 PREVIEW_RETRY，完整日志没有具体编译错误/退出信号。旧作业已在业务运行前停止并确认deleted，未新增供应商调用。当前构建缓解产品 270b220db892ff0faeb2e3b5cdf90f6e4d5d80c9 已通过check（277通过/12默认跳过/0失败）及独立兼容复核；无env生产构建证据来自同应用源码d55e6db的本机测量（默认堆46.30秒；1024MiB堆46.41秒，均exit0）；最终平台会话01M56N0A21JF9QGSS7SG0TZ9ZG两次构建失败后开始第三次重试，15:48（Sydney）显式停止且确认deleted，无线上入口。用户随后已授权源码经dev同步main，PR #23的实际集成SHA见发布回执；平台恢复证据仍缺。具体原因不能归为已确认OOM，cgroup限额未暴露。详见[记录](../acceptance/d-zenith-preview.md)。

最终构建缓解：270b220db892ff0faeb2e3b5cdf90f6e4d5d80c9仅限制Docker构建进程旧生代1024MiB，不限制运行内存；同应用源码无env冷构建exit0、46.41秒、峰值RSS1519419392字节，当前提交check277/12/0、定向11/11与独立复核通过。过小堆和外置依赖试验失败后均未采用；具体在线结果以[Zenith阶段验收](../acceptance/d-zenith-preview.md)为准。

最终停止记录：会话01M56N0A21JF9QGSS7SG0TZ9ZG的7d6z9/jtsrx作业失败后自动创建km9ht，错误详情仍仅PREVIEW_RETRY通用消息；2026-10-18T04:48:03.987Z已确认deleted。没有业务运行/线上预算恢复。下一步需平台提供实际构建退出原因/限额，详见[排查材料](../deployment/zenith-build-triage.md)。

2026-10-18 main源码同步已获用户明确授权。授权前D头43b2880的check277通过/12默认集成跳过/0失败、实际私有值扫描0命中。实际集成/发布SHA及main候选核验结果由[发布记录](../deployment/main-sync-2026-10-18.md)引用PR #23正文回执；Zenith部署与完整P0/P1验收仍未通过。


2026-10-18 报告选点修复：baseDevCommit=`9c2fdaf42788ee881d8379653be076bb9955c35d`，产品`4514b5c43be8447b432b2a7472ef15977f3b047f`。无路线时隐藏From/To空控件，预设通道紫线、坐标范围/缺项提示及未应用坐标保存拦截已交接A/B；无需ORS即可保存预设报告。check314通过/12默认集成跳过/0失败，生产build与真实C/OSS的手机手动保存、管理员HTTP200核对通过。详见[本阶段验收](../acceptance/d-report-location.md)；PR正文记录deliveryHead和实际集成SHA。无HTTP/Schema/数据库变更；本次合成报告未启用避让，不计实时模型/最终P0/P1验收。
