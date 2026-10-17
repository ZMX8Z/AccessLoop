# C0 与 D 的集成验收

日期：2026-10-17。执行：D；C0 仅为工程基础，不是 C 整包通过。

| 固定项 | 值 |
| --- | --- |
| baseDevCommit | `7d0f552f9b99472c8a61ee7038f28a2539d45abe` |
| C deliveryHead | `8c8526cdfb6bbab078b10ac08b0d02b51d465b75` |
| codeEvidenceCommit | `d424b3e910fd71fdb6b3e2302a8b4dc69688c645`；到 deliveryHead 仅两份文档变化 |
| 阶段 PR | [#7](https://github.com/ZMX8Z/AccessLoop/pull/7)，已由 D 经平台 merge commit 合入 dev |
| integratedDevCommit | `5e4867d8b6141aacbc8fc4988f4aa41287bd370a` |
| 运行环境 | macOS / Node22.14.0 / pnpm10.20.0 / PostgreSQL17.6 |

## 技术证据

- 从固定 C head 导出隔离源码快照；使用现有锁定依赖和独立测试库，不切换 dev 或 C 分支，不改 C 产品代码。四个迁移实际成功，保留初始管理员迁移历史。
- 两个独立只读 agent 分别核查原子预算/快照/routeRef 和会话/权限/迁移/挂载，未发现阻止 C0 工程阶段合入的实质缺陷。
- `pnpm lint`、`pnpm typecheck` 均 exit0；`pnpm build` exit0（Webpack 报 compiled with warnings，未构成构建失败），包含 session、D 六接口、admin、CMS 与 c0-demo。
- `node --env-file=.env.c0-test --import tsx --test --test-force-exit tests/*.test.ts`：121通过、0失败、1跳过。包含 C 两份真实数据库测试；C Windows 上未通过的四项 Unix 脚本用例在本次全部通过。HTTP 场景单独执行。
- 使用生产构建的 Next 进程，在独立测试库导入明确 synthetic/isDemo 的区域后，真实 HTTP 综合场景1/1通过：session初始化/复用/双会话、坏Origin/输入、禁用CMS/首注册、region/passages/context。仅用于隔离接线，直接启动 Next 不等于通过缺OSS的正式 prestart 门禁。
- 首次 HTTP 得到503；定位为既有本地 SESSION_SECRET 不满足 C 的至少32字节要求。仅更新忽略的本地应用会话秘密后复验通过，未改管理员密码或供应商密钥。此失败没有算作首次通过。
- 平台合并后 `git diff C-deliveryHead integratedDevCommit -- .` 无差异，构建和真实DB/HTTP证据适用于同一集成树。D固定分支及dev集成目录均安全同步到该提交，main未操作。
- D 工作树新增校园离线交接后 `pnpm check` exit0：108通过、0失败、3默认跳过；真实DB和HTTP已在同一运行代码树单独完成，默认跳过项未冒充再次运行。

审查测试库、临时源码快照及其私有环境文件已清理。本机开发库在迁移前另作0600私有备份，再应用三个C0增量；保留现有管理员，未把 synthetic 或未实测校园候选导入开发业务区域。

## 真实供应商与重启跟进

[供应商连接证据](../deployment/provider-connection-evidence.json)对应同一集成服务代码：经 D ProviderGate 和 C 持久原子仓储，ORS 一次HTTP200得到5顶点LineString/56.8m，候选边界/吸附检查通过；Geocoding一次HTTP200得到5条区域内OSM结果。二者均为固定公开校园连接核验，不代表 `/api/routes`、`/api/search` 与公众UI闭环通过。

首次本地探针漏传必填 profile，在真正ORS HTTP前被拒绝；旧记录保留且明确标出0次HTTP，不能把其 call/error 事件冒充真实上游调用。修正后只重试ORS，没有重复Geocoding查询。

只重启已核对的专用本机PG：管理员1、迁移4、预算预留3和事件4条均原样保留。3条预留包含上述本地无HTTP失败，因此不能将预算条数直接当作真实调用数。未验证照片/个人确认的业务恢复，也未验证Zenith。

## 阶段结论与后续

C0工程基础已通过并进入dev；C仓储、匿名会话、持久预算与D接线的“未交付”阻塞已解除。仍缺已现场核实的区域/通道、places持久数据、C1照片/AI/报告/确认、C后续管理命令和A/B真实界面接入。Vision未调用，独立预算策略待C1；OSS和Zenith仍缺配置/项目条件。P0/P1整包未通过。
