# Zenith CLI 本地安装与入口

项目开发依赖锁定 `@zenith-hosting/cli@0.1.9`，要求 Node.js >= 20.10；项目继续使用 `.nvmrc` 和 `package.json` 指定的 Node.js / pnpm 版本。

在包含该依赖提交的独立工作目录执行：

```sh
pnpm install --frozen-lockfile
pnpm exec zenith --version
pnpm exec zenith --help
```

本次实际安装成功，版本输出 `0.1.9`，顶层帮助及 `init --help` 均已验证。仓库内安装通过 `pnpm exec zenith` 调用；不要求每位成员另做全局安装。CLI 属于开发工具，不加入应用生产运行依赖。

2026-10-18 验证：`pnpm install --offline --frozen-lockfile` 成功；`pnpm check` exit 0，lint / typecheck 通过，测试 262 通过、11 跳过、0 失败。系统默认 `/usr/local` 前缀的全局 npm 安装因写权限失败，未更改系统目录权限；上述项目内命令正常可用。

后续命令入口以当前 CLI 帮助为准：

```sh
pnpm exec zenith auth login
pnpm exec zenith init
pnpm exec zenith check
pnpm exec zenith up
```

其中 `check` 与原失败预览的 `logs` 已执行；新预览 `up` 因私有源码/秘密传输自动审批拒绝而未执行，见[修复验收](../acceptance/d-zenith-preview.md)。`init` 会准备部署文件及仓库指导文件；先评估生成差异。`up` 会上传项目并启动平台预览，不能把 CLI 安装成功当作预览或生产部署通过。容器、秘密注入、数据库、预算、迁移及验收规则继续遵循[技术文档第 11 节](../authority/AccessLoop_技术文档_v1.0.md#11-配置与-zenith-部署)和[部署入口](README.md)。

依赖来源：[npm 包 0.1.9](https://www.npmjs.com/package/@zenith-hosting/cli/v/0.1.9)及安装包自带 README / 命令帮助。
