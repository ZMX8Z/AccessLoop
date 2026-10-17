# D 技术验收：统一初始化骨架

日期：2026-10-17。只验本次初始化阶段；完整 P0/P1 仍待开发。

| 字段 | 值 |
| --- | --- |
| branch | `codex/d-backend-routing` |
| baseDevCommit | `9a514638d74b88e384364c75b0bca87a6e219492` |
| headCommit / evidenceCommit | `9807ead8f95edfc566673898403d95130915c529` |
| PR / integratedDevCommit | [#1](https://github.com/ZMX8Z/AccessLoop/pull/1) / `912997dee420e0d2738b56aa0fb58d8965d9f894` |
| 运行环境 | macOS，Node 22.14.0，pnpm 10.20.0，隔离 PostgreSQL 17.6 |

## 实际检查

| 命令或场景 | 结果 | 证据与边界 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 通过 | lockfile 无需更新，依赖已安装 |
| `pnpm check` | 通过 | ESLint、Next 路由类型生成、TypeScript、22/22 测试，exit 0 |
| `pnpm build` | 通过 | 无 `.env.local` 和外部凭据，Webpack exit 0；生成公众静态页、后台、CMS 和 health 动态入口。构建器提示 compiled with warnings，未给出具体警告正文 |
| `pnpm start` 缺少配置 | 通过 | 实际执行 prestart，按名称报告缺失项并拒绝启动；不是模块导入异常 |
| 构建后的生产进程 | 通过 | `/`、`/api/health`、实际 `/admin/login` HTML 均 200；使用隔离数据库和仅用于门禁的 OSS 占位环境，未调用 OSS |
| `pnpm db:migrate` 与 `db:migrate:status` | 通过 | 两个独立空测试库执行初始迁移成功，首库显示已应用；未改现有数据库服务 |
| `pnpm admin:bootstrap` 首次/重复 | 通过 | 第二个空库首次 exit 0，已存在账号时 exit 1；命令正常结束 |
| 原生登录与 `GET /cms-api/admins/me` | 通过 | 返回启用的 operator，设置 Payload 会话 Cookie，`me` 正确返回本人 |
| 真实 `/admin` 与公众页面 | 通过 | 已登录后台 HTML 和公众 HTML 200；未将此视为地图/报告功能完成 |
| 空管理员库的匿名注册 | 通过 | 普通创建与 `/admins/first-register` 均 403，客户端伪造 bootstrap context 无效 |
| 写请求来源回归 | 通过 | 修复前真实已登录 logout 缺 Origin+same-site 返回 200；修复后缺失或不同 Origin 均 403，原会话仍可读取 `me` |
| 邮件密码恢复 | 按范围关闭 | `forgot-password` 明确 503，不声称邮件能力已完成 |
| 请求标识与缓存 | 通过 | health JSON/request header 标识相同且每次唯一；CMS 响应有 request ID 与 private,no-store |
| 独立只读审查 | 通过 | 修复 Origin 和明确邮件恢复限制后复核无新增实质问题 |
| `git diff --cached --check` | 通过 | 生成迁移只做空白规范化，并验证所有非空白内容不变 |

测试使用的随机数据库/管理员秘密仅位于忽略的临时本地环境中，未提交、未写入本记录。

## 阶段结果

- 本地初始化骨架：通过。
- 共享远端交付：通过 PR #1 合入 `dev`，集成提交 `912997dee420e0d2738b56aa0fb58d8965d9f894` 上再次运行 `pnpm check`，22 项测试及静态检查通过。已核对集成提交与证据提交的运行代码一致，构建与数据库证据复用。
- D0 的 Zenith 探针：未完成；无真实平台模板或部署连接验证。
- P0：待交付；当前不具备实时 AI 与个人绕行闭环。
- P1：待交付；当前不具备真实搜索和公共报告管理闭环。
- 全包/人工验收：未执行。

本记录的 head 固定代码提交；随后仅增加交接及验收说明的提交可引用这些证据。若后续改动运行代码、依赖或迁移，须对受影响项重新验证。
