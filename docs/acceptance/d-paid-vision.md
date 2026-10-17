# 付费 GLM-4.6V 切换验收（2026-10-18）

用户指定按其提供的GLM-4.6V文档切换付费高性能版，模型ID为`glm-4.6v`。本阶段仅替换模型默认值与配置，不修改HTTP字段、七字段结果校验、授权、预算策略或数据库结构。

| 字段 | 值 |
| --- | --- |
| baseDevCommit | `7da9f32fe62b2916de038b949db3a28f5a351af2` |
| codeEvidenceCommit | `f7357ac14d7123e3ff394e4073d269d07365580f` |
| branch / target | `codex/d-backend-routing` / `dev` |
| deliveryHead / integratedDevCommit | 本阶段PR最终元数据固定；后续仅文档提交不改受检产品 |

## 实现与一致性

`DEFAULT_VISION_MODEL`统一供适配器、C照片/分析/管理运行入口和有界探针使用。环境示例、当前fixture/调用方、PROJECT/API/需求/技术文档同步。两份既有本地服务端环境仅修改VISION_MODEL，实际密钥、10次/日与10次/分钟预算保持；文件0600且不提交。历史Flash分析仍是合法旧DTO；旧探针JSON未重写。新模型参与缓存身份与分析元数据，同一API key的持久预算身份保持，不因换模型清零。

## Standards

独立只读复审固定产品头未发现可行动的规范违规或启发式问题，复跑vision 19/19、0跳过。统一默认常量、仓储预算与历史证据边界符合authority。

## Spec

独立只读复审未发现缺失、越界或实现错误，确认选择`glm-4.6v`、保留原生图片/唯一工具/严格七字段/同意与本人照片权限。独立vision 19/19与Standards是同一套测试，不相加。模型缓存隔离、同密钥预算保持符合请求。

## 检查与生产运行

- RED：先将真实请求边界期望切成付费模型，观察2项失败（17通过）。GREEN：最小实现后vision 19/19通过；新增回归同时确认旧/新模型缓存身份不同但keyFingerprint相同。
- 全量`pnpm check`：220 pass、0 fail、11条件集成跳过，exit0；lint、typecheck通过。日志`/private/tmp/accessloop-paid-model-check.log`。首次check曾被ignored .local旧恢复验证器的一处显式any挡住，只修该验证器类型后重跑通过，没有改变恢复业务。
- `pnpm build`：exit0；日志`/private/tmp/accessloop-paid-model-build.log`。新产物已恢复本机3000服务，health、/reports/new、/admin/login均200，匿名usage-summary为401；只读检查未触发供应商。后续文档提交不重复同树构建。

## 真实调用与充值恢复

[脱敏证据](../deployment/paid-vision-evidence.json)保留按顺序的三次实际模型请求：

1. 首次付费连通探针仅1次，429/1113、1493ms。智谱[官方错误码](https://docs.bigmodel.cn/cn/api/api-code)定义1113为账户欠费；没有误认作旧1305上游忙或自动反复重试。
2. 用户明确回复已经充值后，通过C原有事务只移除当前key的Vision上游quota封锁；原3条预留及全部事件保留。随后1次有界连通探针成功，5121ms，completed、合法工具结果。
3. 同一产品的生产HTTP私有照片业务，用独立临时合成区域和生成几何图片、真实OSS、真实C身份/上传/分析服务，completed、7508ms。业务服务临时日上限为原有4次滚动预留+1，仍在本地应用10次保护内，实际仅1次新模型请求。

业务具体通过：不同意分析400、另一会话404（均未新增预算预留）；同一幂等键重放返回完全相同DTO，新键同照片命中缓存并返回正确新analysisId；两者都不再请求供应商。该业务段call1/error0/cacheHit1；所有模型元数据为`glm-4.6v`，结果经C严格Schema保存。

验证器首次误传空通道列表，被C seed的min(1)拒绝，尚未写区域、启动HTTP、上传或调用模型。补一个明确合成通道后通过，没有修改生产代码。临时3110服务已停止，自有照片/分析/操作/会话/区域均清理，OSS原对象删除确认404；既有预算与脱敏事件保留。

当前源库24h Vision calls5/errors3/cacheHits1/waits0，含此前2次Flash1305、首次付费1113以及2次成功，不能把累计数当本次业务请求数。

## 完成边界

本机付费模型连通、真实私有照片分析、权限/同意/重放/缓存已通过，原模型繁忙/欠费阻塞在本次范围内解除。生成几何图片不代表校园现场障碍准确率验证；本次未调用ORS/搜索/POI或Zenith，完整P0/P1、真实导航/公共管理浏览器总闭环、校园实测和Zenith仍未完成。

新证据/当前状态文档经追加只读复核无准确性阻塞，累计与本次计数、充值恢复和清理范围一致。相对链接/JSON断言、git diff --check以及产品树未变化检查均通过。
