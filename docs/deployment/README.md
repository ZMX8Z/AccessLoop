# 部署与恢复执行入口

日期：2026-10-18。本文是执行说明与证据索引；部署原则以 [技术文档第 11 节](../authority/AccessLoop_技术文档_v1.0.md#11-配置与-zenith-部署) 为准，字段与权限以 [API 契约](../authority/API_CONTRACTS.md) 为准。完整项目状态由 D 的交接/验收记录维护。

## 当前状态

- 已准备：不含秘密值的配置、health、PostgreSQL 和 TLS 出网探针；带 SHA-256 的自定义格式备份、独立空库恢复脚本；发布/恢复步骤与演示草案。
- 持久本机开发库已配置、迁移/重启/密码认证及SELECT1通过；管理员已受控初始化并通过Local API登录/身份验证，见[本机开发库](local-development-db.md)。C0持久仓储/匿名会话/预算已进入dev，见[C0集成验收](../acceptance/c0-integration.md)；C15照片/报告/分析服务、后台权限及B公众页面已进入dev，最新集成见[四包回执](../acceptance/d-four-package-integration.md)。
- 早期[本地数据库实测](local-recovery-evidence.json)仅验证隔离PG步骤；后续[业务恢复](business-recovery-evidence.json)和[配套对象恢复](object-recovery-evidence.json)已在本机验证单个合成照片/报告/确认、原Cookie、持久预算与到期重启不复活，仍不代替Zenith或全库生产照片备份。
- 本机 TLS 实测：2026-10-17，ORS 与 GLM 的 TLS 握手成功；该TLS探针没有发送供应商 API 请求或验证密钥、模型权限、地理覆盖。此结果不能推导 Zenith 出网情况。
- ORS/Geocoding经C持久预算各一次真实HTTP200，专用PG重启保留预算和事件，见[供应商连接证据](provider-connection-evidence.json)。不代表公众路线/搜索闭环已过。
- 用户已补齐OSS五项配置并同步D环境；本机S3兼容上传、授权读取、匿名403、签名读取/过期403、删除/404均真实通过，见[OSS连接证据](oss-connection-evidence.json)。两次随机合成探针对象均已删除；没有读取已有对象。
- Zenith、现场区域与最终真实导航/搜索/公共管理浏览器闭环仍待验证；cloud实时设施补充及真实底图已有本机验证，见[地图/设施部署](maps-and-facilities.md)。C15照片授权/报告、本机业务恢复、B隔离人工报告流程及付费GLM照片分析已通过。没有线上入口，因此尚未生成二维码。

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

1. Zenith 模板、官方 Compose contract/schema、已认证 CLI 已具备；原预览 Node 版本失败已定位并修复。新 `up` 的私有源码/秘密传输被自动审批拒绝，待明确授权，见[预览配置](zenith-preview.md)和[固定提交验收](../acceptance/d-zenith-preview.md)。
2. 用户已选择平台内持久 PostgreSQL；Compose、内部连接和独立应用秘密配置已准备，实际数据库就绪、注入/重启稳定性及新 HTTPS 地址仍待平台验证。
3. OSS本机配置、C15真实照片上传/授权代理与单样本配套备份回填已验证；Zenith仍需验证连接和权限、配套生产备份目标及完整照片覆盖。秘密不进入提交或浏览器。
4. ORS/Geocoding密钥与权限已实测；VISION_API_KEY已配置。早期[GLM探针](vision-connection-evidence.json)返回429/1305，仅在该进程设日上限1、未修改环境。后续本地Vision日预算显式设为10次/日并重启；集成9cfd186的一次有界重查仍429/1305，见[新证据](vision-recheck-evidence.json)。用户后续指定付费glm-4.6v并确认充值，真实连通与私有照片HTTP分析/重放/缓存已通过，见[付费证据](paid-vision-evidence.json)；旧1305与充值前1113均保留。解析规则见技术文档11.1，调用须经持久化预算。
5. D 的现场通道测量记录；已有带官方 GIS/OSM 来源的[校园候选](campus-survey.md)，仍需现场与真实 ORS 核验。四包当前阶段代码已集成，仍需最终真实闭环及人工验收；未取得实测证据不能称已验证可通行。

6. 主地点源HeiGIT/Overpass的旧失败保留在[连接记录](poi-connection-evidence.json)；后续accessibility.cloud已提供实时补充设施，配置与覆盖限制见[接线说明](maps-and-facilities.md)。不再将所有实时设施来源列作缺失。

以上是所需资源类别，不要求将任何秘密填入提交或聊天。探针的存在性结果应在目标部署里重新生成。

## Zenith 官方核查

2026-10-17 读取的 [开发者发布说明](https://zenith.hosting/developers)要求公开 GitHub 仓库、zenith-compose.yml、介绍/图片及审核。当前私有仓库不能据此直接假定满足公开发布要求；比赛专用路径若有不同条件，以实际模板核对。

[官方 Agent 连接页](https://zenith.hosting/connect)提供 OAuth MCP 入口，支持部署、配置及健康读取；新部署另有价格批准。当前未发现已连接的 Zenith MCP；已使用项目锁定的官方 CLI 读取原预览日志、核对真实 contract/schema 并完成静态检查。新上传被自动审批拒绝，未创建新预览、未变更仓库可见性。参阅 [官方指南目录](https://zenith.hosting/guides)。

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


## OSS 接入实测参数交接给 C

本机实测使用已锁定的`@payloadcms/storage-s3`所依赖AWS SDK 3.1152.0，`forcePathStyle:false`、`requestChecksumCalculation:'WHEN_REQUIRED'`、`responseChecksumValidation:'WHEN_REQUIRED'`，固定HTTPS外网endpoint；应用显式读取OSS配置，不依赖SDK自行识别OSS环境变量。此配置通过一个随机合成对象验证，不是对Payload照片插件/业务权限的验收。

[阿里云官方兼容说明](https://www.alibabacloud.com/help/en/oss/developer-reference/compatibility-with-amazon-s3)要求virtual-hosted寻址；本次读取/写入/删除在该方式真实成功。C实现和挂载photos时复用已验证参数，保留现有API规定的应用授权代理。签名URL仅在服务端探针内用于兼容/到期检查，没有交给前端或写入证据。

首次2秒签名在匿名检查之后得到403，无法区分提前过期；该次结果未计作签名通过。后续用30秒链接验证200，并用另一条2秒链接先得到200、等待后得到403，才记录过期通过。证据保留原失败，不修改Bucket权限以绕过问题。生产配置存在性检查`pnpm exec tsx scripts/check-environment.ts`已exit0；尚未据此声称Zenith或完整生产流程通过。
