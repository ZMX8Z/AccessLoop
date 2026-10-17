# D 交接：统一工程初始化

日期：2026-10-17。阶段：D0 中的本地统一骨架；本次未执行 D 的完整 P0/P1 工作。

## 提交与集成状态

- 分支：`codex/d-backend-routing`，独立 managed worktree。
- baseDevCommit：`9a514638d74b88e384364c75b0bca87a6e219492`。
- 文档准备提交：`5025849`，保留当前会话已有权威文档和四包材料。
- headCommit / 代码证据提交：`9807ead8f95edfc566673898403d95130915c529`。
- 初始化 PR：[#1](https://github.com/ZMX8Z/AccessLoop/pull/1)，已用 merge commit 合入 `dev`。
- integratedDevCommit：`912997dee420e0d2738b56aa0fb58d8965d9f894`。
- 已经用户明确授权完成远端交付，远端已核实为私有仓库。集成后 `pnpm check` 再次通过，运行代码与证据提交相同。

## 已交付

- 单一 Next.js + Payload 应用，公众页面、`/api/health`、Payload `/admin` 和 `/cms-api` 路由独立挂载。
- 精确版本：Node 22.14.0、pnpm 10.20.0、Next.js 16.3.3、React/React DOM 19.2.6、Payload 与配套包 3.91.0。依赖和 lockfile 已提交。
- TypeScript、ESLint、22 项测试、生成类型/import map、初始管理员版本化迁移、`push: false`、环境变量示例和生产启动配置检查。
- 最小 Zod 契约：坐标、bbox、版本、通道引用、路线输入、健康包络；fixture 明确为合成结构样例，不作为真实路线或实测区域。
- 管理角色 operator/report_admin、启用状态、关闭公众首注册、受控首次初始化、严格写请求 Origin、请求标识和禁止缓存。
- A/B/C/D 所需模块目录。尚未实现的业务接口没有返回伪造成功。

实际启动、迁移与开发命令见 [DEVELOPMENT.md](../DEVELOPMENT.md)。结构/字段以 [API 契约](../authority/API_CONTRACTS.md) 为准。

## 四包接入

- A：接管公众外壳和地图、公共组件/请求工具；当前首页是初始化占位页，可直接替换。
- B：在相同公众路由组开发上报/报告页面，在 `components/admin` 交付管理组件；无需新建应用。
- C：接管 Payload 配置、Admins、Collections、迁移、生成类型与仓储；继续 C0/P0 数据及预设通道基础能力。保留已有管理员创建及来源防护，扩展模型时增加新迁移。
- D：继续区域/地点/通道、地理、ORS、搜索、预算、部署探针与阶段集成。

文档准备和骨架阶段已进入共享 `dev`。四人拉取最新 `origin/dev`，按所属 START.md 在独立目录和固定分支开发。原工作目录存在已保留的未提交文档，安全快进因保护这些文件而中止；本机继续开发请使用已同步的 D managed worktree，避免直接覆盖原目录。

## 已核验与限制

已在隔离 PostgreSQL 17.6 数据库真实验证迁移、首次管理员创建及重复拒绝、原生登录、`me`、后台 HTML；无凭据构建及生产启动门禁通过。完整结果见 [D 验收](../acceptance/wp-d.md)。原工作目录的未提交文档保持原样。

- 开发与构建固定 Webpack：Turbopack 在当前 pnpm 布局下实际发生 Payload 数据库适配器传递依赖解析失败；Webpack 登录和页面已通过。
- 一次性管理员命令按 Payload 官方 CLI 生命周期，在等待写入和清理完成后明确退出，避免数据库池保留句柄导致命令挂起。
- 邮件密码恢复尚未接入；入口明确返回 503 联系运营者，不开放匿名账号字段写入。
- OSS 只安装适配包，照片 Collection/上传待 C 实现；GLM、ORS、搜索、实际区域、Zenith、备份恢复均未验证。
- 全包 P0/P1 和人工功能验收仍待执行。本次骨架通过不等于 D 整包完成。
- 临时验证数据库与生成的本地测试凭据已清理；未改现有 PostgreSQL 服务，不提供可复用的公开管理员账号。
