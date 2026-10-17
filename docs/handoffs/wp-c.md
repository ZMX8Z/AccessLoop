# C 交接：C1 私有上传与人工报告流程

## 当前交付，2026-10-17

Gavin 最新指令原文为“GLM不管了，直接推吧”。本阶段按该指令交付人工流程，不等待 GLM 恢复，也没有追加真实 GLM 请求。AI 适配和分析接口保留，但真实模型能力仍未通过；这不是完整 P0、P1 或 Zenith 验收结论。

- branch：`codex/c-backend-data-ai`。
- baseDevCommit：`1d2cd2b9b3420a9b0c072a3b54ec258839a95b19`；同步时安全快进，未重写历史。
- codeEvidenceCommit：`efe3269e0832f96e949786ac03120dbd5ee29813`。后续文档及生成迁移的空白整理不改变已验证逻辑。
- C0 PR #7、供应商准备 PR #13 已由 D 合入。当前阶段为 [C1 PR #15](https://github.com/ZMX8Z/AccessLoop/pull/15)，base=dev，创建时 head=`c4679a126a5536dd1d580aa8a88fbeec57f02cd7`；平台确认 OPEN、非草稿、MERGEABLE，等待 D 复核集成。后续交付链接提交不改变运行代码，最终 head 以平台为准。
- 实际结果及命令见 [C 技术验收](../acceptance/wp-c.md)；本机开发演示为 `http://localhost:3100/c1-demo`，生产环境返回 404。

### 本阶段可接线的功能

| 入口 | 已实现行为 |
| --- | --- |
| `POST /api/uploads`、`GET /api/photos/:id` | JPEG/PNG 解码、限大小、去 EXIF、私有 OSS、同键重放、归属校验；CMS 和原生文件入口不能绕过业务读取 |
| `POST /api/analyze` | 明确同意才调用；D 门禁、持久租约、不可变分析、按会话缓存；失败可返回 unavailable，不能冒充 completed |
| `POST /api/reports`、`GET /api/reports`、`GET/PATCH /api/reports/:id` | 人工事实与原始 AI 分开保存；本人读取和公共发布白名单分离；写入带版本及幂等键 |
| `POST /api/reports/:id/avoidance-preview` | 复用 D 的通道几何，返回短期签名预览；不修改个人有效集 |
| `POST/DELETE /api/reports/:id/avoidance` | 明确确认或续期才生效；停用只影响本人；版本、确认、审计、幂等在同一事务提交 |
| `GET /api/reports/:id/export` | 作者授权照片、事实和确认记录；公共导出仅用发布快照；文本转义、私有缓存及 CSP；可复制和打印 |

照片、分析、位置、观测时间或通道等确认依据改变，会使旧确认失效；只改描述或分类保留有效绑定。过期按查询推导。公共变化和管理状态机属于 C2/C3，不能通过 C1 原生 CRUD 修改。

### 给 A/B 与 D 的接线说明

- 先 `POST /api/session`，保留 HttpOnly Cookie。写请求同源，带 `Idempotency-Key`；已有报告写入带 `expectedVersion`。字段只依照 [API 契约](../authority/API_CONTRACTS.md)，客户端 Schema 已从 `src/shared/contracts/index.ts` 导出。
- 主服务：`src/server/photos/service.ts`、`src/server/photos/analysis.ts`、`src/features/hazards/server/service.ts`；HTTP 边界：`src/features/hazards/server/http.ts`。所有业务共享 Payload 数据库连接，网络请求不占业务事务。
- B PR #8 尚未合入。本次将其 `adc42779` 的导出版式适配为 `export-html.ts`，避免 Next RSC 对 ReactDOM server 的构建限制；没有导入 B 的假成功客户端。未来 B 的 `export-template.tsx` 不与此文件重名。
- `src/app/(payload)/admin/importMap.js` 是 Payload S3 插件生成入口，随配置提交；这不开放客户端直传。package、lockfile 和共享环境示例未由 C 改写。
- 本地仍使用明确标识的合成区域和通道。D 的实测校园数据、B 正式报告页面、C2/C3 管理功能、同一集成提交上的 Zenith 验证都待完成。

### 迁移与环境

新增 `20261017_075455_c1_photos_analyses_reports`：照片、上传操作、外部分析操作、不可变分析，以及报告 facts。开发库和可丢弃测试库已升级；只有测试库做过本次增量 down/up。正式环境只执行 `pnpm db:migrate`，不要撤销数据库来部署。

