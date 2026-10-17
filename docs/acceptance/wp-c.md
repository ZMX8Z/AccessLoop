# C 技术验收：C0 工程基础与 D 接线

日期：2026-10-17，Australia/Sydney。仅验收本次声明的工程阶段，未把合成数据或测试替身计作真实校园/外部服务成果。

| 字段 | 值 |
| --- | --- |
| branch | codex/c-backend-data-ai |
| baseDevCommit | 7d0f552f9b99472c8a61ee7038f28a2539d45abe |
| headCommit / codeEvidenceCommit | d424b3e910fd71fdb6b3e2302a8b4dc69688c645 |
| 早期 C0 提交 | 9383630；随后合并最新 dev 并对受影响代码复验 |
| 环境 | Windows，Node 22.14.0，pnpm 10.20.0，Payload 3.91.0，本机 PostgreSQL 17.10 |
| 数据库 | C0 独立开发库 accessloop_c0_dev 与可丢弃测试库 accessloop_c0_test；未对旧项目库执行迁移 |
| 本地入口 | http://localhost:3100/c0-demo；只在 development 且 APP_MODE=demo 启用 |
| PR / 集成状态 | [草稿 PR #7](https://github.com/ZMX8Z/AccessLoop/pull/7)，base=dev；尚未由 D 合入，不声称 Zenith 验证 |

## 实际检查与结果

| 检查 | 结果 | 范围与证据 |
| --- | --- | --- |
| pnpm install --frozen-lockfile | 通过 | 使用 dev 已提交的依赖与 lockfile，未自行更改依赖版本 |
| pnpm lint、pnpm typecheck | 通过 | ESLint、Next 路由类型、TypeScript exit 0 |
| pnpm build | 通过 | 最新 C/D 集成树 Webpack exit 0，包含 D 六接口及 C session/c0-demo；未将构建计作外部能力通过 |
| 本机完整 pnpm check | 未通过 | 99 通过、4 失败、3 跳过；四项 D Unix 专用测试见下一节 |
| 明确排除四个平台项的本机测试 | 通过 | 99 通过、3 跳过、0 失败；被排除项未计作通过，三个跳过的 HTTP/DB 测试另行显式执行 |
| 两份真实数据库集成测试 | 通过 | 18/18，0 跳过，exit 0；真实连接独立测试库，覆盖 10 个基础子场景与 6 个 D 接线子场景，另有两个父测试 |
| 真实 HTTP 集成 | 通过 | 1 个综合场景 exit 0，执行真实 dev server：session 初始化/复用/双会话凭据/非法来源/非法字段/方法错误、CMS 禁用、首注册关闭、region/passages/context 接通 |
| 真实迁移 up/down/up | 通过 | 初始 C0 两个批次真实撤销后重新升级；D 接线增量再次单独 down/up，随后 18 项 DB 测试通过。仅操作测试库 |
| 种子首次导入与重复 | 通过 | 真实数据库首次 created、同内容 unchanged，稳定 ID/版本；不同内容替换被拒绝 |
| 独立只读代码审查 | 通过 | 修复迁移外键顺序、陈旧预留、D fingerprint 格式不兼容后复核，无剩余 C0 工程阻塞；未冒充独立供应商或用户验证 |
| 浏览器与应用重启 | 通过 | 真实按钮得到 200/400，routing-context 得到 200；停止并重启应用后，通道 ID/版本保持。匿名凭据复用另由 HTTP 场景验证 |
| Git 暂存秘密检查 | 通过 | 暂存内容不含本地 DATABASE_URL、PAYLOAD_SECRET、SESSION_SECRET、管理员密码；环境文件保持忽略 |

先前沙箱内构建因目录 mkdir EPERM 失败，允许项目构建写入后同一源码构建成功；该环境失败不记录为通过。初次 HTTP 测试预期 CMS 404，但锁定 Payload 在 endpoints:false 时返回 501，已核对为明确禁用，测试接受受控拒绝状态，不要求框架采用另一种状态。

## 可复现命令

普通静态检查：

```sh
pnpm lint
pnpm typecheck
pnpm build
```

Windows 上明确排除已知 Unix 专用项，其他测试仍执行：

```sh
pnpm exec tsx --test --test-skip-pattern='backup refuses|restore requires|restore rejects|database connection options are translated' tests/*.test.ts
```

`tests/deployment.test.ts` 的四项平台限制：

1. `backup refuses missing source configuration without exposing environment values`：bash 启动/脚本路径在 Windows 返回 127，而非脚本预期的 2。
2. `restore requires an explicit separate empty target before opening a connection`：同上。
3. `restore rejects mismatched archive checksums before touching a database`：同上。
4. `database connection options are translated to libpq variables rather than a URI database name`：使用无 Windows 扩展名的 Unix shell fake psql，Windows 原生 spawn 无法按该形式执行。

这些失败是本机限制，不是已通过的测试；D 基线的 macOS 记录可供对照，但没有据此声称 C 集成提交在 Unix 上已复跑。

真实 DB，必须使用独立测试数据库并先应用迁移。仓库不提供秘密示例文件：

```sh
node --env-file=.env.c0-test --import tsx --test --test-force-exit tests/storage.integration.test.ts tests/storage-routing.integration.test.ts
```

`--test-force-exit` 使用 Node 22 官方测试 runner 功能，在测试完成后退出；Payload destroy 后部分依赖仍保留句柄。测试断言及 finally 中的写入/清理均已等待完成，不以提前终止进程代替断言结果。

真实 HTTP，先启动本地开发服务器，PowerShell 中执行：

```powershell
$env:ACCESSLOOP_HTTP_TESTS = '1'
node --env-file=.env.local --import tsx --test --test-force-exit tests/c0-http.integration.test.ts
```

## 关键行为证据

- 8 个并发预算请求在限额 3 下恰好 3 个通过。过期预留不能开始；延迟开始会继续占用实际调用窗口；预留后新增服务封禁仍能阻止开始。
- D 真实 ORS/Geocoding adapter 生成的 `sha256:<64hex>` 指纹可用于 C 预算预留和封禁；存储层严格归一为 64hex，不存原始密钥。
- D Gate 的 call/wait/error/cacheHit 统计来自实际脱敏事件；预留本身不冒充真实调用，不重复统计等待。
- 幂等同键同内容仅执行一次，不同内容冲突；业务版本与审计在失败时共同回滚。
- routeRef 仅归当前会话/区域，过期拒绝；发布时对四项上下文、并发版本变化和自然过期进行真实数据库验证。
- 公共发布快照不混入作者私有 rowVersion；有效集读取排除他人、已过期、版本不匹配和 resolved/rejected 的个人确认。
- 缓存按 D 完整命名空间持久化，过期读取拒绝。数据集合没有开放通用 CMS CRUD。

## 阶段结果与明确缺项

- C0 工程基础及 D 端口接线：通过本次声明范围的技术检查和独立代码审查。
- 完整 C0 的 UNSW 实测区域/初始通道接入：外部条件阻塞，等待 D 的已核实数据；目前只有合成演示与候选调查，不能替代实测。
- P0 完整闭环：待 C1 交付；照片/真实 GLM/报告业务和前端闭环未实现。
- P1：待 C2/C3 交付；正式管理/配置界面未完成。
- C 整包与 Zenith 集成：待执行，不作通过结论。

本阶段已经提供人工页面入口，人工只需点击检查。数据库服务恢复/备份、真实 ORS/Geocoding/POI、GLM、OSS、目标区域通行及完整无障碍用户测试均未被本记录宣布通过。

交付时运行代码已提交并推送，后续文档记录提交不改变上述代码证据。开发服务运行期间 Next 自动把 next-env.d.ts 的类型路径切到 .next/dev/types，该本地生成差异未作为业务变更推送。

## C1 接入准备验证，2026-10-17

- baseDevCommit：`d3e06bded36f2ca4cef98cd2a802dc633acf8a01`。C0 PR #7 已由 D 合入，本分支已同步。
- codeEvidenceCommit：`0a971d4fda31bf00a39695fbd97a69001037dc90`。
- 新增图片与视觉行为测试 21/21 通过，无跳过；新增八文件 ESLint 与全仓 `pnpm exec tsc --noEmit --incremental false` 通过。独立审查发现的全空白模型文本问题已修复并复核。
- OSS 真实上传 200、授权读与散列核对 200、匿名读拒绝 403、签名读与散列核对 200、删除 204 及不存在确认均通过。该验证只覆盖对象与 SDK 配置，未验证完整应用照片权限流程或 Bucket ACL。
- GLM 共三次真实图片请求，未收到合法工具结果。后两次为 HTTP 429、业务码 1305；供应商模型繁忙，真实视觉能力为外部条件阻塞。数据库脱敏事件为三条 call、三条 error，没有额外上游请求。
- `VISION_DAILY_BUDGET=unlimited` 实现用户“不限制”应用每日次数的选择，仍保留分钟门禁、供应商配额和单次超时。
- 本阶段没有安装照片 Collection、修改 Payload 配置或新增业务 HTTP 接口，没有迁移、生产构建或 Zenith 验证。C1/P0 业务和 C2/C3/P1 仍待交付，不宣布整包通过。

详细命令和恢复条件见 [C1 交接](../handoffs/c1-provider-checks.md)，原始安全标量见 [验证证据](c1-provider-evidence.json)。
