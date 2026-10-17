# 部署与恢复执行入口

日期：2026-10-17。本文是执行说明与证据索引；部署原则以 [技术文档第 11 节](../authority/AccessLoop_技术文档_v1.0.md#11-配置与-zenith-部署) 为准，字段与权限以 [API 契约](../authority/API_CONTRACTS.md) 为准。完整项目状态由 D 的交接/验收记录维护。

## 当前状态

- 已准备：不含秘密值的配置、health、PostgreSQL 和 TLS 出网探针；带 SHA-256 的自定义格式备份、独立空库恢复脚本；发布/恢复步骤与演示草案。
- 本地数据库实测：见 [local-recovery-evidence.json](local-recovery-evidence.json)。该记录只证明隔离本地 PostgreSQL 的相应步骤，不能替代 Zenith、照片、真实业务预算、会话或到期行为验收。
- 本机 TLS 实测：2026-10-17，ORS 与 GLM 的 TLS 握手成功；没有发送供应商 API 请求或验证密钥、模型权限、地理覆盖。此结果不能推导 Zenith 出网情况。
- Zenith、OSS、真实 ORS/Geocoding、GLM 核心链路及真实业务重启恢复：仍需现场配置并执行。没有线上入口，因此尚未生成二维码。

## 脱敏探针

```sh
pnpm exec tsx scripts/deployment-probe.ts
pnpm exec tsx scripts/deployment-probe.ts --http --database --egress
```

默认仅列出应用配置变量名及存在性。带参数时执行指定检查，任一检查 failed/blocked 时退出 1；无参数检查模式退出 0 不表示部署就绪。脚本按 Next.js 规则加载环境文件；存在性不能区分样例值和真实配置。

- `--http`：对 APP_BASE_URL 的 `/api/health` 发起不携带 Cookie 的请求，核对 JSON、状态、requestId 响应头和 no-store。只证明应用存活。仅允许 HTTPS 或本机 HTTP origin，拒绝带用户凭据、query、fragment 的地址，不跟随跳转。
- `--database`：用已安装的 psql 执行 `SELECT 1`。URI 转成 libpq 环境变量，密码不进入命令参数；不加载用户的 `.pgpass`，不创建第二套应用数据库连接或 ORM。缺少 psql 时检查失败。
- `--egress`：仅对 ORS_BASE_URL、OSS_ENDPOINT 和配置为 glm 时的 `open.bigmodel.cn` 做验证证书的 TLS 握手。不调用供应商业务 API，不绕过 C/D 原子预算门禁。

结果只含检查标签、状态、固定原因码和配置存在性；不输出 URL、Cookie、数据库行、响应正文或供应商错误原文。实际业务认证、路由、搜索、视觉与 OSS 权限必须通过同一应用及仓储验证。

## 最小缺项

1. 比赛提供的 Zenith 模板/项目入口及部署权限：确认 Node/容器方式、构建命令、PORT、资源、持久化、出网、密钥注入、健康检查与发布审核。公开页面没有给出比赛模板的 manifest Schema，本仓库未据此编造配置。
2. 真实部署地址；PostgreSQL 连接与持久化资源；稳定且分别配置的 PAYLOAD_SECRET、SESSION_SECRET。
3. OSS_ENDPOINT、OSS_BUCKET、OSS_REGION 及只允许指定私有前缀操作的 OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET；C 的实际上传、授权读取与备份目标。
4. ORS_API_KEY 及可用的 Geocoding 权限/分服务预算；VISION_API_KEY 和实际模型权限。调用只能经已持久化的预算预留。
5. D 的现场通道测量记录；已有带官方 GIS/OSM 来源的[校园候选](campus-survey.md)，仍需现场与真实 ORS 核验。另需 A/B/C 最新阶段集成代码，未取得实测证据不能称已验证可通行。

以上是所需资源类别，不要求将任何秘密填入提交或聊天。探针的存在性结果应在目标部署里重新生成。

## Zenith 官方核查

2026-10-17 读取的 [开发者发布说明](https://zenith.hosting/developers)要求公开 GitHub 仓库、zenith-compose.yml、介绍/图片及审核。当前私有仓库不能据此直接假定满足公开发布要求；比赛专用路径若有不同条件，以实际模板核对。

[官方 Agent 连接页](https://zenith.hosting/connect)提供 OAuth MCP 入口，支持部署、配置及健康读取；新部署另有价格批准。当前会话没有已连接的 Zenith 工具或现场模板，因此未登录、未创建部署、未变更仓库可见性。参阅 [官方指南目录](https://zenith.hosting/guides)。

## 发布与同一提交回归

1. 固定 integratedDevCommit、lockfile、Node/pnpm 版本及镜像 digest（如平台提供）；保留上一可用版本与对应迁移状态。
2. 按平台模板构建/启动现有单应用。现有脚本支持 PORT 并监听 0.0.0.0；在实际模板确认之前不把它当作平台验证。Next.js 的 [CLI 文档](https://nextjs.org/docs/app/api-reference/cli/next)说明端口/hostname 选项。
3. 经平台秘密注入配置真实依赖。单次执行 `pnpm db:migrate`，检查 `pnpm db:migrate:status`；受控初始化管理员。迁移不放入每次启动脚本。
4. 在该部署运行脱敏探针，再使用浏览器核验 `/`、`/admin`、`/cms-api/admins/me` 挂载与权限；探针不代替管理鉴权测试。
5. 共用同一集成版本完成一次真实照片→GLM→用户确认→个人绕行，再完成搜索、管理公共流程、另一匿名会话及自然过期。复用此证据，避免重复供应商调用。
6. 按 [恢复流程](recovery-runbook.md)完成真实业务重启和备份恢复后才记录对应通过；在真实 HTTPS 入口生成二维码并打开移动端复核。

## 校验

```sh
pnpm exec tsx --test tests/deployment.test.ts
pnpm exec eslint scripts/deployment-probe.ts tests/deployment.test.ts
bash -n scripts/backup-restore.sh
```

全应用仍须在待交付提交执行 package.json 的统一检查与构建。演示草案见 [demo-120s.md](demo-120s.md)。

部署接入发现补充：本会话使用 Plugin Management 搜索 Zenith，未返回可直接连接的插件。此结果不代表没有其他集成途径；仍可使用官方提供的项目模板/连接流程。
