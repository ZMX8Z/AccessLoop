# Stitch 真实主入口集成验收

2026-10-18。D 固定分支，目标 `dev`。本阶段落实用户要求：去除旧 `/live` 控制台，将真实地图与设施/障碍/路线接入已有 Stitch UI，正式 URL 不使用 `/sitich` 或 `/stitch`。

## 提交与集成范围

- baseDevCommit：`cad8ebaf8a006d2d8b158a2589d9e7a940b8c904`。
- A 原始交付：PR [#21](https://github.com/ZMX8Z/AccessLoop/pull/21)，head `e7d937de9857ebb0e935d3a9e195392a8e252506`；通过 D 候选合并完整保留。
- codeEvidenceCommit：`5a08631034152a10b48141040409989cc222319c`；后续证据提交只更新文档/截图。
- deliveryHead、实际 PR 和 dev integration SHA 由本阶段 PR 正文固定，避免在提交内循环引用自己的 SHA。
- A 现有代码先在 D 独立目录审查，修复后作为一个候选进入 dev，避免把已知旧状态问题先暴露到共同基线。未在 A/B 目录切分支、重置或覆盖成员修改。

## 实际行为

`/` 和 `/live` 均 307 至 `/route`；上报 `/report`，本人列表 `/my-reports`。旧 `/stitch/*.html` 在文件服务前跳转对应语义页面，不再运行本地 sessionStorage 假报告。原始设计文件作为参考保留。`/preview` 仍明确显示合成 fixture，不能用于真实功能验收。

复用 A 的三 Tab、Leaflet、统一请求/会话和 C/D 真实 API，不新建地图、数据库或私有状态协议。设施保留真实来源、许可和 unknown；公共/个人几何仍按原有效集显示。ORS 仍只在明确规划/重算时调用；路线过时隐藏几何并提示重算。

独立 Spec/Standards 审查发现并修复：

- 重入 P2/P3、报告变化事件或公共上下文变化时，定向刷新已保存报告和本人归属；读取未确认时不声称避让有效。路径切换立即撤销旧验证。
- 最新请求屏障与当前报告 ID 阻止迟到读取/确认覆盖新照片草稿；不取消已在服务端执行的写入，旧成功写仍通知地图刷新。
- 避让编辑器保持挂载，检查中仅禁用旧操作并撤销预览/同意，保留观察时间、通道和编辑状态；确认写入中禁用提前完成与重开。
- R2 检查设施只打开详情，保留既有起终点和行程路线。
- 复制文本在操作时判断公共自然过期，包含核实有效期。

B 的共享 AvoidanceDrawer 新增可选 disabled / onBusyChange，默认行为兼容。HTTP Schema、数据模型与服务端权限未变更。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| pnpm check | exit0；lint 0告警；类型检查通过；308通过、12默认集成跳过、0失败 |
| pnpm build | 最终产品源码生产构建 exit0，13静态页及全部真实业务/后台入口 |
| 先失败后修复 | 旧成功状态、公共复制过期、行程点击改端点、重入空窗、旧确认覆盖新稿已复现；定向及完整回归通过 |
| 独立复核 | Spec/Standards 最终均无剩余集成阻断；Spec 独立37项定向通过，最终统一结果以上一行 check 为准 |
| HTTP入口 | `/`、`/live`、旧 route/photo/confirm/my-reports HTML 均307至真实页；三主页面200 |
| 360×800生产浏览器 | 真实15设施、15已加载瓦片、scrollWidth=360；7-Eleven unknown；两数据源许可、Overpass失败和非完整库存可见 |
| 选点/Tab | Roundhouse → Bar Navitas 产生A/B标记（共17），Report→取消→My Reports→Route保留起终点；未触发规划、搜索、上传或模型动作 |
| 1280×800生产浏览器 | scrollWidth=1280；真实地图及桌面摘要、三Tab正常显示 |

[结构化证据](d-stitch-live-evidence.json) · [手机地图](screenshots/d-stitch-integration/route-360.jpg) · [桌面地图](screenshots/d-stitch-integration/route-1280.jpg) · [手机上报](screenshots/d-stitch-integration/report-360.jpg)。A 的既有上报、私有OSS、上下文和原稿对照证据见 [A验收](wp-a.md)，本轮不重复产生照片/模型账单。

## 判定与人工入口

本阶段界面/真实地图接线通过；完整 P0/P1 尚未通过。仍缺校园现场、最终真实导航/搜索/公共管理总闭环、人工与 Zenith 在线部署；本轮没有新增在线部署成功结论，也未将新前端自动发布至 main。

本机在仓库根目录执行 `pnpm dev --port 3000`，打开 `http://localhost:3000/`（进入 `/route`）。已有终端运行时保存代码会重编译；若仍见旧页面，停止旧进程后重新启动并刷新。环境文件和数据库不重新初始化。

人工点击：检查底图/设施 → 设置起终点 → Report → 取消返回 → My Reports → Route，确认选择保留；真实规划需明确点击 Plan/Recalculate。校园演示通道保持 synthetic / not field validated，不能当作现场可通行证据。
