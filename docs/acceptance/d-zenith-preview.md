# D：Zenith 预览失败修复准备

当前：用户已授权且源码/私有输入已上传；实际提交2ec148e已进入构建，随后Zenith控制面及控制台首页持续502。最后复查为2026-10-18 15:12（Australia/Sydney）。无可交付在线地址，PR #23仍为draft；下方保留各阶段证据。

日期：2026-10-18。分支 `codex/d-backend-routing`，独立 D 工作目录。

- baseDevCommit：`9891b3ba7a8e6f14fa5cb3b59a34d713f654cfae`（用户提供的 Zenith 模板已进入 dev）。
- codeEvidenceCommit：`86a3892635b117d5ea4c9311ab39985cdcef2ab3`；其后交付记录提交不改运行代码，最终 head 以本阶段 PR 元数据为准。
- 子分支 CLI 锁定提交 `56ae499e3d384e814683a7db2fee6ad68a841b92` 已先合回 D 父分支。阶段 PR 必须 base=dev；不向 main 合并。
- integratedDevCommit：尚无。本阶段待真实预览验证，先提供 draft PR。

## 原因与修复

原预览 `01M56FMK83TP7ZMMJBJR6ZFMA4` 的官方 CLI 构建日志确认：模板 `node:22-alpine` 解析为 Node 22.23.3，项目 engines 要求 22.14.0，`pnpm build` 因 `ERR_PNPM_UNSUPPORTED_ENGINE` 退出。原静态 check 成功未覆盖这个运行时差异。

修复锁定构建/运行 Node 22.14.0 和 pnpm 10.20.0，提前复制严格 `.npmrc`；沿用同一 Next/Payload 应用。按用户选择增加平台内部 PostgreSQL 17.6 与持久卷、db/web 健康检查、顺序迁移和 C 仓储初始化，已有管理员与区域不覆盖。OSS 继续使用已配置的私有存储。

预算接管使用现有 C 事务/仓储恢复有效账本和脱敏事件。两轴独立审查发现跨 v1/v2 事件 ID 可能导致重复计数；已在任何写入前拒绝不兼容目标，复核关闭该项。快照不是两套活跃数据库的持续共享方案，接管前必须停用相同密钥旧实例或共用账本。

## 已执行

| 检查 | 实际结果与边界 |
| --- | --- |
| `pnpm install --offline --frozen-lockfile` | 成功，CLI 0.1.9 锁定安装 |
| `pnpm exec zenith check --upload-size` | D 及预览 context 均成功；仅静态，不是平台构建 |
| `pnpm check`，产品提交 86a3892 | lint、Next 类型生成、tsc 通过；270 通过、11 默认集成跳过、0 失败 |
| 无环境文件的 Git archive 生产构建 | `pnpm build` exit 0，含 `/admin`、`/cms-api`、所有业务 API；本机 Node 22.14.0，非 Linux 容器验证 |
| 独立 Standards 审查 | 无剩余发现；原固定头 packaging 7/7，通过范围不含外部依赖 |
| 独立 Spec 复核 | 修复头 packaging 8/8、0 失败/跳过；恢复兼容性项关闭 |
| 本机原子账本只读导出 | 474 预留、0 有效封锁、1687 脱敏事件；源库未改变，未把余额冒充调用统计 |
| CLI 本地 archive 审核 | 382 文件、6115540 字节，私有/生成文件 0；仅初次准备头，上传前须按最终 head 重新生成 |
| 上传/新预览 | 自动审批在执行前拒绝；没有上传或创建新预览 |

本地检查日志：`/private/tmp/accessloop-zenith-original.log`、`accessloop-zenith-reviewed-check.log`、`accessloop-zenith-clean-build.log`（同目录）；这些是当前机器的辅助记录，可提交聚合见[JSON](../deployment/zenith-preview-evidence.json)。初始 gzip 快照超 CLI local-env 上限的失败保留；压缩/分组方案通过边界测试及真实解析后，26 项私有输入共 29789 字节。源码与私有输入分别处理，未在证据记录值。

## 尚未通过

自动审批认为既有指令没有明确授权向 Zenith 发送私有源码及数据库、OSS、供应商和管理员配置，拒绝了 `zenith up`。需要用户明确授权本次数据传输后才能继续；不通过其他工具绕过。

修复后的平台镜像构建、pre_start 的数据库就绪顺序、秘密注入、持久卷/重启、出网、照片/确认/预算与恢复均未验。没有新线上 URL 或二维码；P0/P1 总验收仍未通过。执行入口与预览权限范围见[操作说明](../deployment/zenith-preview.md)。A 的 Stitch 后续 PR #21 未包含在本阶段基线上，不声称移动端修复已经部署。

## 用户授权后的兼容修复与真实启动（最新状态）

用户已明确回复“授权上传并启动预览”，初次传输审批不再是当前阻塞。首次授权会话 `01M56HTPTRY7S9R1Y2VSWKP4RN` 已安全接收26项私有输入，但在镜像构建前返回 COMPOSE_RENDER。原模板与相同私有输入可渲染；数据库/持久卷、web health/environment、alias/generate 均通过单项平台渲染，而 input 声明和 pre_start（数组或字符串命令）均失败。兼容后的完整配置已通过平台渲染，所有诊断仅渲染、未启动业务。

当前产品/实际上传提交：`2ec148e9a914833b23c414b60bff14ed81c609ae`。Compose 使用CLI独立私密输入，容器入口顺序执行仅显式允许的新空库迁移、幂等初始化和Web。已有库核对完整迁移集而不迁移；函数/过程及合法pgcustom用户schema均纳入判空。源数据库没有清表或预算改写。原 f8a9442 构建在业务运行前已停止（状态deleted），因此未建立两个使用相同密钥的活跃账本。

- 最新 `pnpm check`：274通过、12默认集成跳过、0失败，lint/typecheck通过。
- bootstrap+packaging：12/12；真实PostgreSQL schema边界回归先红后绿1/1，随机创建对象均在C事务回滚；测试以Node test-force-exit结束SDK残余连接。
- 独立Spec发现的numeric字符串解析、Standards发现的函数及pg_通配符边界均已修复并复核关闭。
- 当前实际会话：`01M56JV8MV4VTSHRF0NZTEGNYF`；最近可读状态为building；随后平台控制面502，当前运行状态未知，尚无可交付入口。固定Node镜像及pnpm安装已通过，仍待Linux生产构建、数据库启动和真实HTTP验证。

辅助日志：`/private/tmp/accessloop-zenith-final-up.log`、`accessloop-zenith-schema-final-check.log`、`accessloop-zenith-schema-prefix-green.log`。当前没有平台重启、备份恢复或完整P0/P1通过结论。

### 当前外部阻塞：Zenith 控制面 502

2026-10-18 15:09–15:10（Australia/Sydney）只读复核：账户预览列表、当前预览状态和build日志接口均HTTP502；浏览器打开 https://app.zenith.hosting/ 也显示Cloudflare Host Error 502（Ray a4c4b0493cbbd367）。这不是缺少API密钥的响应。CLI读取状态失败并退出，其仅取消排队请求也返回502，不能推定后台构建已经停止或失败。不得重复创建新预览或重置预算；平台恢复后先读取同一会话01M56JV8MV4VTSHRF0NZTEGNYF，再运行已有脱敏HTTP验证。

截至该记录，没有执行在线管理员登录、匿名会话写入、业务供应商调用、图片上传或平台恢复；因此PR仍为draft，不合并为已通过的部署阶段。无需用户再次提供凭据或重复授权。
