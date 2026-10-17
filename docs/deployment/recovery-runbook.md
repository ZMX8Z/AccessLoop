# 最小备份、重启与恢复流程

部署原则与完整验收口径引用 [技术文档第 11 节](../authority/AccessLoop_技术文档_v1.0.md#11-配置与-zenith-部署)、[统一验收规则](../authority/ACCEPTANCE.md)，本文只记录可执行步骤。实际本地演练见 [证据](local-recovery-evidence.json)；Zenith 与 OSS 的真实业务恢复尚未执行。

## 数据库备份与独立空库恢复

准备匹配服务端版本的 PostgreSQL CLI、Node、bash、shasum。脚本从当前进程读取环境变量，不自行 source 环境文件。由部署秘密注入提供 DATABASE_URL；备份路径放在仓库以外的受控位置。

```sh
bash scripts/backup-restore.sh backup /absolute/private/path/accessloop.dump
```

脚本生成 custom-format archive 及 `.sha256` 文件，权限均为 0600，拒绝覆盖既有文件；只输出固定状态和摘要。SHA-256 验证完整性，存储加密和访问控制由备份目标承担。该备份包含整个数据库的私人数据，不能提交到仓库或上传公开附件。

创建新的隔离空数据库，通过秘密注入设置 RESTORE_DATABASE_URL，并设置 RESTORE_CONFIRM=isolated-empty-database，然后执行：

```sh
bash scripts/backup-restore.sh restore /absolute/private/path/accessloop.dump
```

恢复前检查摘要、源/目标字符串不同和目标中无用户表/视图/序列；不执行 drop、clean 或 create database。`pg_restore --single-transaction --exit-on-error --no-owner --no-privileges` 在失败时回滚这次恢复，新库登录角色成为对象所有者。运维角色/授权在恢复后按部署角色重新配置，不宣称还原集群级角色与 ACL。目标库在恢复期间不能有其他写入者。

URI 支持 postgres/postgresql；常用 SSL 参数映射到对应 libpq 环境变量，未支持的查询参数明确拒绝。连接超时固定 5 秒；长备份/恢复本身时限由受控发布作业设置。工具错误正文不写入共享日志；连接失败应检查部署秘密和网络条件。

[PostgreSQL 17 pg_dump 文档](https://www.postgresql.org/docs/17/app-pgdump.html)说明单库一致快照、自定义格式及集群级对象边界；[pg_restore 文档](https://www.postgresql.org/docs/17/app-pgrestore.html)说明恢复选项与事务行为。只恢复本实例可信备份，archive 内的数据库代码也会在目标执行。

## 与 OSS 配套的真实恢复检查

数据库 archive 不包含 OSS 图片。真实演练需由 C 的统一存储接口/受控 OSS 工具完成：

1. 暂停业务写入，记录集成提交、镜像、迁移状态和备份时间；确认会话及 Payload 秘密由秘密管理保留。生成数据库备份，并将其引用的处理后私有对象复制到受保护的独立备份前缀或版本快照。
2. 只记录对象数量、内容校验结果和恢复时间，不把私人对象键/临时签名 URL 写入公共证据。确保数据库和对象备份对应同一冻结点。
3. 向独立空库恢复，再恢复引用的私有对象。启动相同已知可用应用版本，使用匹配的稳定会话/Payload 秘密和隔离资源；不能把恢复实例接到原实例的可变演示数据上。
4. 从恢复实例验证：原作者能读处理后照片/报告/确认；另一会话不能读私人记录或照片；到期避让不进有效集；预算用量不因应用重启或恢复过程归零；公共有效集及权限保持一致。
5. 核对报告/图片/预算等真实业务结果后记录通过，再恢复写入。仅数据库 sentinel 保留不能代替以上业务验证。

## 应用重启证据

在同一浏览器保留匿名会话，记录一个真实报告的可读状态、已确认避让、routing-context、授权照片和分服务预算摘要。另准备一个已到期案例。只重启应用容器，不更换 SESSION_SECRET/PAYLOAD_SECRET，不重置数据/迁移。

重启后用原会话重新读取并计算路线；确认照片/报告/个人确认仍在，过期避让未复活，另一会话仍隔离，预算门禁使用已存用量。记录集成 SHA、重启时段、检查结果、脱敏 requestId 与技术证据。对象存储/数据库进程单独重启后的检查按平台资源能力另记录。

## 可用版本恢复

发布前保留上一个已通过核心闭环的 commit/镜像 digest、对应 lockfile、迁移状态、配置版本和配套备份时间。常规应用回退先确认旧版本兼容当前向前迁移的数据库，再在平台切回已知可用镜像并验证 health 和核心只读权限。

若旧版本与当前数据结构不兼容，保留原数据，使用上面的独立空库与配套 OSS 备份恢复验证；验证通过后通过受控配置切换资源。数据库不做未经验证的 down migration，不通过删真实数据实现回退。切换前记录该恢复点之后数据的处理决定及预期影响。
