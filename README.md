# AccessLoop

无障碍地点查询与临时障碍绕行的黑客松 MVP。

已确定技术栈：**Next.js + Payload + PostgreSQL + 阿里云 OSS 私有对象存储**。照片由阿里云托管，应用通过服务端存储适配器访问 OSS。Payload 提供数据管理、管理员认证及 Payload Admin；AI 识别、用户确认、个人避让与 ORS 路线由 AccessLoop 业务服务实现。

P0 完成无管理员参与的个人绕行闭环，P1 在 Payload Admin 中补齐公共核实与纠错。当前仓库处于文档设计阶段，尚未安装框架或验证 Zenith 部署。

- [需求文档 v1.2](docs/AccessLoop_需求文档_v1.0.md)
- [技术文档 v1.2](docs/AccessLoop_技术文档_v1.0.md)
- [开源后端与后台选型调研及 Payload、OSS 决定](docs/AccessLoop_开源后端与后台选型调研.md)