当前 C 目录的忽略文件 `.env.local` 保留既有 `DATABASE_URL`、`PAYLOAD_SECRET`、`SESSION_SECRET`、`APP_BASE_URL`、`REGION_ID`，并配置团队 `OSS_*` 和可选 `VISION_*`。不要提交或复制密钥到聊天。测试库由独立 `.env.c0-test` 指向，不复用正式数据库。`VISION_DAILY_BUDGET=unlimited` 保留用户选择，分钟门禁和供应商配额仍有效。

OSS 配置缺失或不通时明确失败，不回退本地文件，也不返回假上传成功。GLM 只有显式同意后才调用；当前演示直接选择人工填报。真实模型探针历史保留在 [供应商记录](c1-provider-checks.md)。

### Gavin 的演示入口

打开项目外层的 `C0开发终端.cmd`，运行 `pnpm dev --port 3100`。访问 `/c1-demo`，依次操作：上传合成样例 → 保存人工报告 → 预览 → 勾选确认 → 启用个人避让 → 打开打印记录 → 停用。AI 按钮可跳过。页面和截图均标明合成数据，不能作为校园通行证明。

浏览器已实际完成上述流程及复制导出文本。确认时截图见 [C1 演示证据](../acceptance/screenshots/c1-manual-confirmed.png)。独立只读代码审查未发现剩余高优先级问题，但这不代替正式前端联调或目标使用者测试。

## 历史：C0 数据与会话基础

日期：2026-10-17，Australia/Sydney。分支 `codex/c-backend-data-ai`。本次仅交付 C0 工程基础及 D 服务接线；C1、C2/C3 未计入完成。

## 基线和提交

