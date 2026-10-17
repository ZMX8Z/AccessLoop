# C1 接入准备与供应商验证

> 当前状态更新：Gavin 后续明确指示“GLM不管了，直接推吧”，解除模型必须先通过的开发前置条件。C1 人工报告与真实 OSS 流程现已实现并验证，详见 [C 交接](wp-c.md) 和 [当前验收](../acceptance/wp-c.md)。以下为供应商准备阶段历史记录；GLM 仍未通过，没有追加真实模型调用。

2026-10-17，悉尼时间。当前分支为 `codex/c-backend-data-ai`，基线为 `d3e06bded36f2ca4cef98cd2a802dc633acf8a01`，代码检查对应提交为 `0a971d4fda31bf00a39695fbd97a69001037dc90`。本阶段仅准备图片处理、OSS 配置、GLM 适配和可重跑探针，不代表 C1 业务完成。

交付前再次同步至 dev `7d57441d624f8630be68d623463a7c4766bb62ed`。新增 dev 提交只涉及文档、OSS 证据和 A 阶段审查；`src`、`scripts`、`tests` 与上述代码检查提交无差异，沿用同一源码的本地检查记录，没有追加模型请求。

## 实测结果

OSS 上传、授权读取、SHA-256 核对、匿名读取拒绝、签名读取和测试对象删除均通过。只写入并删除了本次随机测试对象，没有更改 Bucket 权限或其他文件。该结果证明对象读写和私有访问控制；Payload 上传、应用会话归属与 Zenith 仍需后续联调。

GLM 共发送三次程序生成的 JPEG，未包含个人信息。第一次返回 HTTP 429；补齐脱敏业务码诊断后，第二次和第三次均返回 HTTP 429、业务码 `1305`。按[智谱官方错误码](https://docs.bigmodel.cn/cn/api/api-code)，这表示模型当前访问量过大。没有收到有效工具结果，不能认定图片和工具调用能力通过，也不能由此认定密钥或账号权限正确。

按 Gavin 的“通过后继续推进 C1”要求，本轮没有启动报告、个人避让和导出业务实现。没有把人工降级、单元测试或 HTTP 200 当作真实模型验收。详细结果见[机器可读证据](../acceptance/c1-provider-evidence.json)。

## 本地配置

已有配置位于旧目录 `AccessLoop/.env`。本轮仅将非空的 `VISION_*` 和 `OSS_*` 同步到当前目录的 `.env.local`，保留现有 C0 数据库、Payload 和会话配置。环境文件已被 Git 忽略，未记录任何秘密。

Gavin 明确选择“不限制”每日调用次数，因此 C 的 `.env.local` 使用 `VISION_DAILY_BUDGET=unlimited`。`parseVisionPolicy` 将这个显式值映射到现有 D 门禁接受的 `Number.MAX_SAFE_INTEGER`，不施加实际每日应用上限。供应商配额仍有效，分钟保护默认 10 次，单次超时默认 8000 毫秒。每次失败和有限重试仍分别计入持久化预算。

需要交给 D 的配置变更需求：在共享 `.env.example` 中说明 `VISION_DAILY_BUDGET` 接受正整数或 `unlimited`，并说明可选 `VISION_RPM`，默认 10。本轮未修改 D 负责的 package、lockfile、构建或环境示例。

## 重跑一次 GLM 验证

在当前 C 工作目录使用团队 Node 22.14.0 和 pnpm 10.20.0，确认本机 PostgreSQL 已启动，再运行：

```sh
pnpm exec tsx scripts/probe-glm.ts --attempts=1
```

通过时输出 `status=passed`、`toolResultValidated=true`，并正常退出。`completed` 和结构合法的 `uncertain` 都能证明图片和指定工具接线成功，但不代表准确率验证。`unavailable` 或非零退出均不算通过。脚本经真实 Payload 仓储与 D ProviderGate 调用，不绕过预算。

不要高频重跑。若仍为 `1305`，保留原配置，待模型恢复后验证。若团队另有支持原生图片和工具调用的可用模型，先核对平台、模型权限与费用，再调整接入；不能只换成文本模型宣称通过。

需要重复核对 OSS 时运行：

```sh
pnpm exec tsx scripts/probe-oss.ts
```

脚本默认只操作 `accessloop/photos/probes/` 中本次随机对象，不打印密钥、Bucket 名称、对象地址或签名链接。cleanup 必须成功，才能算本次完整通过。

## 后续接线

- 图片处理入口为 `processReportImage`，位于 `src/server/photos/image.ts`。它核对实际 JPEG、PNG 与 MIME，限制原始大小和像素，纠正方向、缩放、重编码并去 EXIF。
- OSS 配置入口为 `getOssStorageOptions`，位于 `src/server/photos/oss.ts`。正式接入应使用已安装的 `s3Storage`，禁用本地持久化与客户端直传，按业务权限代理读取。探针使用该插件锁定的 SDK；生产代码不依赖探针解析传递依赖的方式。
- 视觉入口为 `createGlmAdapter`，位于 `src/server/providers/glm.ts`。业务调用必须由 `ProviderGate` 包裹。`src/shared/contracts/vision.ts` 只接受唯一 `record_hazard_analysis` 工具结果，服务器再做结构与语义校验。不能执行任意工具。
- 网络请求在数据库事务外。模型失败发生在实际调用后时，分析业务保存明确 unavailable 结果；门禁尚未允许调用时返回相应错误，不生成完成记录。
- 待 GLM 真实通过，再增加 photos、ai-analyses、报告 facts 及增量迁移，完成上传、本人读取、分析、报告、预览、明确确认、续期、停用与授权导出。

报告服务已完成只读设计，建议入口为 `createHazardService(payload, {regionId, sessionSecret, visionConfig, now})`。报告与分析归属、个人上下文版本、审计和幂等结果共用一个 Payload 事务。预览与确认复用 D 的 `resolvePassage`，确认时重新读取和核对，不另写几何算法。

C2 扩展公共发布快照时，需同步处理 C0 `PublicSnapshotSchema` 的严格四字段解析。路由读取应校验投影，公共 DTO 仅接受完整、经管理员认可的发布快照，不用当前私人事实拼公共输出。

## 已运行的本地检查

新增图片和视觉行为测试 21 项全部通过，无跳过。独立审查发现并修复了全空白模型描述可被接受的问题，新增回归覆盖空格、换行和全角空格。八个新增源文件、探针和测试文件的 ESLint 通过。全仓 `pnpm exec tsc --noEmit --incremental false` 通过。数据库只读复核得到三条 call 和三条 error，符合实际请求次数。探针的模型故障仍是外部条件阻塞；没有把桩测试算作真实 GLM 通过。本轮没有修改应用路由或 Payload 配置，没有重跑生产构建，也没有完成前端、数据库迁移或 Zenith 联调。
