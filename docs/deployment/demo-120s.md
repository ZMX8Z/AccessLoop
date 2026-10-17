# 约 120 秒核心演示草案：交 B/A 联调

这是待 B 确认最终按钮文案与页面路径的讲稿草案，不表示已彩排或真实功能通过。英文为现场说辞；数据、外部条件与截图的真实性由 [部署入口](README.md)和 D 交接记录说明。

## 彩排前准备

- 使用同一集成版本的真实 HTTPS 页面；现场已经验证的固定起终点、wheelchair 参数和两条候选通道。演示区域/报告持续显示 Demo，不能将合成数据称为实地验证。
- 准备真实拍摄且不含人脸、车牌的障碍照片；先说明会发送给配置的外部视觉服务。供应商用量足够，照片上传、GLM、ORS、搜索都已实测。
- 主浏览器为会话 A；独立浏览器/隐私窗口为会话 B，使用同一固定起终点。管理员登录使用第三窗口，公开二维码仅指向公众入口。
- 确认报告模板/打印预览已接到真实授权接口；不把预先生成路线或历史分析当作现场实时结果。缺失实时功能时明确说明并终止“通过”结论。

| 时间 | 操作 | 英文说辞 |
| --- | --- | --- |
| 0–20 秒 | 打开地图，在真实搜索中选定目的地；显示固定起终点与原 wheelchair 路线。拒绝定位时仍可手工选择。 | “A temporary obstruction can make an accessible journey unusable. AccessLoop helps us plan within this small campus area.” |
| 20–45 秒 | 上传照片，明确同意分析，显示真实结构化识别；指出模型不确定项及可编辑事实。 | “I choose to send this photo for analysis. The model suggests what it can see, and I check the facts before anything changes.” |
| 45–65 秒 | 确认观察时间、位置与当前路线片段或预设通道；显示服务端预览，再明确启用个人避让。 | “I confirm the location and affected passage. This preview shows the area to avoid. It becomes active only when I confirm.” |
| 65–95 秒 | 保持起终点/参数，显式重算；对比路线与有效时段；切到会话 B 证明私人报告未改变它的公共路线。 | “The route now avoids my confirmed obstruction. This is temporary and private to my session. Another visitor does not inherit my personal report.” |
| 95–110 秒 | 打开可复制/打印的维修报告，查看事实与建议分开，私人图片仍需授权。 | “The report brings the evidence and checked facts together, ready to share with the responsible team.” |
| 110–120 秒 | 返回公众入口，说明区域、时效和公共核实边界；展示真实在线二维码。 | “Public alerts need an independent review. This demo covers a measured campus area, and expired information prompts a new check.” |

B 需要把讲稿操作映射到正式上报、分析、通道预览、确认、报告和打印入口；A 需要保证固定起终点、路线对比与第二会话显示。真实在线入口未交付前，最后一段只保留草案，不生成示例二维码。

## P1 公共流程补充演示（约 45 秒，核心演示后）

管理员窗口打开待核实报告，以独立现场证据发布合法公共范围；两个公众会话在十秒内收到路线过时提示并能重新规划。随后展示纠错/解除的理由和审计，再展示最近 24 小时真实调用、错误、等待、缓存摘要。重新核实、驳回、重开、区域冲突及自然过期用验收案例覆盖，不强塞进 120 秒核心链路。

## 三个彩排场景

1. 正常：真实照片、真实 GLM、确认、个人绕行、另一会话隔离和报告。
2. 明确降级：AI 不可用时显示英文原因，用户人工填写后仍可明确确认；不把降级称为实时识别成功。
3. 无路线或过期：保留固定起终点/限制并明确没有可用路线；或到期后提示信息过时，不声称道路已恢复。

每次彩排记录集成 SHA、实际用时、使用的场景、真实/降级状态和问题。历史录像可作标识清楚的备用介绍，不能替代实时功能验收。
