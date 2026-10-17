# C 交接：C0 数据与会话基础

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
