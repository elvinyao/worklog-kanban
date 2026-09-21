# 部署与调试拆分验证

日期：2026-09-21。所有项目执行均通过 `.agent/run.sh` 调度 Docker；未部署到真实服务、未访问既有数据卷。

| 检查 | 结果 |
| --- | --- |
| 后端原有回归 | 160 passed；2 条现有依赖弃用警告 |
| 新增 runner 网络边界测试 | 3 passed，覆盖直连清空代理、大小写代理变量、宿主映射、NO_PROXY、只读 CA 挂载、缺 CA 拒绝 |
| 正式 Dockerfile 构建 | 使用 production.example.json 成功，镜像 worklog-kanban:production-check |
| 最终正式镜像验证 | 非 root、只读根目录、无外网、临时库；启动、健康、停止及数据库完整性通过；无 Node/npm/dummy/pytest/httpx/piptools |
| extension target | 成功导出至 .tmp/ci-extension-check/extension |
| fake Dockerfile 构建 | worklog-kanban:fake-check 成功 |
| Compose 服务清单 | 正式只有 board；fake 为 board/jira/mattermost |
| shell 与 CI 配置 | bash 语法、js-yaml 解析、CI 命令字符串类型检查通过 |
| 补丁空白检查 | git diff --check 通过 |

CI 在推送镜像前执行 `scripts/verify-production-image.py`。Uvicorn 处理 SIGTERM 后重新抛出该信号，验证接受正常退出或 SIGTERM 返回值，并要求及时退出、数据库完整。

尚未在公司环境实测：GitLab CI lint/Runner/Registry 实际发布、宿主真实代理和 CA 的 HTTPS 连接、真实 Jira/Mattermost SSO 与浏览器策略。代理测试验证参数传递与失败边界，不代表公司网络已验收。CI 已按用户确认采用 GitLab Registry + privileged TLS DinD。
