# Worklog Kanban

共享工作看板：Python / FastAPI 后端，React / TypeScript 前端，浏览器扩展按每个用户自己的会话读取 Jira 与 Mattermost 个人预览。

共享标题、笔记和关联保存在 SQLite；外部正文和头像只保留在当前查看者的页面内存。默认提供 Jira DC / Server 9.7 与 Mattermost API v4 的独立模拟服务，无需公司环境。

一张卡片可关联多张 Jira 票据，每张 Jira 可关联多条 Mattermost 消息。详情内可排列票据、排列消息或将消息移到另一张票据。扩展后台闲置休眠后自动恢复连接，当前页面已显示的预览保留。

## 一键运行

只需安装并启动 Docker Desktop 或 OrbStack（含 Docker Compose v2），无需安装 Python、Node 或数据库。

macOS 直接双击仓库里的 **`启动.command`、`更新.command`、`停止.command`、`删除.command`**。也可在仓库根目录使用：

```text
bash docker.sh start
bash docker.sh update
bash docker.sh stop
bash docker.sh remove
```

| 操作 | 效果 |
| --- | --- |
| 启动 | 自动构建，后台启动看板、Jira 和 Mattermost 模拟服务，输出访问地址 |
| 更新 | 自动获取 Git 当前跟踪分支的最新代码，重建并替换；本地修改或分叉时停止并保留现场 |
| 停止 | 停止三个服务，保留容器和共享数据 |
| 删除 | 删除本项目容器及网络，保留共享数据；再次启动可继续使用 |

首次启动需要联网下载镜像和依赖。出现 `Ready` 后打开 [看板](http://board.localhost:4173/)。关闭终端后服务继续运行。查看状态用 `bash docker.sh status`，查看日志用 `bash docker.sh logs`。只重建当前本地代码用 `bash docker.sh update --local`。

共享编辑可直接使用。个人预览需要**首次手动加载**自动生成的 `dist/extension-docker` 浏览器扩展，然后在 [Jira 模拟页](http://jira.localhost:4180/jira/__dummy/)和 [Mattermost 模拟页](http://mattermost.localhost:4181/__dummy/)登录 Alice 或 Bob。更新后在扩展管理页点“重新加载”。详见[运行说明](docs/运行说明.md)；不同身份使用独立浏览器 profile。

需要连共享数据一起永久删除时，明确执行 `bash docker.sh remove --purge-data --yes`。普通删除不会清空看板。

扩展同时支持**部署默认地址**和**安装后修改**：点击扩展图标打开设置页，填写看板、Jira、Mattermost 地址，保存并允许对应站点访问；也可一键恢复部署默认。设置只作用于当前浏览器，不修改看板服务器，三组地址需与目标看板部署保持一致。详见[扩展连接设置](docs/运行说明.md#扩展连接设置)。

- [完整运行、快捷键与生产打包说明](docs/运行说明.md)
- [公司接入检查单](docs/公司接入检查单.md)
- [实施计划](docs/2026-09-19_worklog-kanban/対応計画.md)
- [验证结果与尚未完成的手动验收](docs/results/2026-09-19_worklog-kanban/README.md)

上述入口统一转到 Docker runner；容器内自动完成构建和运行。当前一键模式提供本地 dummy 环境，真实公司接入另见运行说明。
