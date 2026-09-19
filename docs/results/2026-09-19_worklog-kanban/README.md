# Worklog Kanban：当前进度

日期：2026-09-19。本文件是当前状态的唯一正本；设计/计划/测试定义不另行维护进度。

## 当前阶段

**用户已批准完整实施计划，沿用 main；T01–T05 已提交，T06 模拟接入阶段通过，继续 T07 共享数据库与事务。**

用户已要求使用 dummy 环境，并确认目标 Jira 为 DC / Server 9.7。Mattermost 仅按 API v4 所需子集模拟，实际服务器版本未知。本次交付目标为完整 dummy 版本；公司实测单列。用户在修订计划后明确回复“OK，开始”，据此执行 T01–T14，不重复确认已批准的技术栈或 main。

## 资料

- [现有设计](../../superpowers/specs/2026-09-19-worklog-kanban-design.md)
- [实施计划](../../2026-09-19_worklog-kanban/対応計画.md)
- [测试观察点矩阵](テスト観点マトリックス.md)
- [手动确认步骤](手動確認手順.md)

## 已确认的基线

- 本次开始时 `main` 的 HEAD 为 `492e767`（plan），工作区干净；用户已提交规划文档。
- 开始时没有应用代码、运行时声明、runner 或测试。当前已创建 T01 Docker 入口与工具声明。
- 已实际拉取指定 Python/Node 镜像、构建开发镜像，并验证容器 Python 3.13.15；镜像 digest 已记录。应用测试尚未开始。
- Python/npm 依赖已锁定并安装，类型与 React 构建工具烟测通过；应用尚未实现，不把入口可用写成应用完成。

## 任务状态

| 任务 | 当前状态 | 最新执行证据 |
| --- | --- | --- |
| T01 双运行时与项目入口 | 完成 | [首轮失败](task01_toolchain/attempt-001/実行結果.md)、[复验](task01_toolchain/attempt-002/実行結果.md) |
| T02 Jira / Mattermost dummy | 实现与服务测试完成 | [初始 RED](task02_dummy/attempt-001/実行結果.md)、[审阅回归](task02_dummy/attempt-002/実行結果.md)、[20 项通过](task02_dummy/attempt-003/実行結果.md) |
| T03 站点、链接和数据契约 | 完成 | [RED](task03_contracts/attempt-001/実行結果.md)、[审阅回归](task03_contracts/attempt-002/実行結果.md)、[复验](task03_contracts/attempt-003/実行結果.md) |
| T04 扩展桥接与会话读取 | 完成 | [初验](task04_bridge/attempt-001/実行結果.md)、[竞态 RED](task04_bridge/attempt-002/実行結果.md)、[复验](task04_bridge/attempt-003/実行結果.md) |
| T05 两套适配器 | 完成 | [RED](task05_adapters/attempt-001/実行結果.md)、[复验](task05_adapters/attempt-002/実行結果.md) |
| T06 模拟接入验证页 | 完成 | [RED](task06_probe/attempt-001/実行結果.md)、[初验/修正](task06_probe/attempt-002/実行結果.md)、[普通与 StrictMode 通过](task06_probe/attempt-003/実行結果.md)、[视觉核对](manual/run-001/実行結果.md) |
| T07 共享数据与事务 | 未开始 | 无 |
| T08 FastAPI、SSE 与生成契约 | 未开始 | 无 |
| T09 React 看板和共享笔记 | 未开始 | 无 |
| T10 个人预览与刷新 | 未开始 | 无 |
| T11 键盘、拖拽与焦点 | 未开始 | 无 |
| T12 隔离与故障验收 | 未开始 | 无 |
| T13 Python 生产交付与运行说明 | 未开始 | 无 |
| T14 自审和最终证据 | 未开始 | 无 |

## 下一步与阻碍

- 继续 T07 共享数据库与事务，随后 T08 API/SSE、T09 React 看板；模拟接入阶段已完成。
- Docker 接口需要沙箱外权限，已通过项目 runner 获准访问 OrbStack；不在主机执行项目代码。
- 公司环境尚无：仅影响未来真实 SSO、权限和部署网络验收，不阻塞本计划中的 dummy 功能。
- 三个本地域名和扩展在容器 Chromium 中已验证；主机 Chrome/Edge 的手动安装操作仍待 T12。

## 执行记录约定

每次任务验证保存到 `taskNN_<name>/attempt-NNN/実行結果.md`；手动操作保存到 `manual/run-NNN/実行結果.md`；最终结论保存到 `acceptance-NNN/総合確認結果.md`，并在此链接。
失败重跑不覆盖旧记录；未执行不能改为通过。只保存允许的必要证据，不提交临时浏览器 profile、Cookie、Token 或个人预览正文。
