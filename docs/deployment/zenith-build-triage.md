# Zenith 构建重试：平台排查材料

本记录不含密钥、环境文件、用户照片或行程。2026-10-18用户已授权上传并启动预览；当前尚未获得可用URL。

## 可复查对象

- repository：`github:zmx8z/accessloop`，D固定分支；PR #23 base=dev、draft。
- 实际上传提交：`270b220db892ff0faeb2e3b5cdf90f6e4d5d80c9`。
- 会话：`01M56N0A21JF9QGSS7SG0TZ9ZG`。
- 第一作业/Pod：`zenith-publish-7d6z9` / `zenith-publish-7d6z9-zw8s9`。
- 自动重试作业：`zenith-publish-jtsrx`、`zenith-publish-km9ht`。
- 2026-10-18T04:43:45.736Z状态：building，errorCode=`PREVIEW_RETRY`，errorDetail=`Build or deployment failed. Check CLI logs for details.`，无URL。

## 已验证的边界

平台接受Compose和26项独立私有输入，源码archive排除私有/生成文件；固定Node22.14.0镜像、pnpm10.20.0及冻结依赖安装成功。停滞发生在Docker的Next生产编译步骤，不在数据库启动或供应商调用。

真实Linux日志确认Webpack构建worker/内存优化/单worker选项与构建专用1024MiB旧生代设置已启用，报告heapLimitBytes=1124073472。该值不是构建总RSS限额。平台未暴露cgroup限额，系统MemAvailable也不是容器限额。wrapper心跳曾出现磁盘睡眠、内存pressure增加及RSS回落；这是wrapper状态，不能据此声明Next被OOM杀死。

同应用源码、同Node版本和堆设置的无env本机冷生产构建exit0：46.41秒、编译26.9秒、最大RSS1519419392字节。当前提交lint/typecheck/check通过，277通过/12默认集成跳过/0失败。平台完整日志未返回具体编译错误、退出码或终止信号。先前多个会话也在同一步骤自动重试；替换前均在业务运行前停止、确认deleted。

## 需要平台确认

请按上述会话及作业提供：BuildKit/构建容器的实际退出码、terminated reason、Pod事件、实际CPU/内存/IO限额（包含父级约束），以及作业重试的触发原因。现有官方CLI只返回通用errorDetail与构建日志，没有这些字段。

官方Compose的`mem_limit`与`deploy.resources`约束运行容器，未声明构建RAM配置；`--wait-timeout`也是CLI等日志超时，不能修改平台构建限额。因此本次没有猜造平台字段、改变付费资源或绕过Docker源码构建。

最新停止/完成状态与聚合证据以[验收](../acceptance/d-zenith-preview.md)和[JSON](zenith-preview-evidence.json)为准；本记录保留当时的失败观察。恢复后由开发代理先读取同一会话，再决定是否需要新预览；如新预览需要接管供应商预算，必须先确认没有另一实例使用独立账本。

## 最终清理

2026-10-18T04:47:52.354Z再次读取：仍building/PREVIEW_RETRY，前两作业失败后第三作业开始，未到应用运行。保存完整脱敏日志后显式down；2026-10-18T04:48:03.987Z确认deleted。该停止为防止同一未知失败无效重试；不是平台构建完成或在线验收成功。
