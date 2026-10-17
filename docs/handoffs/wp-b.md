# A 整合后的 B 公众入口补充（2026-10-18）

最终M1采用ReportSummary compact分支的整卡链接、短编号/完整无障碍编号、两行摘要与短有效期；360px卡高158px。完整详情分支不变。不要恢复长详情摘要作为列表，也不要重新建立第二套上报/列表。

本节是本次用户授权 A 跨包视觉/客户端整合的交接，替代下方历史 `/live` 内联向导和旧报告入口事实。B 业务 API、ReportForm/AvoidanceDrawer 的保存/预览/明确确认、权限和幂等语义未另造实现。

- 当前：`/report`→`/report/confirm`→`/report/success/[id]`；`/my-reports`及详情；Route 的 Inspect 使用`/route/barriers/[id]`。旧 reports 路径保留重定向。
- 父 PublicApp/RoutePlanner 在 layout 持续挂载向导和列表，隐藏时保留草稿/筛选。Wizard 接受 pathname/returnTo/onNavigate；ReportsList 接受 onNavigate/refreshKey；Detail 接受 returnTo/onNavigate/onChanged。
- P1默认未选外部AI同意；主按钮上传并继续，人工继续同样先真实上传。P2保存事实→服务端预览→明确确认或明确仅保存→P3。更换照片取消旧分析/预览/确认，失败保留输入。
- Detail 成功修正/启停/续期派发`accessloop:reports-changed`；父立即标路线过时且不请求Directions，列表刷新。复制按点击时刻判断个人有效性，授权打印继续走 C export。
- P3刷新只恢复本人列表明确包含、当前有效个人确认的服务端PrivateDTO；无草稿覆盖、无公共/管理员兜底、无sessionStorage成功。
- 本轮真实报告、图像均为明确合成验收材料，GLM与后续ORS超时如实记录；校园与Zenith不作通过声明。

A 固定产品与截图证据见[A交接](wp-a.md)、[A验收](../acceptance/wp-a.md)。此次改动由A阶段PR交付给D，不覆盖B/C后台实现。

---

# 工作包 B 交接：真实报告流程接入

日期：2026-10-17。工作分支：`codex/b-frontend-reports`。PR：#8，base 为 `dev`。

- baseDevCommit：`d49eef50a59cd3c42b6c6ce3996a075822a68228`。
- headCommit / 受检产品提交：`4b642c63dc8cdb3918123934673c3d72e242f646`；本记录随后以仅文档提交补充，产品证据可对应该提交。
- 原交付 `adc42779af23db231b6b3a46d479751dc4e54162` 的 P0/P1“通过”结论撤回；该版本自动 fixture 成功、私人假导出及重复 Schema 已由本轮替换。
- integratedDevCommit：`9cfd186a8d2345af9cd970266e22415a9085d2e2`（PR #8）。作者修复阶段当时尚未 push/合并；后续由 D 完成复验与平台集成。

## 已实现范围

1. `/reports/new`：照片选择、私有上传、默认未选的外部 AI 同意；可人工填报。真实分析状态、原始证据及不确定项与用户事实分开；显式采用建议才替换事实。更换照片使旧关联失效，迟到响应不能写入新照片。
2. 用户填写实际观察时间、位置和通道。区域与通道来自真实 API；A 的 `PassagePicker` 提供预设通道和当前路线片段，不使用硬编码校园位置或通道 ID。
3. 保存报告与启用个人避让分开；保存后自动请求服务端预览，展示范围及实际有效期。确认仅提交所看预览的版本、时间、通道和 digest，必须重新明确同意。失败保留错误与输入，不返回 fixture。
4. `/reports`、`/reports/{id}`：本人/公共列表、详情、授权照片、事实修正、替换照片、个人启停及续期。续期清空观察时间，要求新观察及新预览/同意；自然过期与公共解除分别展示。
5. `/live`：在 A 的受控路线页面挂报告向导，传入当前合法路线/区域/通道；报告变更刷新上下文与报告层，使旧路线过时，保留起终点及轮椅限制，不自动调用 Directions。初始读取、轮询和报告刷新共用发布代次，旧图层不能覆盖新图层。
6. 公共报告消费严格脱敏 DTO，显示独立公共修订、来源、核实/有效时间、解除/驳回及过期状态。本人列表截断不能据此推断非作者：PrivateDTO 的未知归属操作入口明确说明仍由服务器逐次校验，不修改服务端权限。
7. 复制/打印直接使用 C 的授权 `/api/reports/{id}/export`；原 B 私人 fixture 导出页和浏览器依赖模板已移除。
8. P1 正式后台沿用 dev 中 C15 已挂载的管理组件、权限、证据地图、五类管理命令、区域/通道编辑、审计及调用摘要。未以旧 B 组件覆盖它们，未保留原 B `admin-preview`。A/D 的设计演示入口保持存在。

## 共享实现与冲突处理

- 两次产品基线 merge 与一次仅文档 dev merge，均保留历史，未 rebase/reset/强推。
- `src/shared/contracts/hazards.ts`、共享导出及照片/AI/管理/地理契约保留 C/D 的单一执行来源；B 客户端使用当前类型，不为旧 B 同义名复制 Schema。
- `src/components/admin/**` 保留 C 正式挂载实现及 props；`tests/hazards.test.ts` 保留 C 的业务测试；首页保留 A/D 当前入口。
- B 的 `api.ts` 仅在 A `src/shared/client/api.ts` 上提供领域调用：严格响应解析、会话初始化、错误传递；幂等键由操作持有并在相同输入重试时复用。401 清会话缓存但不把旧写入自动重放到新身份。
- `.gitignore` 的 `node_modules` 等价忽略同时覆盖目录与本工作树依赖符号链接；未提交依赖链接、环境文件或密钥。

