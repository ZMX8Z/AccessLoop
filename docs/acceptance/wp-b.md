# B 技术验收记录：真实客户端修复阶段

日期：2026-10-17。阶段：B 公众报告/个人避让接入与当前正式管理界面兼容；不代替四包真实总验收。

| 字段 | 值 |
| --- | --- |
| branch | `codex/b-frontend-reports` |
| PR / target | #8 / `dev` |
| baseDevCommit | `d49eef50a59cd3c42b6c6ce3996a075822a68228` |
| headCommit / 受检产品提交 | `4b642c63dc8cdb3918123934673c3d72e242f646` |
| integratedDevCommit | 待 D 平台集成后记录 |
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

## 阶段结论

- 静态检查及确定性客户端回归：**通过**，仅覆盖上表实际执行范围。
- P0 真实公众上传/AI/个人绕行闭环：**外部条件阻塞**；浏览器与真实 C/API/OSS 由 D 在隔离环境继续验证。未在本会话运行真实模型、路线或校园实测。
- P1 真实公共展示、管理命令、角色与配置闭环：**外部条件阻塞**；已保留 dev 的正式挂载，客户端兼容与展示已测，但不能以此代替同一最终提交上的真实权限/管理回归。
- 整包：**外部条件阻塞**。未宣称 Zenith、校园实测、真实 GLM 或四包最终验收通过。

## 人工范围

人工只按 [B MANUAL](../work-packages/b-frontend-reports/MANUAL.md) 检查功能和界面：默认未选 AI、实际观察时间、双通道及预览、明确确认、续期/停用、详情修正、公共状态、复制/打印和正式后台。错误/权限/事务的技术证据由 AI 准备，不要求人工抓包或查数据库。D 的最终浏览器与独立评审证据在完成后追加，不提前填写通过。
