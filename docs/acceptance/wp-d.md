# D 技术验收：服务基础阶段（P0/P1）

日期：2026-10-17。固定分支：`codex/d-backend-routing`。

| 字段 | 值 |
| --- | --- |
| baseDevCommit | `1ad24d707370a80fb0dc11da20b7e55be6d310c7` |
| headCommit / codeEvidenceCommit | `11b70ec667b09dee261d25f1889a9876ab3395cc` |
| stage | D地理/路由/预算/搜索/摘要/部署准备基础；非完整P0/P1 |
| PR / deliveryHead / integratedDevCommit | 待发布后追加 |
| runtime | Node22.14.0 / pnpm10.20.0 / 本地PG17.6 |

## 执行结果

| 命令/场景 | 结果 | 证据范围 |
| --- | --- | --- |
| `pnpm check` | 通过，exit0 | ESLint、Next路由类型、TS、93/93测试 |
| `pnpm build` | 通过，exit0 | 单应用生产Webpack，D六接口/admin/cms-api/health |
| 地理19项 | 通过（合成数据） | 缓冲、洞、自交、顶点/面积/障碍上限、端点/吸附/相交、配置冲突 |
| ORS/Pelias适配14项 | 通过（fetch桩） | 固定域、限制与避让、来源/bbox、数量、稳定ID及错误映射 |
| 预算/路由必要19项独立复核 | 通过（仓储/时钟桩） | 持久预留边界、有限重试、缓存/个人隔离、自然过期、两轮stale、去重填缓存空窗、共同deadline、等待者独立超时、迟到统计不得新发请求 |
| 实际挂载处理器 | 通过（未装仓储时） | 503安全错误包络、fresh requestId、private/no-store；health保持200；405可控 |
| 搜索/地点/usage | 通过（仓储/供应商桩） | 空结果与失败、区域/数量、配置变化失效、unknown标签、真实事件聚合语义 |
| `bash -n scripts/backup-restore.sh` | 通过 | 单独脚本语法及10项部署脚本用例 |
| 隔离本地PG备份恢复 | 通过（真实PG） | [JSON](../deployment/local-recovery-evidence.json)；迁移8表、备份、重启、空库恢复及拒绝非空覆盖；合成sentinel不等于业务记录 |
| 用户本地配置探针 | 部分通过/阻塞 | ORS/GLM仅TLS通过；先前模板DB连接失败，现按用户授权配置专用本机PG；OSS缺失；Vision待同步 |
| 真实ORS/Geocoding/GLM、OSS、Zenith | 未验证/外部条件阻塞 | 未绕过C持久预算直接调用；无真实部署/线上二维码 |
| A/B/C集成与管理正式挂载 | 未通过（依赖未交付） | 当前远端无对应分支/可合入PR；未声称四包已合入 |

## 独立审查

只读reviewer依据authority及当前工作树检查，定位的四类实质边界已各自RED→GREEN修复。最终19项必要回归通过并同意合入“D服务基础阶段”；不覆盖真实数据库事务、供应商权限、线上流程或人工验收。

## 阶段判定

- 本阶段D独立服务/部署准备：通过。
- P0：外部条件/跨包依赖阻塞，未完成真实个人绕行闭环。
- P1：外部条件/跨包依赖阻塞，未完成真实搜索及公共管理闭环。
- 整包/全项目/人工验收：未完成。

运行代码、依赖、迁移变化须复验受影响项；后续纯执行记录提交可复用本次代码证据。骨架历史证据见git历史中的本文件与PR#1；本次不重复真实外部调用。
