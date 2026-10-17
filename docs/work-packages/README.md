# AccessLoop 四人工作包

本目录是 A/B 两名前端、C/D 两名后端的待执行入口。每包均必须完成 P0 与 P1；公共权威资料集中在 [docs/authority](../authority/README.md)，不在四个包内各自复制。

| 工作包 | 职责 | 固定分支 | PR base / 最终集成 |
| --- | --- | --- | --- |
| [A · 视觉、地图与路线前端](a-frontend-map/README.md) | Stitch、公众外壳、公共组件、地图、路线、搜索和状态传播 | `codex/a-frontend-map` | `dev` |
| [B · 上报、报告与管理交互前端](b-frontend-reports/README.md) | 上传修正、预览确认、个人管理、打印导出、后台自定义交互 | `codex/b-frontend-reports` | `dev` |
| [C · 数据、AI 与报告后端](c-backend-data-ai/README.md) | Payload、会话、OSS、GLM、报告事务、管理鉴权与命令 | `codex/c-backend-data-ai` | `dev` |
| [D · 路由、地理、部署与总集成](d-backend-routing/README.md) | 骨架、通道/地理、ORS、搜索、预算、部署和四包集成 | `codex/d-backend-routing` | `dev` |

每包只有四份工作材料：

- `README.md`：本包职责、P0/P1 阶段、负责目录、依赖与权威文档入口。
- `START.md`：可整段复制到开发会话的完整提示词。
- `ACCEPTANCE.md`：可整段复制到独立 AI 验收会话的完整提示词。
- `MANUAL.md`：人工仅检查页面功能、界面和文案的清单。

开始前读根 [AGENTS.md](../../AGENTS.md) 和 [authority 入口](../authority/README.md)，再复制所属包的提示词。公共范围、接口字段、状态机、权限、版本、幂等、分支和验收详细规则分别只在 authority 对应文件维护。

每人使用独立 clone/worktree，复用已归属本包的分支与目录；从 `dev` 创建并持续同步，以 `dev` 为 PR base。所有分支预检、同步、子 agent、阶段交付与合并规则见 [COLLABORATION.md](../authority/COLLABORATION.md)。D 先交付骨架阶段 PR；A 的公共组件和 C 的仓储/会话等基础能力也按阶段 PR 交付，避免等待整包形成循环依赖。A/B/C 提供技术验收通过的阶段 PR，D 按用户授权串行合并到 `dev` 并回归，最终四包全部进入 `dev`。

开发交接 `docs/handoffs/wp-a.md` 至 `wp-d.md`，技术验收记录 `docs/acceptance/wp-a.md` 至 `wp-d.md`，均由执行会话生成。验收记录必须固定并记录 `dev` base、待验收 head 和证据对应提交；公共追踪表与完成定义见 [权威验收文档](../authority/ACCEPTANCE.md)。当前文档整理不表示已开发或通过验收。
