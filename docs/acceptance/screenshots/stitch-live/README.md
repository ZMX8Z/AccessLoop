# Stitch 实际页面证据

原稿位于 ../../../design/stitch/source，保持原始文件不变。compare-*.jpg 左侧仅等宽缩放原始 screen.png，右侧为实际浏览器截图；桌面对照右侧为1280×900的截图等比缩放，非桌面设计稿。全部浏览器操作使用本机3121生产服务。

- final 产品证据提交：b288bd90902ca33d5a1720d413b3029551d9d4b9。R1/P1/P2/P3/M2截图对应 e7ff5e9；后续仅M1卡片压缩，其余内容未变。M1 final对应b288bd9，实际手机卡高158px、桌面162px；compare-m1已更新为最终卡片。
- R1/R2 current-3b128b5：初始真实接口闭环，ORS57m、约1min；R2是360×800浏览器的全页滚动截图。最新生产头再次ORS超时，未将旧截图冒充新头供应商成功。
- R1 final：未规划状态；timeout-final：最终真实失败状态。R2 guard-final：无合法路线的直接URL守卫。
- P1/P2 final：最新真实私有上传后明确人工继续，未发送第二次GLM、未保存第二条报告。p2-submit-final记录滚动后可见按钮；完整P2保留全部事实/位置/通道字段。
- P3 final：服务端真实确认的本人记录经授权读取恢复；M1 active（e7ff5e9旧长卡，仅留真实状态证据）、M2 active、授权HTML打印在测试避让停用前拍摄。随后已停用，stopped截图及JSON为最终状态。
- fixture-late-response：明确fixture入口的公共有效集变更/迟到规划防护，不是实际公共管理发布。
- 部分full截图中的固定Tab位于第一屏底部，这是浏览器全页拼接效果；主视口360×800和提交按钮另有截图，不能用拼接图判断实际裁切。

check-final.txt、build-final.txt是实际命令输出；api-audit-final.json为同一数据库联调窗口的脱敏汇总，包含其他保留服务及长时间暂停期间的事件，不能全部归因于本轮A显式操作。no-extra-directions.json为固定短窗口内实际交互后的0供应商事件证据。没有保存Cookie、ownerSessionHash、密钥或原始环境。

交付PR：[#21](https://github.com/ZMX8Z/AccessLoop/pull/21)；最终deliveryHead见PR正文。构建日志只规范终端回车与行尾空格，OFL许可仅去行尾空格，命令结果和许可文字不变。