- 初始基线：`1ad24d707370a80fb0dc11da20b7e55be6d310c7`。
- 首份基础提交：`9383630`，包括数据仓储、会话和开发演示。
- 最新同步 baseDevCommit：`7d0f552f9b99472c8a61ee7038f28a2539d45abe`，通过 merge 同步 D 服务基础与交接，不重写共享历史。
- codeEvidenceCommit / headCommit：`d424b3e910fd71fdb6b3e2302a8b4dc69688c645`；后续仅文档提交可以复用运行代码证据，PR 最终 head 以平台为准。
- 工程阶段技术验收及独立代码审查通过，完整 C0 的实测数据导入仍依赖 D。详细命令、平台限制与状态见 [C 验收](../acceptance/wp-c.md)。
- 阶段草稿 PR：[#7](https://github.com/ZMX8Z/AccessLoop/pull/7)，base=dev，head=codex/c-backend-data-ai。创建时 deliveryHead=`53809a27186de6db67b0f246d5af4736895170b5`；之后仅补充交付链接记录，运行代码仍以 d424b3e 为证据。未执行合并，D 按团队约定集成。

## 本阶段范围

- 同一 Payload PostgreSQL 连接下的区域、预设通道、匿名会话、个人上下文、短期路线、缓存、预算、幂等及最小报告/确认/审计结构。
- `POST /api/session`、签名 HttpOnly 会话 Cookie、Origin 校验、受控初始化与增量迁移。
- C0 数据集合关闭通用 CMS endpoints，并拒绝原生 CRUD；报告/管理业务命令后续阶段实现。
- 基础仓储入口：`src/server/storage/business-repository.ts`。
- D 端口适配：`src/server/storage/routing-repository.ts`，通过 `src/instrumentation.ts` 的 Node register 安装。
- 开发演示：`/c0-demo`，仅在 development 且 APP_MODE=demo 时可用，生产返回 404。

本阶段没有照片/AI 上传能力，没有报告命令或 P1 管理界面。最小报告/确认模型用于验证快照隔离，不代表完整报告 DTO 已实现。

## D 如何接入

使用现有 RoutingRepository 端口，不建立第二个数据库连接或 ORM。Node 启动自动安装真实 C 仓储；缺数据库、会话密钥或区域时明确失败。

| 能力 | 接口与交接边界 |
| --- | --- |
| 匿名身份 | `resolveSession(request)` 只接受已签名且持久化的 Cookie；无效返回 null，数据库故障抛错。前端先调用 `/api/session`。 |
| 区域/通道 | 读取已受控导入的数据，保留稳定 ID、configVersion、passageVersion；不以内存 fixture 作为生产替代。 |
| 有效快照 | 同一事务快照读取公共发布修订和当前会话的有效个人确认，保留真实状态，几何完整验证复用 D 服务。 |
| 路线引用 | 发布时对区域/会话版本行加共享锁，在同一事务按当前时间复算摘要并比对四项上下文；不匹配返回 null，归属与有效期随引用保存。 |
| 缓存 | D 的完整键包含数据版本和个人命名空间；C 以散列键持久化并执行到期判断，失败不当作空缓存。 |
| 预算/摘要 | 按服务与密钥持久化原子预留；D 适配路径在返回允许前完成启动门禁，网络在事务外。摘要只聚合 D Gate 的真实脱敏事件，避免与预算记录重复计数。 |

C1 的所有有效集修改必须在同一 Payload 事务更新相应 region/session-context 版本行；不能只写报告而跳过版本。这样路线发布的行锁才能保护最终上下文比对。

Vision 也统一经 D ProviderGate 与 C RoutingRepository 记录调用，避免两套统计口径。C 底层 `reserve → markStarted → network → finish` 是独立底层接口；D 已接线的 Gate 不应再额外调用它们导致双计。

## 区域初始化和迁移

使用团队 Node/pnpm 和已提交 lockfile，准备忽略的 `.env.local`，设置 DATABASE_URL、PAYLOAD_SECRET、至少 32 字节的稳定 SESSION_SECRET、APP_BASE_URL、REGION_ID。密钥重启后保持不变。

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm exec tsx scripts/seed-region.ts path/to/reviewed-region.json
pnpm dev --port 3100
```

seed 输入见 `RegionSeedSchema`。同一内容重试保持 ID/版本；不同内容不会覆盖已初始化配置。合法运营修改后续经 P1 配置命令，不能通过重复 seed 替换。

`tests/fixtures/c0-synthetic-region.json` 仅供隔离开发环境演示：区域 c0-synthetic-region，两个虚构通道，isDemo=true，source.kind=synthetic。不是 UNSW 数据。D 的 `d-routing` fixture 和校园候选调查也不能当作已实测数据导入生产。

迁移保留团队初始管理员历史，新增 C0 基础、预算租约及 D 接线迁移。降级会删除对应新表/字段；D 接线降级还会删除旧 enum 无法表示的 call/error 运维事件。执行任何正式降级前先按 D 的恢复说明备份；真实 down/up 验证仅在可丢弃的测试库进行。

## 待交接及外部条件

1. D 提供实测区域和初始通道的 reviewed JSON，才能完成 C0 的真实校园数据接入项。目前工程验证使用合成数据。
2. 地点数据暂未配置，`getPlaces` 明确返回 503，不把未知数据返回为空集成功。
3. ORS/Geocoding 真调用、Zenith 集成及备份恢复由 D 与各包完成；本地成功不计线上通过。
4. GLM/OSS 配置由 Gavin 今晚稍晚提供，随后进入 C1；不因缺少密钥阻塞独立 C0 工程工作。
5. B 后续交付纯展示导出模板及后台组件，C 在 C1/P1 接入。

## 人工演示

访问本地 `http://localhost:3100/c0-demo`，查看持久化通道，初始化/重复会话，尝试非法字段并刷新。无需查库、运行 API 命令或检查权限实现。演示说明明确标注合成数据与开发环境。

本机开发演示已验证：会话初始化/复用 200、非法输入 400、D 的 routing-context 200，应用重启后同一合成区域及通道的 ID/版本保持。浏览器测试没有代替实际目标用户测试。

## Windows 检查差异

最新 dev 中的 `tests/deployment.test.ts` 有四项依赖 Unix bash 或 shell 形式的 fake psql，在本机 Windows 原生运行失败。未修改 D 的测试或部署脚本；本机完整 `pnpm check` 不是全绿。已逐项定位并在 C 验收中记录，D 需在其 Unix/部署环境复核这些平台项。其他静态检查、兼容测试、C0 真实数据库和 HTTP 检查、生产构建均通过。

## C1 接入准备更新

2026-10-17，C0 PR #7 已由 D 合入。C 分支已同步 `origin/dev=d3e06bded36f2ca4cef98cd2a802dc633acf8a01`，旧 C0 结果保留为历史阶段证据。

本次新增图片处理、私有 OSS 配置、GLM 原生图片与工具适配、两份可重跑探针及必要测试。代码证据为 `0a971d4fda31bf00a39695fbd97a69001037dc90`。本地 21 项行为测试、ESLint、全仓 TypeScript 检查和独立审查通过。

OSS 真实对象读写与私有性验证通过，随机测试文件已清理。GLM 三次真实请求未通过，后两次明确返回 HTTP 429、业务码 1305，模型当前繁忙。按用户先验证再推进的要求，C1 报告、个人避让和导出业务仍待开始，Zenith 未验证。重跑方法、D 配置需求与边界见 [C1 供应商交接](c1-provider-checks.md)，实际结果见 [机器可读证据](../acceptance/c1-provider-evidence.json)。
