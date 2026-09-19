# Worklog Kanban

共享工作看板：Python / FastAPI 后端，React / TypeScript 前端，浏览器扩展按每个用户自己的会话读取 Jira 与 Mattermost 个人预览。

共享标题、笔记和关联保存在 SQLite；外部正文和头像只保留在当前查看者的页面内存。默认提供 Jira DC / Server 9.7 与 Mattermost API v4 的独立模拟服务，无需公司环境。

## 本地启动

需要 Docker/OrbStack；在仓库根目录执行：

```text
bash .agent/run.sh python -m tools.sync_deps
bash .agent/run.sh npm run build
bash .agent/run.sh python -m tools.dev
```

打开 [看板](http://board.localhost:4173/)。共享编辑无需扩展；要看个人预览，按[运行说明](docs/运行说明.md)加载 `dist/extension-dummy`，并在 [Jira 模拟页](http://jira.localhost:4180/jira/__dummy/)和 [Mattermost 模拟页](http://mattermost.localhost:4181/__dummy/)登录 Alice 或 Bob。不同身份使用独立浏览器 profile。

- [完整运行、快捷键与生产打包说明](docs/运行说明.md)
- [公司接入检查单](docs/公司接入检查单.md)
- [实施计划](docs/2026-09-19_worklog-kanban/対応計画.md)
- [验证结果与尚未完成的手动验收](docs/results/2026-09-19_worklog-kanban/README.md)

所有安装、构建、测试和服务启动都经 Docker runner；生产产物运行只需 Python。不会自动部署到外部环境。
