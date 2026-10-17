# 独立本机 PostgreSQL 开发库

日期：2026-10-17。当前进程保持运行供四包联调。本记录只覆盖本机开发库，不表示 Zenith、OSS、C 的业务数据或供应商功能已通过验收。

## 配置与秘密边界

- D 工作目录：`/Users/coreyli/.codex/worktrees/d-backend-routing/AccessLoop`。
- PostgreSQL 17.6：`/opt/homebrew/opt/postgresql@17/bin`。
- 数据目录：`.local/postgresql/data`，权限 0700；日志：`.local/postgresql/server.log`，权限 0600。
- 仅监听 `127.0.0.1:55437`，禁用 Unix socket，使用 SCRAM 密码认证。创建前确认 55437 无监听者，专用目录无既有集群；未操作系统 PostgreSQL 服务。
- 应用角色 `accessloop` 和数据库 `accessloop_dev`；应用角色拥有开发库，但没有 superuser、createdb、createrole 或 replication 权限。
- 应用与维护角色各使用独立随机强密码。秘密只在忽略的环境文件和数据库目录中保留。维护凭据在 `.local/postgresql/owner.env`，权限 0600，不用于应用运行。
- D `.gitignore` 已增加 `/.local/`。根工作目录 `.env` 与 D `.env.local` 均为 0600，DATABASE_URL 已同步；根非空 VISION_API_KEY 已同步 D。其余原有键经解析逐项核对保留。本文不记录连接 URL、密码、密钥或管理员身份。

## 真实检查

以下检查在这个持久开发库执行，不使用合成业务表：

- 通过统一 Payload 配置执行 `pnpm db:migrate` 和 `pnpm db:migrate:status`，退出 0。初始迁移 `20261017_055558_initial_admins` 应用记录为 1。
- 再执行迁移及状态命令，退出 0；应用记录仍为 1，未重复应用。
- 使用维护角色核对服务器 data_directory 精确对应本目录；应用角色保持最小权限，不能读取受限的 data_directory 设置。
- 只对这个专用新集群执行带日志重定向的 fast restart；同一目录、初始迁移记录与开发库连接均保留。
- 脱敏部署探针 `--database` 返回 `passed / POSTGRES_SELECT_1`；错误密码被拒绝。
- 集群进程保持运行，root 与 D 数据库配置相同，根模型密钥与 D 相同；数据目录、两个应用环境文件、维护环境文件、日志权限已核对。
- 管理员数量为 0。根 ADMIN_PASSWORD 少于现有初始化脚本要求的 12 字符，因此未执行创建；没有修改用户密码或使用样例密码绕过要求。
- 没有新增应用数据库连接代码、C 报告表或预算表；没有发起 GLM、ORS、Geocoding 业务调用。

## 安全复用

先检查本目录的实例状态。已运行时直接复用，不重复 initdb，不重置数据，不自动更换密码，不将同一端口的其他实例视为本库。

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /Users/coreyli/.codex/worktrees/d-backend-routing/AccessLoop/.local/postgresql/data status
```

若已停止，先确认 55437 未由其他进程占用，再启动这个数据目录：

```sh
lsof -nP -iTCP:55437 -sTCP:LISTEN
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /Users/coreyli/.codex/worktrees/d-backend-routing/AccessLoop/.local/postgresql/data -l /Users/coreyli/.codex/worktrees/d-backend-routing/AccessLoop/.local/postgresql/server.log -w start
```

维护时先协调暂停四包写入。停止专用集群：

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /Users/coreyli/.codex/worktrees/d-backend-routing/AccessLoop/.local/postgresql/data -m fast -w stop
```

重启正在运行的专用集群；始终指定 `-l`，避免日志继承调用方管道：

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /Users/coreyli/.codex/worktrees/d-backend-routing/AccessLoop/.local/postgresql/data -l /Users/coreyli/.codex/worktrees/d-backend-routing/AccessLoop/.local/postgresql/server.log -m fast -w restart
```

不使用 brew services 或系统服务命令。此进程没有注册开机启动；机器重启后按以上状态/端口预检复用原目录。其他包通过受控本地环境文件复用本库，不在聊天或提交中传播凭据。已经运行的应用需由所属负责人重启以读取新环境文件。

在 D 工作目录执行 `pnpm db:migrate:status`、`pnpm exec tsx scripts/deployment-probe.ts --database` 可复验。首次管理员创建仍由受控流程读取根 ADMIN_EMAIL/ADMIN_PASSWORD；密码须先达到现有脚本 12 字符门槛，不把凭据写入文档。
