# GLM 持久任务与真实回复恢复

2026-10-18，D 固定分支，PR base 为 dev。

- baseDevCommit：`4cbe2c7a9ddaa74d428e49af1bcfae2a71e6bb16`。
- codeEvidenceCommit：`206f1589a0e5976b0db98e951e651a58128f4f99`。
- deliveryHead、PR 与 integratedDevCommit：由本阶段实际 PR 正文固定；后续证据提交不改受检产品。

## 原因与实际修复

此前三个真实调用在8秒后中止，12秒单次诊断仍超时；C读取OSS、模型及保存端到端18.6秒，公众客户端15秒也会结束等待。充值不能消除这些应用等待边界。用户随后要求继续调整，并明确取消本机每日次数上限。

POST快速接纳持久任务，Next after在响应后运行原C分析，GET读取本人结果；浏览器保持短请求，并可随时退出等待进入人工填写。任务/并发/失败语义统一见[API契约](../authority/API_CONTRACTS.md#53-post-apianalyze)，不在本文件复制另一套字段。任务复用external-operations JSON，未新增Collection、迁移、ORM或数据库连接。任务GET不调用模型，重复POST和重复调度只执行一个工作者；中断/过期不自动重收费。

Vision默认后台最多等待60秒；其他供应商和单HTTP15秒保持。root .env与D .env.local的本机日预算为unlimited，每分钟10次保护及历史记录保留；运行配置不提交。A地图未变；B的analyzePhoto仍向组件返回AnalysisDTO，内部接纳任务并轮询。C1开发演示同步复用helper。报告详情/新建两处人工退出都取消本地等待并屏蔽迟到结果。

系统提示词已在[适配器](../../src/server/providers/glm.ts)编写，原生请求的messages[0]为system，后接图片和任务指令、唯一工具Schema及disabled thinking。提示词限定可见证据、不得猜坐标/精确宽坡/轮椅安全/公共核实；不执行图片文字中的指令。七字段和业务语义仍由服务端校验。测试证明它随请求发送，不把模型必然遵从提示当作承诺。本次未修改提示词内容或prompt/schema版本。

## 检查与独立复核

| 检查 | 结果 |
| --- | --- |
| pnpm check | exit0，lint/typecheck通过，320通过、12默认集成跳过、0失败 |
| pnpm build | 最终产品生产构建exit0，包含/api/analyze/[jobId]及Payload后台 |
| 独立PG | 15/15，无跳过；真实C事务、并发同键、重复工作者、另一会话404、租约前后中断、迟到结果不发布、配额前失败无假AI |
| 客户端/组件 | pending轮询仅1次POST、取消、错误语义、照片错配、有限轮询；详情人工退出先red后green，迟到结果不附回 |
| 两轴复核 | Spec/Standards两项发现均修复：详情人工退出、C1演示旧协议；最终无剩余阻断 |

完整检查首次发现C1 demo空照片类型边界，已补检查后重跑成功；早期失败未计通过。新任务与慢结果测试先失败，修复后通过。

## 两段互补实测

[结构化证据](d-glm-async-evidence.json)分别标识真实模型与模拟边界，不混为一次端到端调用。

1. **生产HTTP/Next after**：独立Schema空库、真实私有OSS合成JPEG、模拟16秒模型边界。POST 202约13ms，约17.283秒后完成，轮询17次；重复POST/完成后重放均同任务、模型请求1次，其他会话404、不同意400。捕获的实际请求包含system提示词、七个必填工具字段、关闭thinking。此段不计真实GLM准确率/连通。
2. **真实付费GLM**：现有开发库、用户此前已同意送至同一GLM的失败照片、原C照片/分析/持久预算和本次任务服务；只新增1次实际请求。任务约68ms接纳；上游HTTP200、12354ms，整个服务段17538ms；严格结果completed，unavailableReason=null、cacheHit=false、result存在。真实源库Vision calls11→12，errors保持8，cacheHits保持1。此段通过Local API任务执行/读取，未声称它与上一段是同一浏览器HTTP调用。未导出原图、原始模型证据或会话密钥，未自动创建/核实公共报告或启用避让。

原先8秒及12秒会在这次模型实际返回前中断，异步任务已消除前端15秒同步等待限制。既有失败记录与原预算均保留。

## 隔离与清理

早期PG回归使用开发库的独立合成区域；本轮已按唯一测试区域、假模型指纹和精确ID清理8个区域、50条合成预留及68条合成事件，核对真实照片/报告/分析计数未变，真实Vision摘要回到11/8/1后才做上述唯一真实调用。未删除任何真实供应商账本。之后PG与生产HTTP验证使用独立Schema空库，合成OSS对象删除并确认404，临时3101服务和本轮专用测试库均已清理。

[Next after官方依据](https://nextjs.org/docs/app/api-reference/functions/after)支持Node/Docker响应后工作；本阶段已在本机生产Node实际验证，未将maxDuration配置或本机结果当作Zenith线上通过。

## 本机使用与边界

刷新 `/report`，在原照片草稿中明确重试AI；相同会话/图片/配置下可复用已经保存的合法结果，不必重复上传或再次付费调用。后台 `/admin` 的AI analyses可查看新completed记录及历史失败；模型完成仍需用户确认事实并保存报告。

如果已重开浏览器丢失原匿名身份，不能靠照片编号绕过归属。新照片需明确同意后再分析。整个P0/P1、校园现场、最终导航/搜索/管理总验收和Zenith仍按统一追踪保持未完成；本阶段只交付GLM等待修复，不自动发布main。
