# D：Zenith 预览失败修复与实际启动

当前：用户已授权上传并启动，源码和26项私有输入已传输。Zenith控制面曾502，已恢复；最终构建缓解仍反复PREVIEW_RETRY，15:48（Sydney）显式停止且确认deleted。没有线上入口，PR #23保持draft，不计为P0/P1部署通过。

日期：2026-10-18。分支`codex/d-backend-routing`，独立D工作目录。

- baseDevCommit：`9891b3ba7a8e6f14fa5cb3b59a34d713f654cfae`，最新fetch后未前移。
- 当前codeEvidenceCommit：`270b220db892ff0faeb2e3b5cdf90f6e4d5d80c9`；后续文档提交不代表另一次镜像构建。
- [PR #23](https://github.com/ZMX8Z/AccessLoop/pull/23)，base=dev，draft；integratedDevCommit：无。
- CLI锁定子提交`56ae499e3d384e814683a7db2fee6ad68a841b92`已先合回D；原子PR #22已改base=dev，不另行向main合并。

## 已定位的原始失败

原预览`01M56FMK83TP7ZMMJBJR6ZFMA4`日志确认：模板`node:22-alpine`解析为Node22.23.3，项目严格要求22.14.0，`pnpm build`以ERR_PNPM_UNSUPPORTED_ENGINE退出。已锁定构建/运行镜像`node:22.14.0-bookworm-slim`与pnpm10.20.0，提前复制严格.npmrc。实际Linux预览现已完成该镜像解析与依赖安装。镜像digest：`sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b`。

## 平台渲染兼容与数据保护

用户明确回复“授权上传并启动预览”后，初始自动审批拒绝不再是阻塞。授权会话`01M56HTPTRY7S9R1Y2VSWKP4RN`接收私有输入后返回COMPOSE_RENDER。以真实模板逐项验证：数据库/持久卷、web健康检查、alias/generate可渲染；input声明和pre_start（数组、字符串）均失败。诊断只渲染，无业务运行。

兼容配置使用CLI单独传输.env.local，容器入口顺序执行受控空库迁移、C仓储初始化及Web。已有库必须匹配完整迁移集，不执行迁移；非空未知库、函数/过程、合法pgcustom用户schema均受保护，不清表、不覆盖管理员或区域。没有增加ORM、连接或业务Collection。

已只读导出474预留、0有效封锁、1687真实脱敏事件，准备通过C原子事务一次性接管；平台尚未运行此恢复。跨v1/v2事件身份不兼容的目标在任何写入前拒绝。源库未改变；该快照不支持两套活跃数据库持续共享同一密钥。所有被替换预览均在业务运行前停止并确认deleted，没有新增供应商调用。

## 实际构建记录

| 阶段 | 证据与结果 |
| --- | --- |
| 产品86a3892 | 本机无env干净生产构建exit0；check270通过/11默认集成跳过 |
| 产品2ec148e | check274通过/12跳过；bootstrap+packaging12/12；真实PostgreSQL schema保护先红后绿1/1，对象在C事务回滚 |
| 2ec平台会话01M56JV8MV4VTSHRF0NZTEGNYF | 15:09–15:12 Sydney，列表/状态/日志及浏览器控制台均502，Cloudflare Host Error，Ray a4c4b0493cbbd367；15:13恢复后继续读取同一会话 |
| 同一2ec会话恢复后 | 三个BuildKit作业vn92c/9n2lf/fmppn先后重试，状态PREVIEW_RETRY；完整日志没有具体编译错误、OOM或退出信号。后来显式停止、确认deleted |
| 49a819f与079e005诊断 | 保留真实退出码/信号的构建wrapper，追加不含环境值的CPU/内存/pressure日志；两个诊断预览均已停止且deleted |
| 产品d55e6db（上一轮） | 显式启用Webpack构建worker、内存优化与单worker；check277通过/12默认跳过/0失败；独立兼容复核无发现 |
| d55默认堆无env干净构建 | exit0，编译26.7秒，总46.30秒；最大驻留内存1737506816字节。本机macOS，不能代替Linux镜像通过 |
| 当前平台会话 | 01M56N0A21JF9QGSS7SG0TZ9ZG；7d6z9/jtsrx两次失败后开始km9ht第三作业，显式停止并确认deleted；没有ready/URL |

Payload自定义webpack会关闭Next默认构建worker，因此显式设置。依据[Next官方内存说明](https://nextjs.org/docs/app/guides/memory-usage)及锁定版本本机实现，三个选项均受支持，不跳过TypeScript或改变业务。构建诊断3/3回归通过，保留失败退出码和SIGTERM，未输出私有环境值。平台未暴露cgroup限额，现有系统内存读数不能证明容器限额或OOM；不把内存假设写成确定根因。

实际上传archive审核：393文件、8434725展开字节、6135426压缩字节；私有/生成文件0。26项私密输入29765字节，由CLI独立传输。聚合证据见[JSON](../deployment/zenith-preview-evidence.json)，不含任何凭据值。

## 最后一次已验证的构建缓解

产品270b220仅在Docker build RUN设置`NODE_OPTIONS=--max-old-space-size=1024`，运行阶段未设置。原依赖方式的无env冷构建exit0，总46.41秒、编译26.9秒，最大驻留内存1519419392字节；该测量源码d55e6db与270b220的应用源码/Next配置相同，差异只有Docker指令及只读诊断。1GiB是每进程V8旧生代配置，不是整个构建RSS上限。当前270b220的check277通过/12默认跳过/0失败，定向诊断+packaging11/11及独立复核通过。Linux日志已确认heapLimitBytes=1124073472，但仍反复构建重试；已停止失败会话，完整平台构建未通过。

512/768MiB堆、禁缓存、外置多个依赖及仅PG外置均在无env临时副本实测失败，未写入应用配置；宽泛外置会导致后台CSS原生加载错误，因此不采用。平台仍没有明确OOM证据。

## 待验与交接

Linux镜像完成、数据库启动/秘密注入、真实HTTPS健康检查、匿名会话写入、管理员登录和恢复后统计仍待验证。已准备针对真实会话的脱敏验收脚本，不用fixture或余额替代真实结果。

平台照片/确认/预算重启持久性、备份恢复、ORS/GLM/OSS/搜索出网及120秒在线演示仍未通过。A的Stitch后续PR #21未包含在此基线上。校园现场、完整P0/P1总验收也未完成；不能据本机构建通过宣称全部完成。

执行说明见[部署操作](../deployment/zenith-preview.md)。本机辅助日志位于/private/tmp：accessloop-zenith-memory-check.log、accessloop-zenith-memory-build.log、accessloop-zenith-memory-up.log、accessloop-zenith-proc-all.log；它们补充但不替代已提交聚合证据。

平台最终构建缓解仍发生PREVIEW_RETRY；需平台提供作业退出原因/事件和实际构建限额，见[可转交的排查材料](../deployment/zenith-build-triage.md)。未确认OOM，不继续采用已失败的降堆/外置方案。

最终只读观察2026-10-18T04:47:52.354Z仍为building/PREVIEW_RETRY，详细错误仅通用消息，完整日志保存后执行down；2026-10-18T04:48:03.987Z确认deleted。没有运行线上HTTP验收、真实供应商调用、预算恢复或照片上传。下一步需平台按会话/作业提供退出码、terminated reason、事件及真实构建限额，恢复后重新核对源账本再启动。
