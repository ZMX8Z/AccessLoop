# D 集成跟进：C1 准备与 A0 修复

日期：2026-10-17。本记录只覆盖明确阶段，未完成四包 P0/P1 总验收。

## C1 准备阶段 PR #13

- PR：[C provider/photo preparation](https://github.com/ZMX8Z/AccessLoop/pull/13)。baseDevCommit=`7d57441d624f8630be68d623463a7c4766bb62ed`；deliveryHead=`8c5be3dd96e3e802d1cd845778361a7671126700`；integratedDevCommit=`9997880921d65739d9efd3bfc3bd507385e57d58`。
- 固定 head 在隔离目录 `pnpm check`：129 通过、0 失败、3 项集成测试跳过。集成树与受检 head 完全一致。新增图片解码/EXIF、OSS选项、GLM工具Schema和探针，不含正式照片/报告API、Payload配置或迁移变化。
- 独立 Standards/Spec 复核允许按准备阶段合入；指出明确403配额码、无效200输出漏计错误两项，在 D 后续硬化中修复。

## D 供应商硬化与真实记录

- baseDevCommit=`9997880921d65739d9efd3bfc3bd507385e57d58`；codeEvidenceCommit=`7a5697f10e2c0c354c0b7c3b7a1901e9afd514ee`。
- `pnpm check`：134 通过、0 失败、3 项集成测试跳过。独立只读复核 budget/vision 25/25 通过，无合入阻塞。
- 明确配额业务码的403/429先识别；其他鉴权失败保持不可用且不重试。Gate可将已完成但无效的模型结果计一次错误并保留人工降级，合法uncertain不计错；正式C分析服务须按交接传分类器。
- 单次真实GLM探针：通过C持久预算，合成图片，HTTP请求上限1；仅进程日上限1、环境文件不变。2032ms后上游429/1305，实时模型能力未通过。
- 持久库核对：Vision预留1、call1、error1；真实最近24h摘要已生成，见[脱敏JSON](../deployment/vision-connection-evidence.json)。ORS摘要包含先前本地输入错误，未把它冒充真实上游请求。
- 独立D构建曾开始，随后主动退出130，改由A合入后的统一集成树执行最终构建；不计为通过或产品缺陷。
