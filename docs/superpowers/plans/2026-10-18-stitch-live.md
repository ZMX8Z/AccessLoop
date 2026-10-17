# Stitch live integration implementation plan

**Goal:** 将已确认六屏设计接入唯一真实业务应用，完成三 Tab P0/P1 页面整合。
**Architecture:** 持久化 React 公众外壳承载 RoutePlanner、ReportWizard、ReportsList；路由仅切换可见页，保留行程与草稿。沿用现有请求、匿名会话、状态屏障与全部 C/D 业务接口。
**Spec:** docs/design/AccessLoop_页面架构_Stitch.md 与本轮用户修复指令。
**Execution:** 用户已要求直接开发；主 agent 实施公共外壳/路线；授权子 agent 独占 hazards/client；独立 agent 只读技术复核。无需重复设计审批。

## Constraints
不改 source 原稿、依赖、C/D 服务或权限；无模拟成功、供应商浏览器直连及额外自动 Directions。360px 和桌面逐屏视觉核对；P1/P2无底部Tab；P3只在真实服务端成功后显示。

## Task 1: Persistent shell and route pages
- [ ] 先运行路线当前性/旅程入口回归，记录失败。
- [ ] 修改 RoutePlanner 与新增 PublicApp，恢复地图主导、紧凑卡、页内搜索参数/图层面板，保留5s上下文、350ms搜索与代次屏障。
- [ ] 建立 canonical URLs 和兼容重定向，/默认真实R1；fixture独立。
- [ ] 验证自然过期、迟到、配置切换、显式Directions与保留输入。

## Task 2: Real report and my reports screens
- [ ] 在 hazards/client 内复用上传/分析/表单/服务端预览/明确确认，三步及成功guard；保留草稿、正确来源、幂等和照片失效。
- [ ] 本人三筛选与详情沿用唯一接口、授权导出和权限，不复制业务。
- [ ] 必要实际回调红绿回归，移动/桌面验证。

## Task 3: Integration and delivery
- [ ] package.json check及生产build；必要失败回归。
- [ ] 独立端口APP_BASE_URL一致，实际浏览器选点/搜索/路线/行程/报告/列表详情；供应商最少调用，区分真实与fixture。
- [ ] 原稿与实际360px及桌面并排视觉证据；核对44px、焦点、滚动、安全区。
- [ ] 更新A交接/验收/MANUAL、B跨包交接；固定base/codeEvidence/deliveryHead，独立技术复核后base=dev PR并附加，不合并。

## Review focus
新配置设施刷新失败不能恢复旧区；迟到路线/搜索不能覆盖新输入；隐藏Tab保持地图焦点/视口；更换照片/预览需撤销旧同意；本人/公共DTO及照片权限保持服务端约束。