## 作者修复阶段检查与边界（D最终复验见下）

- `pnpm check`：exit 0，219 项通过，11 项依赖外部条件的集成测试跳过，0 失败。
- `pnpm build`：exit 0；正常报告列表/新建为静态入口，详情及授权 API 为动态入口。
- 全量检查后仅收窄本人/管理员可读状态文案为“report author’s session”，summary 与 avoidance 状态均静态 SSR 通过；该小文案按 D 要求仅复验相关展示，日志 `/private/tmp/accessloop-b-wording-check.log`。
- 日志：`/private/tmp/accessloop-b-check-final.log`、`/private/tmp/accessloop-b-build-final.log`。
- 红绿证据：默认 AI 同意/观察时间缺失、Planner 报告入口及不自动重算、独立新报告重置；独立评审补充的旧 PATCH/换照、旧 poll.mine 覆盖、描述修正截断观察秒数、列表截断隐藏操作及 uncertain 隐藏证据均先失败后通过。测试分别位于 `tests/b-report-client.test.ts`、`tests/report-ui.test.ts`、`tests/report-detail-state.test.ts`、`tests/report-form-write.test.ts`、`tests/planner-context.test.ts`。
- 本修复会话没有运行真实 API、数据库、OSS、GLM、ORS 或其他外部供应商测试，没有复制、输出或手工读取环境秘密。D 另行负责隔离库浏览器回归与最终独立评审，结果不得提前记为通过。
- P0、P1 及整包真实联调：**外部条件阻塞**。静态与确定性客户端检查通过不替代真实模型、真实路线、实测校园区域、Zenith 及人工界面验收。

## 人工点击与约 120 秒演示

1. 从 `/live` 规划当前路线后选择 **Report an obstacle**，或直接进入 `/reports/new` 使用预设通道。
2. 选择照片；AI 同意默认未选。上传后填写类别、描述，选择实际观察时间及位置/通道，保存报告。
3. 查看自动生成的服务端预览和有效期，明确勾选后确认个人避让；回路线页手动重算。没有路线时应如实显示失败，不放宽条件。
4. 进入详情，使用 **Renew / confirm a new observation** 填新时间并重新确认；或停用个人避让。仅改描述不应更改原观察时间/使合法确认无故失效。
5. 使用 **Copy / print** 打开授权 HTML。公共报告不应显示私人照片或原始 AI 证据。
6. P1 使用正式 `/admin`；独立证据、理由、公共范围和有效期由真实管理员明确提供。没有真实核查时不能把演示文字称作现场证据。

120 秒建议：20 秒说明路线来源和限制；40 秒上报及明确区分真实 AI/人工路径；30 秒预览确认与手动重算；20 秒详情续期/停用及复制打印；10 秒展示正式后台的独立核实边界。未验证的 AI、路线、公共发布及部署不作完成声明。

## D 最终独立复审与浏览器复验

受检产品4b642c63dc8cdb3918123934673c3d72e242f646；baseDevCommit=d49eef50a59cd3c42b6c6ce3996a075822a68228。作者交付3047b4e仅补D17同步和B记录；后续本节及截图/脱敏JSON同样不改产品。最终deliveryHead与集成SHA由[PR #8](https://github.com/ZMX8Z/AccessLoop/pull/8)固定。

### Standards

旧e7头发现并真实复现两处迟到覆盖：详情PATCH回包关闭新换照草稿、旧poll.mine覆盖报告更新的新图层。新头通过父保存busy/编辑代次和统一layerEpoch/contextKey屏障修复；新报告reset、取消分析清loading也保留。独立只读复验31/31、0跳过，无剩余已知阶段阻塞，未发现额外需报告的heuristic问题。

### Spec

旧e7头的描述修正截断观察时间、100条本人列表截断隐藏旧报告操作、uncertain隐藏真实证据三项均修复并有先红后绿回归。截断只提供明确未知归属的PrivateDTO操作入口，不把owner设true，服务端权限未改；个人生效标签指向报告作者。独立只读固定头31/31通过，与Standards重复计数不相加。

### 实际生产产物与浏览器

D对最终含文案产品树重新pnpm build，exit0、无编译warnings，日志/private/tmp/accessloop-b-delivery-build.log。使用同一产物的隔离3108生产服务、独立_test库与明确合成区域/生成照片；真OSS，经真实C会话/报告/预览/确认接口。

默认AI同意未选；上传→人工事实/位置/预设通道→保存（避让未启用）→自动预览→明确确认v2→新观察/新同意续期v3→仅改描述v4（报告观察时间及有效确认保持）→停用v5全部在真实浏览器操作通过。360px下contentWidth=viewportWidth=360。授权HTML和Copy Report Text成功；原生打印预览未能通过桌面工具读取，Escape返回原页，打印预览保留人工待验，没有声称真实打印成功。

[脱敏JSON](../acceptance/b-browser-evidence.json)记录第二会话报告/照片/导出均404、该测试key零供应商预留、无AI分析及自有测试记录/真实OSS对象清理。补查脚本先两次误用存储字段，均在写入/外部调用前NotFound；改为C既有facts.photoId后exit0，原失败保留。没有因此修改产品或重复图片/模型请求。

截图：[已确认且事实修正](../acceptance/screenshots/b-report-confirmed.png)、[360px停用](../acceptance/screenshots/b-report-mobile-stopped.png)、[授权导出与复制](../acceptance/screenshots/b-report-export.png)。

本阶段工程准入通过；真实GLM、实时地点源、真实ORS浏览器绕行/搜索、校园实测、Zenith及人工界面/原生打印总验收未完成。C15后台权限和实库证据复用既有固定记录，无额外模型或路由请求。
