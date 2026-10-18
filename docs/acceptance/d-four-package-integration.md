# 四包当前阶段集成回执（2026-10-18）

本记录是 D 的技术执行记录。四包当前工程阶段已进入同一个 dev；P0/P1 总验收仍未完成，公共规则仍只引用 authority。

| 字段 | 固定值 |
| --- | --- |
| baseDevCommit / codeEvidenceCommit | `9cfd186a8d2345af9cd970266e22415a9085d2e2` |
| B PR #8 deliveryHead | `e53387de1e42e8ee01961faf73a151d24538f7d9` |
| B PR #8 integratedDevCommit | `9cfd186a8d2345af9cd970266e22415a9085d2e2` |
| 本回执阶段 deliveryHead / integratedDevCommit | 由本次 D 阶段 PR 最终元数据固定；仅文档，无产品变化 |

D 核对全部开放 PR 后更新现有 [B #8](https://github.com/ZMX8Z/AccessLoop/pull/8)，保持 base=dev、以精确交付头进行平台 merge commit。平台合并后，完整 Git 树与已审查交付头相同；主目录 dev 和 D 固定分支均安全同步，未 rebase/reset/强推。先前 C15、D16/D17 的集成 SHA 已在各自记录和 PR 中保留。

## Standards

B 产品 `4b642c63dc8cdb3918123934673c3d72e242f646` 的旧 PATCH、旧轮询覆盖问题经独立复验修复；31/31 定向测试、0 跳过。最终文档/JSON/截图只读核验无阻塞问题，旧作者阶段状态已标为历史。[B 技术验收](wp-b.md)保留详细范围。

## Spec

描述修正观察秒数、mine 列表截断与 uncertain 证据三项先红后绿回归通过，独立复验31/31；与 Standards 是同一套测试，不相加。授权/公共 DTO 和服务端权限未改；原生打印预览、真实路线片段与外部总闭环仍未计通过。

## 同一集成树的检查与运行

- 已有全量 `pnpm check`：219 pass、0 fail、11 条条件集成跳过，lint/typecheck 通过；产品树一致，未重复整套。
- 合后受影响5文件：31 pass、0 fail、0 skip，exit0。日志 `/private/tmp/accessloop-dev-9cfd186-focused.log`。
- D 运行目录重新 `pnpm build`：exit0，编译、TypeScript、页面生成完成，无编译 warnings。日志 `/private/tmp/accessloop-dev-9cfd186-build.log`。
- 首次启动发生在构建完成之前，因缺 BUILD_ID 退出1；实际构建结束后启动及配置重启均成功，未把第一次启动记为通过。
- 统一生产服务 `http://127.0.0.1:3000`：health、/live、/reports、/reports/new、/admin/login 均200；根入口转到明确设计演示 /stitch/route.html；匿名 usage-summary 为401，生产 c0/c1-demo 为404。只读检查没有触发供应商。
- B 浏览器证据对应相同产品树的隔离3108服务和独立_test库，真实OSS生成照片；[脱敏记录](b-browser-evidence.json)与截图已入库。隔离服务已停止，本会话生成的重复密钥环境已删除；源 .env/D .env.local 保留。

本机入口只证明当前产物运行。未导入未经现场核验的校园候选，当前不能将空区域/设计页面当作实时校园导航成功。

## 真实模型重查与预算

本地两个既有服务端环境的 `VISION_DAILY_BUDGET` 从空值配置为保守的10次/日，分钟上限10；其余用户值保留，环境0600且不提交。此值是本地应用保护，不能当供应商额度。服务已重启生效。

同一集成代码通过 C 持久原子仓储和 D ProviderGate 仅请求一次生成的几何图片，禁止门禁自动重试；真实GLM仍为429/1305、1179ms。新预留与call/error各一条持久化；当前24h Vision calls=2/errors=2（包含此前一次），没有用余额冒充统计。没有创建真实照片/报告分析业务结果或声称模型准确率通过。见[新脱敏证据](../deployment/vision-recheck-evidence.json)，旧失败证据保留。

## 未解除的验收项与可继续工作

1. 实时模型成功：上游仍忙，密钥与本地日预算已配置；不是缺少密钥，也不能据1305推断账户无权限。不连续重试。
2. 实时地点源：HeiGIT非法NaN JSON、Overpass406的真实失败保留；未以fixture或错误空列表替代。
3. UNSW小区域现场证据：固定起终点、备选通道、层级/净宽/坡度与障碍位置尚无实测交接；候选保持三个发布门false，不导入正式区域。
4. Zenith：仍无实际项目/模板及部署连接/注入规范，不能编造manifest、线上地址或二维码。本机PG/OSS连接和单样本配套恢复已过，不能代替平台验收。
5. 最终公众真实ORS/搜索与公共管理双会话浏览器闭环、原生打印及人工界面验收，须在合法目标区域和实际部署条件下完成。已有C15生产HTTP、实库权限/版本/摘要及确定性路由证据可复用。

约120秒演示稿已与B真实按钮流程对齐，未声称完成真实全闭环排演。D 的 P0/P1 继续进行；本回执不将缺失的实时/现场/平台验收改为完成。

本回执交付前两轴只读复核均无剩余阻塞：Standards发现的部署说明旧C/B等待状态已修正；Spec确认单次探针与累计统计、人工模式和最终未验范围一致。文档链接/JSON断言与git diff --check通过；src/tests/package/lockfile与受检产品9cfd186完全相同，不为仅文档变更重复外部调用或构建。
