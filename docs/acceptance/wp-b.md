# B 技术验收记录：真实客户端修复阶段

日期：2026-10-17。阶段：B 公众报告/个人避让接入与当前正式管理界面兼容；不代替四包真实总验收。

| 字段 | 值 |
| --- | --- |
| branch | `codex/b-frontend-reports` |
| PR / target | #8 / `dev` |
| baseDevCommit | `d49eef50a59cd3c42b6c6ce3996a075822a68228` |
| headCommit / 受检产品提交 | `4b642c63dc8cdb3918123934673c3d72e242f646` |
| integratedDevCommit | `9cfd186a8d2345af9cd970266e22415a9085d2e2`（PR #8） |
| 运行环境 | Node 22.14.0、pnpm 10.20.0、Next.js 16.3.3 |

本记录在受检产品提交后以仅文档提交补充；代码证据对应上表 head，后续仅文档 dev 同步不改变受检产品。原 `adc4277` 的 P0/P1“通过”结论已撤回。

## 已运行检查

| 命令 / 场景 | 实际结果 | 证据边界 |
| --- | --- | --- |
| `pnpm check` | 通过；219 pass、11 skip、0 fail，exit 0 | lint、typecheck、全项目确定性测试；跳过项需要真实持久化/服务条件 |
| `pnpm build` | 通过，exit 0 | 报告入口、详情及授权业务 API 均生成；不证明服务运行或外部能力 |
| 403/409、稳定幂等键、401 身份失效 | 通过 | 真实客户端配 HTTP 边界替身；不回退 fixture，不自动重放旧写 |
| 换图迟到、用户事实与显式采用 AI | 通过 | reducer 回归及实际组件回调；原始证据不覆盖用户事实 |
| 预览/续期与明确同意、过期拒绝 | 通过 | 新观察时间与 digest 精确绑定，缺同意/到期不能构造确认 |
| 详情 PATCH busy/迟到回包 | 通过 | 禁止保存中换图；generation 隔离新草稿，同时承认旧写已完成的版本 |
| 旧轮询图层晚到 | 通过 | 延迟旧 poll.mine 至报告刷新完成后释放，新报告保持可见；初始/轮询/报告刷新共用代次与上下文屏障 |
| 描述修正不改观察秒数 | 通过 | 实际 Form 捕获 PATCH，未编辑 observedAt 时省略；不截断原 Instant |
| 本人列表截断与 uncertain 证据 | 通过 | 截断不当作非作者；未知归属入口仍由服务器授权；不确定结果保留真实描述、证据及人工标识 |
| 授权私人详情状态文案 | 通过 | 全量检查后仅将 summary/avoidance 生效会话明确为报告作者；相关静态 SSR 通过，未重复全量构建 |
| 正式后台及授权 HTML 导出 | 复用 dev C15 实现 | C 记录见当前 dev；本修复会话未重新操作真实管理会话 |

日志：`/private/tmp/accessloop-b-check-final.log`、`/private/tmp/accessloop-b-build-final.log`。主要新增/扩展测试：`b-report-client.test.ts`、`report-ui.test.ts`、`report-detail-state.test.ts`、`report-form-write.test.ts`、`planner-context.test.ts`。

## 作者修复阶段结论（D最终复验见下）

- 静态检查及确定性客户端回归：**通过**，仅覆盖上表实际执行范围。
- P0 真实公众上传/AI/个人绕行闭环：**外部条件阻塞**；浏览器与真实 C/API/OSS 由 D 在隔离环境继续验证。未在本会话运行真实模型、路线或校园实测。
- P1 真实公共展示、管理命令、角色与配置闭环：**外部条件阻塞**；已保留 dev 的正式挂载，客户端兼容与展示已测，但不能以此代替同一最终提交上的真实权限/管理回归。
- 整包：**外部条件阻塞**。未宣称 Zenith、校园实测、真实 GLM 或四包最终验收通过。

## 人工范围

人工只按 [B MANUAL](../work-packages/b-frontend-reports/MANUAL.md) 检查功能和界面：默认未选 AI、实际观察时间、双通道及预览、明确确认、续期/停用、详情修正、公共状态、复制/打印和正式后台。错误/权限/事务的技术证据由 AI 准备，不要求人工抓包或查数据库。以下 D 最终复验章节补充了后续浏览器及独立评审结果。

## D 最终独立复审与浏览器复验

受检产品4b642c63dc8cdb3918123934673c3d72e242f646；baseDevCommit=d49eef50a59cd3c42b6c6ce3996a075822a68228。作者交付3047b4e仅补D17同步和B记录；后续本节及截图/脱敏JSON同样不改产品。最终deliveryHead与集成SHA由[PR #8](https://github.com/ZMX8Z/AccessLoop/pull/8)固定。

### Standards

旧e7头发现并真实复现两处迟到覆盖：详情PATCH回包关闭新换照草稿、旧poll.mine覆盖报告更新的新图层。新头通过父保存busy/编辑代次和统一layerEpoch/contextKey屏障修复；新报告reset、取消分析清loading也保留。独立只读复验31/31、0跳过，无剩余已知阶段阻塞，未发现额外需报告的heuristic问题。

### Spec

旧e7头的描述修正截断观察时间、100条本人列表截断隐藏旧报告操作、uncertain隐藏真实证据三项均修复并有先红后绿回归。截断只提供明确未知归属的PrivateDTO操作入口，不把owner设true，服务端权限未改；个人生效标签指向报告作者。独立只读固定头31/31通过，与Standards重复计数不相加。

### 实际生产产物与浏览器

D对最终含文案产品树重新pnpm build，exit0、无编译warnings，日志/private/tmp/accessloop-b-delivery-build.log。使用同一产物的隔离3108生产服务、独立_test库与明确合成区域/生成照片；真OSS，经真实C会话/报告/预览/确认接口。

默认AI同意未选；上传→人工事实/位置/预设通道→保存（避让未启用）→自动预览→明确确认v2→新观察/新同意续期v3→仅改描述v4（报告观察时间及有效确认保持）→停用v5全部在真实浏览器操作通过。360px下contentWidth=viewportWidth=360。授权HTML和Copy Report Text成功；原生打印预览未能通过桌面工具读取，Escape返回原页，打印预览保留人工待验，没有声称真实打印成功。

[脱敏JSON](b-browser-evidence.json)记录第二会话报告/照片/导出均404、该测试key零供应商预留、无AI分析及自有测试记录/真实OSS对象清理。补查脚本先两次误用存储字段，均在写入/外部调用前NotFound；改为C既有facts.photoId后exit0，原失败保留。没有因此修改产品或重复图片/模型请求。

截图：[已确认且事实修正](screenshots/b-report-confirmed.png)、[360px停用](screenshots/b-report-mobile-stopped.png)、[授权导出与复制](screenshots/b-report-export.png)。

本阶段工程准入通过；真实GLM、实时地点源、真实ORS浏览器绕行/搜索、校园实测、Zenith及人工界面/原生打印总验收未完成。C15后台权限和实库证据复用既有固定记录，无额外模型或路由请求。
