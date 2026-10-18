# Zenith 预览配置与执行记录入口

本配置依据仓库内 Zenith Compose skill 的 contract/schema 与已锁定的 CLI 0.1.9 实现；部署原则见[技术文档第 11 节](../authority/AccessLoop_技术文档_v1.0.md#11-配置与-zenith-部署)。本页描述操作，实际通过范围见[本阶段验收](../acceptance/d-zenith-preview.md)。

## 配置

- Docker 构建与运行阶段均锁定 Node 22.14.0、pnpm 10.20.0；先复制 `.npmrc` 再安装冻结依赖。运行用户为 `node`，Corepack 缓存可读，应用监听 0.0.0.0:3000。
- `web` 是唯一公开服务。`db` 使用 PostgreSQL 17.6，`postgres-data` 持久卷挂载 `/var/lib/postgresql/data`，不公开数据库端口。卷的实际重建/保留行为仍须在平台验证。
- `APP_BASE_URL` 使用官方 `ZENITH_PUBLIC_URL` alias。两个独立应用秘密由平台生成；正式重建及恢复必须确认其保持稳定，原匿名 Cookie 和 Payload 认证才可继续使用。
- 私有输入经官方 CLI 的 local-env 通道单独注入，不进入源码压缩包或 Docker build。`DATABASE_URL` 指向内部 `db:5432/accessloop`，其中密码须与 db 实际获得的 `POSTGRES_PASSWORD` 一致；平台实际注入及服务隔离范围仍待运行验证。不能上传本机 loopback 数据库地址。
- 平台当前渲染器拒绝契约中合法的 `pre_start` 和 `input` 声明。web 通过 `scripts/zenith-start.sh` 顺序执行受控空库 bootstrap、`scripts/zenith-initialize.ts`、Next。仅明确启用 `ZENITH_BOOTSTRAP_EMPTY_DATABASE=1` 且 schema 完全没有用户对象时，调用现有 C 迁移；已有库只核对完整迁移集，不运行迁移。不兼容库拒绝启动并保留数据。每条原生迁移独立提交，失败后的部分库不会自动续跑。初始化沿用 C 的 Payload 配置、仓储和事务，不新增连接/ORM。仅空管理员表创建 operator，已有账户不覆盖；仅不存在的 demo 区域写入明确 synthetic 的通道。该区域不代表校园实测。
- Compose 保留原模板的 web 端口映射、db healthcheck 和 web depends_on，兼容后的完整配置已通过平台只渲染诊断；数据库实际等待和初始化仍须看新预览日志。静态 Schema 通过不能代表当前后端接受全部扩展字段。

## 私有输入准备

私有环境文件仅保存在忽略的 `.local/zenith-preview-context/.env.local`，权限 0600。需要注入数据库连接/密码、管理员初始化邮箱/密码、OSS 配置和身份凭据、ORS/Vision/cloud 凭据及服务参数。秘密不写聊天、Git 或日志。公开发布与预览是不同流程；本阶段没有变更仓库可见性或申请付费公开部署。

同一密钥必须持续使用一份持久预算。预览首次接管前，通过 C 的 Payload 仓储只读导出仍有效的预留、封锁及最近 24 小时脱敏事件；`PROVIDER_LEDGER_SNAPSHOT` 是有上限的 Brotli/base64 私有输入，不包含照片、报告、行程或原始密钥。恢复在 C 事务及锁内完成，重复相同快照不重复插入；目标已有不兼容事件 ID 时先拒绝，不能清表解决。

该快照只用于一次接管，不会持续同步两套数据库。相同供应商密钥的旧运行实例须停止，或全部实例改为共用同一原子账本后，才能开放新预览的真实调用。转移前重新导出，不能因旧导出过时而少计预算。后续恢复沿用[恢复说明](recovery-runbook.md)，不得覆盖非空业务库或重置预算。

## 执行顺序

开发代理执行下列命令；人工只验功能页面。用户已明确授权源码上传和私有输入注入。首次授权上传因上述平台兼容性差异在渲染阶段失败，未构建；兼容修复后的实际启动继续按以下顺序验证。

```sh
pnpm exec zenith check --project .local/zenith-preview-context --upload-size
pnpm exec zenith up --project .local/zenith-preview-context
pnpm exec zenith logs --project .local/zenith-preview-context --source all --tail 180
```

上传前将固定交付提交的 Git archive 刷新到 context，保留独立私有 env；检查 archive 排除 `.env*`（允许 `.env.example`）、`.local`、`.git`、`.next`、node_modules 等私有/生成内容。CLI check 只做静态检查，不表示真实构建或持久化通过。

检查构建、受控首次迁移、初始化及健康日志，再验证 HTTPS、公众页、`/api/health`、`/admin`、`/cms-api` 的真实权限、OSS/模型/ORS 出网和预算。随后执行照片报告/确认/预算重启、到期不复活、最小备份恢复；用同一集成提交完成 P0/P1 回归，才记录线上入口和二维码。失败日志保留，不能把本机成功替代平台证据。

## 构建诊断与受限环境

Docker构建保留Next的类型检查，使用官方支持的`webpackBuildWorker`、`webpackMemoryOptimizations`及单worker。只读诊断输出版本、CPU、内存和Linux pressure的有界元数据，不输出环境值；cgroup不可见时标记null，不据宿主可用内存推断容器上限。失败/退出信号继续导致镜像失败。参考[Next官方内存说明](https://nextjs.org/docs/app/guides/memory-usage)。实际平台是否通过以[阶段验收](../acceptance/d-zenith-preview.md)为准。

构建RUN临时使用`NODE_OPTIONS=--max-old-space-size=1024`；该数值为每进程V8旧生代上限，非总RSS限额。运行镜像不设置此变量。512/768MiB及外置依赖方案未通过完整构建，未采用。
