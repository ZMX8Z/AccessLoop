# A：Stitch 与真实业务页面整合验收（2026-10-18）

本节为本次最新执行记录，下方旧阶段保留为历史。交付范围是六份 Stitch 设计对应的真实公众页面及 P0/P1 客户端接线；不是静态 Demo 通过，也不宣称全项目 P0/P1、校园实测或 Zenith 已通过。

## 固定基线、目录与运行环境

- 分支：`codex/a-frontend-map`；目录：`/Users/coreyli/.codex/worktrees/accessloop-a-fixes/AccessLoop`。开始时干净且没有其他活跃 A 修改会话。主入口仓库保持 dev，3000保留服务未停止。
- 成功 fetch 后合入最新 dev：`526b2f4265391ea5f433f7a70efccd34eae30ffd`（含#20）；交付前再次 fetch/merge，返回 Already up to date。没有 reset/stash/rebase/强推。
- baseDevCommit：`526b2f4265391ea5f433f7a70efccd34eae30ffd`。
- 初始功能证据：`3b128b5f0b24c606277dd45448b9b728dae4338b`；首轮复核修复：`7d19b6e1709e2bc09a8c52c5c79553b8d5fc1193`；字体、恢复守卫与隐藏设施刷新：`e7ff5e9a3225162a025bb047813886ab2a3ce5fe`。
- 阶段PR：[#21](https://github.com/ZMX8Z/AccessLoop/pull/21)，base=`dev`，已创建并附加；D统一集成，尚未合并。
- 最终 codeEvidenceCommit：`b288bd90902ca33d5a1720d413b3029551d9d4b9`。deliveryHead 由阶段 PR 正文及平台 head SHA 固定，避免将包含自身 SHA 的文档作为自引用证据。后续只增加交接/截图、日志和OFL许可行尾空白，不改变运行时代码或字体二进制。
- Node22.14.0、pnpm10.20.0；按现有lockfile安装，无依赖/lockfile/构建配置变更。生产服务3121，APP_BASE_URL=`http://localhost:3121`，使用已有应用和数据/供应商配置，未新建DB/ORM。

实际入口：[R1](http://localhost:3121/route)、[Report](http://localhost:3121/report)、[My Reports](http://localhost:3121/my-reports)。完整原稿→组件→真实接口→URL映射见[A交接](../handoffs/wp-a.md)。`/`、`/live`、旧`/reports`均兼容重定向；`/preview`是独立fixture回归入口，`/stitch`只作原稿参考。

## 命令、回归与独立复核

| 检查 | 实际结果 |
| --- | --- |
| `pnpm check` | 最终b288bd9实际exit0：294项，283通过、11默认外部集成跳过、0失败；ESLint、Next类型生成与TypeScript通过 |
| `pnpm build` | 最终b288bd9实际exit0：成功编译，TypeScript通过，13/13静态页与全部真实动态入口生成 |
| `git diff --check` | 最终产品及交接文件实际运行通过 |
| 必要失败回归 | routeRef到期、开始行程守卫、上下文/配置代次、隐藏设施刷新、照片替换/单按钮上传、成功恢复、详情复制有效期与来源导航；相关行为先复现失败再修复 |
| 独立复核 | 初始Standards无阻塞；Spec三项P2：详情新报告取消来源、Inspect残留面板、复制过期有效期。修复头7d19b6e定向14/14及实际处理器5/5通过。e7ff5e9增量两轴无新P1/P2，18/18及隐藏文档/配置变更/恢复3/3通过，Directions均0；最终b288bd9的M1增量Standards/Spec均通过、33/33相关回归及有效/过期/Resolved/公开4/4实际处理器通过，无剩余P1/P2阻塞 |

输出保存于[check](screenshots/stitch-live/check-final.txt)、[build](screenshots/stitch-live/build-final.txt)。独立复核为另一只读agent完成，未修改产品、未调用供应商。测试跳过项不计真实外部通过，复核重叠测试不能与全套相加。

## 真实浏览器闭环与边界

实际使用3121生产构建、360×800和1280×900；逐次读取DOM、可见结果和截图，不用静态稿或接口单测代替业务浏览器证据。

| 场景 | 真实结果与证据范围 |
| --- | --- |
| R1文字搜索/选点 | 真实UNSW搜索返回5项，选择UNSW Library；地图、设施列表及手工经纬度选点可用；参数仍为区域配置支持的6%、0.06m、0.9m |
| R1→R2→返回 | 初始3b128b5真实ORS返回57m、约1min，地图与起终点保留，行程显示实际参考节点。最后两轮重算出现真实超时，最新头没有新的可用ORS结果；当前失败保留输入、无Start Journey；最终b288仅调整M1紧凑卡，未再重复ORS。不能将旧成功截图说成新头供应商成功 |
| 上传/分析降级 | 明确标记SYNTHETIC UI TEST / NOT FIELD EVIDENCE的生成图真实私有上传；同意后一次GLM调用provider_timeout，界面明确失败后选择人工继续。没有假AI测量或成功 |
| 修正/预览/确认/成功 | 实际填写obstruction、观察时间、[151.2295,-33.917]、既有synthetic预设通道；保存服务端事实，自动真实预览，明确勾选确认。实际报告`d85e620a-7892-4c02-bfe3-2e68761f3055`、rowVersion2、个人版本2、有效至2026-10-17T23:35:00Z；公共未启用 |
| P3最终头恢复 | 最终字体/守卫代码中仅通过本人详情+本人列表授权读取恢复该有效报告，显示真实ID和当地时间；没有重发写请求/AI。停用后最终b288浏览器直接访问该ID显示No completed submission |
| 三Tab/草稿/筛选 | 取消Route来源后重新进入报告，说明、位置和照片仍在；M1 Active Detour→M2→New Report→Cancel返回My Reports，筛选保留。最终e7再次真实上传后只走人工草稿，P1/P2往返说明/位置/通道保持，不创建第二条报告或第二次GLM |
| M1/M2/导出 | 本人列表、详情、真实私有照片可读，Copy显示成功；授权HTML导出实际打开并截图，原生系统打印对话框未执行。复制有效期由实际处理器/边界回归核对，不声称系统剪贴板跨API读取通过 |
| 真实个人有效集变化 | 真实详情Stop my personal avoidance成功：rowVersion3、personalVersion3、有效个人数0；返回Route立即提示重算；保留私有合成测试记录，没有删除或公开发布 |
| 会话隔离 | 新匿名会话读取该报告、照片、导出均404，Cookie/owner哈希未保存。公开字段仍由C既有DTO控制 |
| 迟到与公共有效集 | `/preview`明确fixture下延迟规划→公共集变化→释放迟到响应，旧结果不能恢复Current context/Start Journey；真实公共管理发布本轮未重复，不能把fixture当真实公共发布 |
| 自动调用约束 | 实际短窗口内关闭/打开面板、Escape、地图缩放、Inspect、停用和返回，provider-events为空；无Directions。另有真实处理器回归验证轮询/Tab/配置边界Directions0 |

[脱敏最终状态及宽窗口计数](screenshots/stitch-live/api-audit-final.json)与[短窗口0额外调用](screenshots/stitch-live/no-extra-directions.json)可复核。宽窗口从14:30Z至22:47Z，数据库记录ORS6次call/4error、Vision1call/1error、Geocoding2call、POI442call/442error/439cache_hit；包含其他3000保留服务和一次浏览器工具长时间暂停，不能全部归因于A本轮显式动作，也不能宣称全部供应商调用都最少。发现长时间后台设施刷新后，已增加非Route/文档隐藏暂停，保留5秒context/报告和配置变更强制更新；未清除真实预算或事件。

## 必须保留能力核对

| 迁移前行为 | 保留方式及核查 |
| --- | --- |
| Leaflet、真实瓦片、来源与许可 | 同一个MapView，配置化署名；实际OSM瓦片、15设施、两个accessibility.cloud来源及许可、7-Eleven unknown、主Overpass失败和非完整库存文案均可见；源接入证据沿用同基线[D记录](d-map-cloud.md) |
| 定位拒绝/坐标/参数 | 不强制定位；地图、列表、[经度,纬度]手工输入保留。定位拒绝后的手工选择没有依赖浏览器授权；单位来自唯一契约 |
| 搜索取消/迟到 | 原350ms防抖、AbortController与LatestRequest，不另造请求工具；真实搜索成功，迟到/输入代次回归通过 |
| 显式规划/限流/错误 | 只由Plan/Recalculate触发，原retryAfter等待保留；真实超时保留输入，轮询/地图/Tab不触发Directions |
| context/activeDigest/自然过期 | 原5秒版本屏障保留；routeRef自然到期也立即过时、隐藏几何及Start；实际个人变化+fixture公共变化+真实处理器竞态分别验证 |
| 区域变化/失败设施 | 配置代次变更先清旧设施、通道、许可、选择；失败不会将旧区重新标为当前；延迟region与旧plan交错回归通过 |
| 地图稳定与清理 | 首条真实routeRef只聚焦一次；时钟/轮询/Tab不重置视口，现有瓦片告警及销毁清理回归保留 |
| 通道、预览、确认、幂等 | 继续传唯一PassageRef、后端几何预览和明确同意；预设通道本轮真实闭环通过。当前路线片段组件/索引/过期回归通过，但最新生产头的真实路线片段上报未因ORS失败再走一遍，不计新通过 |
| 会话/私有数据 | 沿用唯一request/ensureSession与C服务端授权，真实第二会话404；B业务请求语义、Payload/Collections/仓储/鉴权及D供应商服务未改 |

## 原稿并排视觉核对

原六份HTML与截图均实际阅读/查看，没有改动`docs/design/stitch/source`。已实际打开下列六份左右对照，另查看桌面对照和真实截图；不能仅凭无溢出判通过。

[R1](screenshots/stitch-live/compare-r1.jpg) · [R2](screenshots/stitch-live/compare-r2.jpg) · [P1](screenshots/stitch-live/compare-p1.jpg) · [P2](screenshots/stitch-live/compare-p2.jpg) · [P3](screenshots/stitch-live/compare-p3.jpg) · [M1](screenshots/stitch-live/compare-m1.jpg)

[桌面R1](screenshots/stitch-live/compare-r1-desktop.jpg) · [桌面P1](screenshots/stitch-live/compare-p1-desktop.jpg) · [桌面P2](screenshots/stitch-live/compare-p2-desktop.jpg) · [桌面P3](screenshots/stitch-live/compare-p3-desktop.jpg) · [桌面M1](screenshots/stitch-live/compare-m1-desktop.jpg)；[完整证据说明](screenshots/stitch-live/README.md)。

- 层级：顶部品牌/步骤栏；地图先于完整表单，360px地图约336px高，卡片接地图下缘；桌面地图与摘要分栏。三Tab并列，P1/P2隐藏、P3恢复；搜索、参数、来源和列表放页内面板。
- 视觉：按原稿teal/lavender/mint、圆角卡、进度条、成功图标、筛选和主操作位置；本地Inter可变字体及OFL。M1在并排核查后再收紧为真正列表卡，360px实测卡高158px、桌面162px，完整ID/证据仍在详情。
- 交互：360px面板top120/bottom800、可视680、内容869，overflow-y:auto；实际Tab/ShiftTab环绕，Escape归还触发焦点；已测控件44px以上，安全区使用env(safe-area-inset-bottom)。P2聚焦提交后top445.5/bottom493.5、height48，可滚达，不固定裁按钮。P3主按钮top609.9/bottom665.9，Tab从728开始。
- 差异如实保留：真实OSM代替假地图；未知实测坡度/宽度/路面不编造；无音频、实时导航、经过节点或安全保证；P2真实时间/位置/通道/预览/明确同意比静态稿长；P3实际UUID及个人范围代替AL-204/校园派工；M1数量/状态由本人数据决定，无假Resolved/派工记录。
- 截图范围：R1对照是最新未规划状态，另存初始真实可用状态；R2可用图来自3b128b5、最终只有守卫/失败证据。全页拼接截图中固定Tab可能停在第一屏底部，主视口及提交按钮另有单屏图，不将拼接位置误报为实际裁切。

## 交付判断与尚未验证

客户端真实页面整合覆盖本轮相关P0/P1：Route/行程、三步上报、本人列表/详情/启停/授权导出均已接唯一真实业务，独立技术复核完成后提交base=dev阶段PR，由D统一集成。没有修改C/D运行时、依赖或原稿；跨B文件及使用方式已同步[wp-b](../handoffs/wp-b.md)。

尚未通过的外部/现场项：最终头可用ORS成功（后续真实超时）、本次GLM成功分析（provider_timeout，人工降级通过）、真实公共管理有效集浏览器复验、最新真实路线片段上报、原生打印、校园通道实测、Zenith在线部署。既有同基线C/D后端证据仍可核查，但不借此宣布本轮这些场景新通过。人工只执行[A MANUAL](../work-packages/a-frontend-map/MANUAL.md)。

---

## 以下为保留的历史验收

# A 阶段开发自检记录（非独立验收）

2026-10-17。分支 `codex/a-frontend-map`，目标 `dev`。

- baseDevCommit：`d3e06bded36f2ca4cef98cd2a802dc633acf8a01`。
- 范围：三 Tab Stitch HTML 交互、页面架构、公共地图/请求客户端阶段交付。
- Node 22.14.0；pnpm 10.20.0 frozen-lockfile 安装成功。`pnpm check` 的嵌套命令受到系统 pnpm 11/Node 24 影响，因此改为使用固定 Node 22 直接调用下列工具。

| 检查 | 本轮结果 |
| --- | --- |
| `node node_modules/eslint/bin/eslint.js .` | 通过，0 警告 |
| `node node_modules/next/dist/bin/next build --webpack` | exit 0；TypeScript 通过，静态页 6/6；编译输出有未展开 warnings，不能声称零警告 |
| `node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts` | 116 项：113 通过、0 失败、3 跳过 |
| 数据库/HTTP 集成测试 | 3 项按配置跳过，未启动真实服务，不计为通过 |
| `git diff --check` | 通过 |
| 浏览器主流程 | 复用此前同内容静态文件的 R1/R2、报告、列表和 360px 验证；截图见 screenshots/stitch-v2 |

本轮保留最新 dev 的 C/D 代码和共享依赖，未覆盖其他成员实现。未将之前 ZIP 上的 27 项结果当成本轮结果。

P0/P1 整包、独立技术验收、供应商调用、真实报告/绕行和公共状态双会话联调仍未完成。设计演示保存不代表向服务器提交报告。

PR：[#11](https://github.com/ZMX8Z/AccessLoop/pull/11)，已创建且目标为 dev。首次推送 head 为 `0e7265ce3d6f0b914e9b5c54d63f7806aec47df5`；本次记录 PR 链接的提交仅修改文档。尚未由 D 合入 dev，也未部署。

## 固定证据提交

- headCommit（产品代码及最终测试所对应的提交）：`a07cb471c5f69eaef751f344be139786723d207e`。后续提交只更新交接记录，不修改产品代码。
- 原功能提交：`050e5f14cecb7c301f3858e1f4613ab1cdbbe362`。
- 最后同步 dev 仅新增 D 的校园资料、文档和 5 项测试，无运行时代码变更；重新执行测试 116 项（113 通过、3 跳过），新测试 ESLint 通过，之前同内容运行时代码的构建证据仍适用。


## D 协助修复后的阶段复验（2026-10-17）

- baseDevCommit：`9997880921d65739d9efd3bfc3bd507385e57d58`；codeEvidenceCommit/headCommit：`a83ddf5b2fad948bf1b837666ad2f224e373c6cd`。后续交接提交只改文档，deliveryHead 由 PR #11 固定。
- `pnpm check` exit0：ESLint、Next 类型生成及 TypeScript 通过；147 项测试中144通过、0失败、3项默认集成跳过。
- `pnpm build` exit0，静态页6/6、/live和既有动态入口齐全；Webpack显示 compiled with warnings，未声称零警告。
- 新增10项修复回归：源HTML生成一项、跨路线两项、Schema三项、上下文单调一项、真实规划处理器三项。相关失败均先复现再修复。
- 独立 Standards 复核最终15/15定向测试通过，并独立复测延迟region与旧plan交错；Spec复核原四项通过，配置竞态追加由Standards复核。没有剩余A0合入阻塞。
- 360×800实际浏览器：Route → Report → sample → Confirm，宽度360无溢出；可滚动至提交，填写备注/位置后保存成功。截图见[手机修复](screenshots/pr-11-mobile-fixed.png)。仅证明明确标识的本地Design Demo流程。
- 阶段判定：A0可合入；真实P0、P1与整包仍未通过。后续集成SHA与D统一回归见D集成记录。
