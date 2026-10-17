# Stitch 三 Tab 页面重构交接

2026-10-17。按用户修改后的 `docs/design/AccessLoop_页面架构_Stitch.md` 实施。该文件中的三个主 Tab 和 R1 内按钮进入 R2 的要求优先于上一版控制台布局。

## 本次实现

直接迁入六份原始 Stitch HTML，保留顶部栏、地图、紧凑摘要、报告步骤、列表及底部导航的原始结构。不是把旧控制台重新排版。

| 页面 | 本地路径 | 原始来源 |
| --- | --- | --- |
| R1 | `/stitch/route.html` | route_v3_compact_preview |
| R2 | `/stitch/journey.html` | route_active_journey_guidance |
| P1 | `/stitch/report-photo.html` | report_stage_1_upload_evidence |
| P2 | `/stitch/report-confirm.html` | report_stage_2_ai_scan_confirm |
| P3 | `/stitch/report-success.html` | report_stage_3_successfully_reported |
| M1 | `/stitch/my-reports.html` | my_reports_simple_list |
| M2 | `/stitch/report-detail.html?id=…` | 复用 M1 外壳补充 |
| R3 | `/stitch/barrier-detail.html` | 复用公共外壳补充 |

`/` 和 `/preview` 进入新的 R1；上一版真实 API 消费界面保留在 `/live`，未删除既有客户端逻辑。建议 URL 暂映射为实际 HTML 文件路径；后续 Next 组件化可替换路径，不改变页面结构。

- 三 Tab：Route / Report / My Reports，激活状态随页面归属更新。
- R1 的 Start Journey 实际跳转 R2；R2 保留同一地图与路线图形，地图下方显示节点列表。返回/结束回 R1，起终点保持。
- 搜索/参数/图层使用 R1 内的对话面板，不占新 Tab。演示地点筛选、端点交换与设置可操作。
- P1 支持 JPEG/PNG 本地文件、相机文件选择或明确的插画样例；P2 修正类别、描述、位置、时间；校验后生成浏览器本地示例记录，P3 显示本地生成的编号。
- 草稿保留；更换照片返回第一步；从行程进入上报时保留返回来源。
- M1 All / Active Detour / Resolved 筛选、数量和新增报告联动；M2 展示详情、复制/打印及停止演示绕行。
- 公共 CSS 本地编译，不运行 Tailwind CDN；图标替换为本地 inline SVG，字体有系统回退，底图与证据插画均为本地资源。没有浏览器第三方资源依赖。
- 保留缩放能力、键盘焦点、英文界面；P1/P2 按 Stitch 使用无 Tab Bar 的步骤页，P3 恢复三 Tab。

## 生成与维护

- `scripts/stitch/prepare.py`：从原始 HTML 生成页面并替换导航、脚本引用及不真实的占位声明；原始文件不变。
- `public/stitch/app.js`：页面跳转、面板、草稿、示例报告和筛选交互。
- `public/stitch/app.css`：共享修正与响应式样式。
- `scripts/stitch/tailwind.config.cjs`：从原始 Stitch 配置提取。
- `public/stitch/styles.css`：Tailwind 3.4.17 编译输出。

重新生成 HTML：`python3 scripts/stitch/prepare.py`。
重新编译基础样式：使用 Tailwind 3.4.17，config=`scripts/stitch/tailwind.config.cjs`，input=`scripts/stitch/input.css`，output=`public/stitch/styles.css`，content=`public/stitch/*.html`。

未修改共享 package.json、lockfile、构建配置或服务端 API。

## 实际验证

- 浏览器：R1 Start Journey → R2；R2 保留地图并显示节点。
- 浏览器：R2 Report Barrier → P1；选择明确样例 → P2；空表提交拒绝；填写说明/位置 → P3；My Reports 出现新增记录。
- 浏览器：Resolved 筛选仅显示两条对应示例；打开报告详情正确；360px 列表与 R1 的 scrollWidth = clientWidth = 360。
- 本地 JS 语法检查及相关 ESLint 已执行；Next 生产构建见本轮工具结果。

## 范围和限制

这是用户本次要求的 HTML/页面架构交互实现。所有页面持续显示 Design Demo。照片和记录仅存在当前标签页 sessionStorage，真实上传、AI、ORS、公共核实及正式报告提交均未接入，不应据此宣称 P0/P1 真实验收通过。

原始 HTML 中的尺寸、坡度、路线节点及设施只是示例；不会向市政/校园发消息或提交报告。已去掉“派工”“已交校园”等不真实成功声明。示例地图不支持真实导航。

本次已迁入用户 clone 的正式仓库，基线为 dev `5e4867d8b6141aacbc8fc4988f4aa41287bd370a`，在 `codex/a-frontend-map` 交付。提交与 PR 状态见 `docs/acceptance/wp-a.md`；不代表已合并或部署。离线 ZIP 仅作为此前交付快照。
