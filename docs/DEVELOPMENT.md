# AccessLoop 本地开发

本仓库共用一个 Next.js + Payload 应用。四包职责、固定分支与阶段交付以 [COLLABORATION](authority/COLLABORATION.md) 为准；各包从包含初始化骨架的同一 `dev` 提交继续开发。

## 统一环境

- Node.js：使用根目录 `.nvmrc`。
- pnpm：使用 `package.json` 的 `packageManager` 精确版本。
- Next.js、React、Payload 和其他依赖：使用已提交的 `package.json` 与 `pnpm-lock.yaml`。
- PostgreSQL：使用独立的开发数据库；初始化已用 PostgreSQL 17.6 验证。

安装运行时后，在仓库根目录执行：

```sh
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

未配置数据库时，公众占位页 `/` 和 `/api/health` 可以运行。地图、报告、搜索和路线业务尚待各包实现。`/api/health` 只证明应用存活，不能作为外部服务已接通的证据。

当前固定使用 Webpack 开发和构建：初始化实测发现 Next.js 16.3.3 的 Turbopack 开发外部化会使 pnpm 安装的 Payload 数据库适配器无法解析传递依赖。切换构建器前应同时复验后台登录与构建。

## 数据库与后台

1. 准备独立 PostgreSQL 数据库，将 `.env.example` 复制为不入库的 `.env.local`。
2. 设置自己的 `DATABASE_URL`、`APP_BASE_URL` 和独立随机 `PAYLOAD_SECRET`、`SESSION_SECRET`；密钥在本实例重启后保持不变。示例本地数据库账号仅供开发，实际数据库需自行创建。
3. 设置仅用于受控初始化的 `ADMIN_EMAIL` 和不少于 12 字符的 `ADMIN_PASSWORD`，执行：

```sh
pnpm db:migrate
pnpm admin:bootstrap
pnpm dev
```

首次命令创建 operator。已有管理员时 bootstrap 拒绝再次创建；随后移除本地文件中的 `ADMIN_PASSWORD`，通过 `/admin` 登录。公众注册与 `first-register` 已关闭。邮件密码恢复尚未接入，相关入口明确返回不可用提示；账号恢复由部署运营者受控处理。Payload 原生认证和数据接口位于 `/cms-api`；GraphQL 入口本阶段关闭。

数据库结构使用版本化迁移，适配器 `push: false`。C 接管配置和集合后，修改模型时生成并检查新的迁移，保留已应用历史；迁移作为受控步骤执行，应用启动不会自动迁移或重置数据。

```sh
pnpm db:migrate:create descriptive_name
pnpm db:migrate:status
pnpm generate:types
pnpm generate:importmap
```

## 检查与生产启动

```sh
pnpm check
pnpm build
pnpm start
```

`check` 执行 lint、类型检查和测试。生成的 `src/payload-types.ts`、后台 import map 及版本化迁移应与模型一起提交。Next.js 自动修改 `AGENTS.md` 的功能已关闭，协作入口由项目维护。

生产启动通过 `prestart` 检查数据库、会话/后台密钥及 OSS 必需配置；缺失时拒绝启动。`pnpm build` 不需要真实供应商凭据。OSS 适配包已锁定，但照片集合与上传业务仍由 C 接入；GLM、ORS、搜索和 Zenith 均不因骨架可构建而算作已完成。

构建和启动遵循平台提供的 `PORT`；服务监听 `0.0.0.0`。Zenith manifest、资源、密钥注入和出网按现场模板验证。本阶段没有生成未经确认的 Zenith 配置。

## 分发给四包

- A/B 直接使用现有公众路由组和公共目录，不再初始化脚手架。
- C 接管 `payload.config.ts`、Collections、迁移和仓储，在现有管理员防护上继续实现数据业务。
- D 继续区域、地点、地理、路由、部署和总集成。
- 所有人安装相同 lockfile；依赖变更由 D 统一整合。共享契约仅实现了坐标、通道引用、路线输入和健康响应的最小结构，其余按唯一 [API 契约](authority/API_CONTRACTS.md) 增补。

初始化阶段的实际验证与剩余事项见 [D 交接](handoffs/wp-d.md) 和 [D 验收](acceptance/wp-d.md)。


## 本机已配置的开发库

本次D执行会话已在专用目录/端口配置本机PostgreSQL，并安全同步根`.env`与D`.env.local`。复用、启动停止和验证记录见[本机开发库](deployment/local-development-db.md)。这不是Zenith资源；无需另开应用数据库连接。用户更新密码达到现有脚本门槛后，首个operator已受控创建，并通过真实Local API登录与令牌身份验证；账号秘密只在本地配置中。
