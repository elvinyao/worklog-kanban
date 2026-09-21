# Worklog Kanban

共享工作看板：FastAPI + React + SQLite。浏览器扩展通过每个用户自己的会话读取 Jira / Mattermost；共享服务器不保存个人预览或登录凭据。

**默认交付：GitLab CI 构建正式镜像 → Docker Compose 只运行看板 → 连接已有 Jira / Mattermost。**

| 文档 | 内容 |
| --- | --- |
| [执行与部署](docs/执行与部署.md) | CI、独立部署、扩展交付、备份、fake 环境 |
| [程序架构](docs/程序架构.md) | 数据流、模块、镜像与依赖边界 |
| [开发指导](docs/开发指导.md) | 直连 / 代理与宿主 CA 两种 runner、调试测试 |
| [用户指导](docs/用户指导.md) | 扩展、登录、看板、预览、归档、排错 |

- `Dockerfile` + `compose.yaml`：正式部署，仅 board；必须指定 CI 镜像。
- `.agent/run.sh`：直连开发调试；`.agent/run-proxy.sh`：宿主代理与 CA 版本。
- `deploy/fake/compose.yaml`：显式选择的三服务模拟环境。
- `docker.sh` 与四个 `.command`：保留的本地源码部署入口，首次无配置仍运行 fake，不是 GitLab 镜像部署入口。

正式接入前填写[站点配置](config/production.example.json)，完成[公司接入检查单](docs/公司接入检查单.md)。旧部署参见[迁移说明](docs/执行与部署.md#已有部署的兼容与迁移)。
