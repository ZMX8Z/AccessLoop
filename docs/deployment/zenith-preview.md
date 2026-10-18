# Zenith 预览配置与执行记录入口

本配置依据仓库内 Zenith Compose skill 的 contract/schema 与已锁定的 CLI 0.1.9 实现；部署原则见[技术文档第 11 节](../authority/AccessLoop_技术文档_v1.0.md#11-配置与-zenith-部署)。本页描述操作，实际通过范围见[本阶段验收](../acceptance/d-zenith-preview.md)。

## 配置

- Docker 构建与运行阶段均锁定 Node 22.14.0、pnpm 10.20.0；先复制 `.npmrc` 再安装冻结依赖。运行用户为 `node`，Corepack 缓存可读，应用监听 0.0.0.0:3000。
- `web` 是唯一公开服务。`db` 使用 PostgreSQL 17.6，`postgres-data` 持久卷挂载 `/var/lib/postgresql/data`，不公开数据库端口。卷的实际重建/保留行为仍须在平台验证。
- `APP_BASE_URL` 使用官方 `ZENITH_PUBLIC_URL` alias。两个独立应用秘密由平台生成；正式重建及恢复必须确认其保持稳定，原匿名 Cookie 和 Payload 认证才可继续使用。
- 私有输入经官方 CLI 的 local-env 通道单独注入，不进入源码压缩包或 Docker build。`DATABASE_URL` 指向内部 `db:5432/accessloop`，其中密码须与只注入 db 的 `POSTGRES_PASSWORD` 一致。不能上传本机 loopback 数据库地址。
- web 的 `pre_start` 顺序为现有 C 迁移、`scripts/zenith-initialize.ts`。初始化沿用 C 的 Payload 配置、仓储和事务，不新增连接/ORM。仅空管理员表创建 operator，已有账户不覆盖；仅不存在的 demo 区域写入明确 synthetic 的通道。该区域不代表校园实测。
- Compose 的 db healthcheck、web depends_on 和顺序 pre_start 均已通过官方 CLI 静态检查；平台 init 容器实际等待数据库就绪的行为仍须看新预览日志，不能由静态检查推导成功。

## 私有输入准备

私有环境文件仅保存在忽略的 `.local/zenith-preview-context/.env.local`，权限 0600。需要注入数据库连接/密码、管理员初始化邮箱/密码、OSS 配置和身份凭据、ORS/Vision/cloud 凭据及服务参数。秘密不写聊天、Git 或日志。公开发布与预览是不同流程；本阶段没有变更仓库可见性或申请付费公开部署。

同一密钥必须持续使用一份持久预算。预览首次接管前，通过 C 的 Payload 仓储只读导出仍有效的预留、封锁及最近 24 小时脱敏事件；`PROVIDER_LEDGER_SNAPSHOT` 是有上限的 Brotli/base64 私有输入，不包含照片、报告、行程或原始密钥。恢复在 C 事务及锁内完成，重复相同快照不重复插入；目标已有不兼容事件 ID 时先拒绝，不能清表解决。

该快照只用于一次接管，不会持续同步两套数据库。相同供应商密钥的旧运行实例须停止，或全部实例改为共用同一原子账本后，才能开放新预览的真实调用。转移前重新导出，不能因旧导出过时而少计预算。后续恢复沿用[恢复说明](recovery-runbook.md)，不得覆盖非空业务库或重置预算。

## 执行顺序

开发代理执行下列命令；人工只验功能页面。当前源码上传及私有输入注入尚未获本次自动审批通过，暂不执行 `up`。

```sh
pnpm exec zenith check --project .local/zenith-preview-context --upload-size
pnpm exec zenith up --project .local/zenith-preview-context
pnpm exec zenith logs --project .local/zenith-preview-context --source all --tail 180
```

上传前将固定交付提交的 Git archive 刷新到 context，保留独立私有 env；检查 archive 排除 `.env*`（允许 `.env.example`）、`.local`、`.git`、`.next`、node_modules 等私有/生成内容。CLI check 只做静态检查，不表示真实构建或持久化通过。

获得明确上传授权后，检查构建、迁移、初始化及健康日志，再验证 HTTPS、公众页、`/api/health`、`/admin`、`/cms-api` 的真实权限、OSS/模型/ORS 出网和预算。随后执行照片报告/确认/预算重启、到期不复活、最小备份恢复；用同一集成提交完成 P0/P1 回归，才记录线上入口和二维码。失败日志保留，不能把本机成功替代平台证据。
