# 报告位置与预设通道保存修复

2026-10-18。D 按用户截图修复 A/B 共享选点及报告表单，目标 dev。

- baseDevCommit：`9c2fdaf42788ee881d8379653be076bb9955c35d`。
- codeEvidenceCommit：`4514b5c43be8447b432b2a7472ef15977f3b047f`。后续证据提交仅含文档/截图。
- deliveryHead、PR 与 integratedDevCommit 由本阶段 PR 正文记录。

## 原因与结果

截图中的 `[1, 2]` 不在当前区域，原校验正确拒绝，但保存禁用没有具体解释。From/To 是当前路线片段的替代入口，没有路线时旧页面仍展示空下拉框，使预设通道流程显得无法完成。

没有有效路线时隐藏空索引，明确预设通道无需先规划。地图以紫色虚线显示所选预设通道，只在选中几何变化时聚焦；不猜测或自动填写真实观察点。坐标范围、已应用位置及缺项清单可见。手工坐标修改立即撤销保存条件，需点击 Set report location，防止静默保存旧点；有效地图选点清除旧坐标错误。

共享组件交接 A/B：MapView 新增可选 `passage?: LineString|null`；PassagePicker 新增可选 `onLocationDraftChange?: (dirty:boolean)=>void`，ReportForm 持有待应用状态。AvoidanceDrawer 既有固定报告位置逻辑保持。HTTP、Schema、权限、数据库、模型和预算接口未变。

## 实测证据

| 检查 | 结果 |
| --- | --- |
| 先失败后修复 | 新增场景修复前5失败；修复后与既有选点/地图合计19/19通过 |
| pnpm check | exit0；lint/typecheck通过；314通过、12默认集成跳过、0失败 |
| pnpm build | 生产构建exit0 |
| 两轴只读复核 | Spec/Standards无实质阻断；旧VM测试补齐真实inside导入后完整check通过 |
| 生产浏览器 | 真实C/OSS，手动模式上传合成JPEG；1,2被拒绝；有效合成通道坐标应用后Save启用；全程无路线、无AI调用 |
| 手机布局 | 360×800，scrollWidth=360；空路线索引不出现；保存按钮可用 |
| 实际保存 | 成功页显示Report saved / personal avoidance not enabled；管理员同源HTTP读取200，pending，照片已关联，analysis为空，个人避让为空 |

[结构化证据](d-report-location-evidence.json) · [可保存状态](screenshots/d-report-location/ready-360.jpg) · [真实保存成功](screenshots/d-report-location/saved-360.jpg)。合成回归报告保留供本机后台核对，编号见结构化证据；不得核实为真实公共障碍。未发送用户的室内测试照片至模型，未修改或删除其既有报告/照片。

## 本机人工复查

打开 `/report`，上传照片，选择手动上报或明确同意AI后分析；填写描述和实际观察时间。在地图点选实际障碍位置，或输入当前区域内真实经纬度并点击 Set report location；选择预设通道即可保存，无需填写 From/To。使用路线片段才需先规划有效路线。坐标必须与真实观察对应，不能把本次合成坐标用于实际室内障碍。

本次仅修复报告交互；完整P0/P1、校园实测、最终真实导航/搜索/管理总闭环、人工与Zenith在线验收保持原状态。未自动发布main。
