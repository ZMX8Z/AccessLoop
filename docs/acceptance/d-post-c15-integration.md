# D 后续阶段：C15 接线、地点与业务恢复

日期：2026-10-17；固定分支 codex/d-backend-routing，PR目标dev。此记录的“通过”只指本阶段工程范围，P0/P1及四包总验收仍未完成。

| 字段 | 值 |
| --- | --- |
| baseDevCommit | 6dfd3c559842b462d3139b89628e033995110bde |
| 地点/客户端/公共路由代码 | b9bb61c9f59185783abb4abf1b44d7550c8230d5 |
| 最终产品codeEvidenceCommit | 5b4ba4ced0ee721ab0948f9eaa9c825471209e6e |
| deliveryHead / integratedDevCommit | 本阶段PR元数据；后续仅执行记录提交不改变受检产品代码 |

## Standards

两轮独立只读复核均无剩余阶段准入阻塞。全区域地点使用C唯一缓存及持久poi预算；固定HTTPS、无客户端代理、Overpass无ORS凭据。响应1MiB/8秒上限，门禁按声明单次超时判断15秒剩余窗口。模块无额外数据库连接。源截断经过过滤/去重/缓存后保留；独立定向复验25/25通过。

## Spec

独立只读复核符合地点来源、区域/数量/unknown、失败不假成功、缓存隔离及预算要求。最初源截断丢失问题在提交b9之前已修复并加回归；新增Overpass超时对齐回归先RED后GREEN。C正式公私Schema被A地图消费，私人DTO完整验证后仅留下地图字段。真实供应商失败明确保留，未把适配器单测计为真实地点能力通过。该轴最终25/25与Standards重叠，不相加。

## 固定代码实际检查

- pnpm check：exit0，202项中191通过、0失败、11项集成按默认配置跳过；lint与typecheck通过。
- pnpm build：exit0；同一应用现有/api、/cms-api、/admin、/live及设计演示均保留。pnpm start通过生产配置门禁，本机health为200；首页按既有Design Demo跳转后200，未将此记为公众真实闭环。
- 新跨包public-routing.integration：独立_test PostgreSQL执行1/1通过、0跳过。真实C命令/事务/预算/缓存/routeRef及A routeOutdated；ORS是确定性桩，照片是合成元数据。覆盖个人仅作者生效、核实/重新核实两会话、共享公共几何各自routeRef、真实personalVersion、自然过期同版本不同activeDigest、解除/重开不复活旧确认。只清理该回归拥有的记录。
- C15交付头的独立固定验收、74项实库回归、生产Admin HTTP、真实OSS+C1 HTTP及开发库升级见[C15集成](c15-integration.md)。本轮后续D改动不修改C数据/迁移/命令，复用其未受影响证据。

## 真实连接与恢复

[地点连接证据](../deployment/poi-connection-evidence.json)：HeiGIT单次HTTP200返回非法JSON NaN，严格拒绝；Overpass单次HTTP406明确不可用。两次均经过C持久原子预算，未发送其他模型/路线请求，没有生产种子或空成功。未观察到真实成功缓存命中，缓存语义由确定性回归验证；地点实时能力仍阻塞。

[业务恢复](../deployment/business-recovery-evidence.json)：C15生产bundle本机上传一张生成图片、创建/预览/确认合成报告，备份后重启，数据/图像哈希/原会话归属/预算保留；恢复到独立空库后原Cookie可读且另一会话拒绝；自然到期后摘要变化，重启不复活。真实既有4条预算预留/6条事件、1管理员/5迁移保留。末次汇总断言误比较滚动时间窗而退出1，此失败已保留；随后按同一原窗口独立复核计数一致，没有重做图片/供应商调用。测试记录、OSS对象与恢复库已按归属清理。

这只验证数据库恢复及原OSS对象仍在时的授权读取，未验证OSS对象独立备份/删除后回填。私有测试归档不是可复用生产照片备份，不能拿它作线上可恢复版本；完整操作边界见[恢复手册](../deployment/recovery-runbook.md)。

## PR状态与剩余工作

C PR #15已合入dev 6dfd3c559842b462d3139b89628e033995110bde。B PR #8已从main改为dev，但旧head的假成功/共享Schema冲突未解除；修复已在B独立固定分支推进，不能将C15适配其后台版式算成B整包通过。

D上一阶段PR #14集成SHA为1d2cd2b9b3420a9b0c072a3b54ec258839a95b19。本阶段同步base如上；最终head与平台集成SHA在PR锁定，合后复验受影响场景。

P0、P1、整包：未完成。继续项为B真实公众流程和浏览器联调；外部条件为GLM429/1305、地点源可用性、实测校园路线与Zenith项目/真实模板。线上入口/二维码无可交付地址；约120秒稿仍待A/B真实彩排。没有用fixture、历史录像或人工降级代替实时通过。

## 合入及配套对象恢复跟进

本阶段实际PR为[#16](https://github.com/ZMX8Z/AccessLoop/pull/16)，deliveryHead=c5b1bdce3655649bcc5d9683a9e60bc7f26ce857，integratedDevCommit=0da6e8fa9cb473c10cc359d5316e57f4f2aacafb；完整树与交付head一致。D同步后定向地点/客户端36/36通过，0跳过，未重复供应商请求。

随后同一产品/集成树的[单对象配套恢复](../deployment/object-recovery-evidence.json)已一次exit0：13检查及5清理通过。独立私有副本在原对象删除前核对hash，原对象404后回填；配套空库+原Cookie报告/照片/确认、第二会话404、过期不复活、既有6预算/10事件保持。此项补上前次业务恢复未覆盖的对象回填，前次失败/边界记录保留；只覆盖本机新生成合成样本，不是Zenith或全库生产恢复点。未改变产品代码/迁移/依赖，复用同树构建。

配套对象演练的摘要复核范围：源/恢复库比较预算、事件、管理员和迁移计数；相同24h窗口聚合只在源库复核，恢复库未单独查询该聚合。
