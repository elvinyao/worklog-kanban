# Worklog Kanban：当前进度

日期：2026-09-19。本文件是当前状态的唯一正本；设计/计划/测试定义不另行维护进度。

## 当前阶段

**T01–T15 的实现与自动验证已完成；一键 Docker 默认环境已经启动。沿用 main 本地提交，dummy 整体手动验收仍待确认。**

受测应用版本 `add5fbb`；98 后端测试、69 前端逻辑测试、普通 Chromium 完整 25 项及补充安全用例 1 项通过，独立 StrictMode 构建 9 项通过。[综合确认结果](acceptance-001/総合確認結果.md)逐项映射 45 个 dummy 观察点，明确 43 项自动/静态范围内通过、K02 部分通过、R01 未执行。

用户已要求使用 dummy 环境，并确认目标 Jira 为 DC / Server 9.7。Mattermost 仅按 API v4 所需子集模拟，实际服务器版本未知。本次交付目标为完整 dummy 版本；公司实测单列。用户在修订计划后明确回复“OK，开始”，据此执行 T01–T14，不重复确认已批准的技术栈或 main。

## 资料

- [现有设计](../../superpowers/specs/2026-09-19-worklog-kanban-design.md)
- [实施计划](../../2026-09-19_worklog-kanban/対応計画.md)
- [测试观察点矩阵](テスト観点マトリックス.md)
- [手动确认步骤](手動確認手順.md)

## 已确认的基线

- 本次开始时 `main` 的 HEAD 为 `492e767`（plan），工作区干净；用户已提交规划文档。
- 开始时没有应用代码、运行时声明、runner 或测试；T01 建立 Docker 入口与工具声明。
- T01 实际拉取指定 Python/Node 镜像、构建开发镜像，并验证容器 Python 3.13.15；镜像 digest 已记录。
- T01 锁定并安装 Python/npm 依赖，类型与 React 构建工具烟测通过；当时的工具链结果与后续应用测试分开记录。

## 任务状态

| 任务 | 当前状态 | 最新执行证据 |
| --- | --- | --- |
| T01 双运行时与项目入口 | 完成 | [首轮失败](task01_toolchain/attempt-001/実行結果.md)、[复验](task01_toolchain/attempt-002/実行結果.md) |
| T02 Jira / Mattermost dummy | 实现与服务测试完成 | [初始 RED](task02_dummy/attempt-001/実行結果.md)、[审阅回归](task02_dummy/attempt-002/実行結果.md)、[20 项通过](task02_dummy/attempt-003/実行結果.md) |
| T03 站点、链接和数据契约 | 完成 | [RED](task03_contracts/attempt-001/実行結果.md)、[审阅回归](task03_contracts/attempt-002/実行結果.md)、[复验](task03_contracts/attempt-003/実行結果.md) |
| T04 扩展桥接与会话读取 | 完成 | [初验](task04_bridge/attempt-001/実行結果.md)、[竞态 RED](task04_bridge/attempt-002/実行結果.md)、[复验](task04_bridge/attempt-003/実行結果.md) |
| T05 两套适配器 | 完成 | [RED](task05_adapters/attempt-001/実行結果.md)、[复验](task05_adapters/attempt-002/実行結果.md) |
| T06 模拟接入验证页 | 完成 | [RED](task06_probe/attempt-001/実行結果.md)、[初验/修正](task06_probe/attempt-002/実行結果.md)、[普通与 StrictMode 通过](task06_probe/attempt-003/実行結果.md)、[视觉核对](manual/run-001/実行結果.md) |
| T07 共享数据与事务 | 完成 | [初始失败](task07_store/attempt-001/実行結果.md)、[事务复验](task07_store/attempt-002/実行結果.md) |
| T08 FastAPI、SSE 与生成契约 | 完成 | [RED](task08_api/attempt-001/実行結果.md)、[审阅回归](task08_api/attempt-002/実行結果.md)、[91 后端测试及契约复验](task08_api/attempt-003/実行結果.md) |
| T09 React 看板和共享笔记 | 完成 | [初始 RED](task09_board/attempt-001/実行結果.md)、[审阅回归](task09_board/attempt-002/実行結果.md)、[追加竞态](task09_board/attempt-003/実行結果.md)、[61 逻辑与 13 浏览器复验](task09_board/attempt-004/実行結果.md) |
| T10 个人预览与刷新 | 完成 | [RED 与首轮实现](task10_previews/attempt-001/実行結果.md)、[消息别名去重](task10_previews/attempt-002/実行結果.md)、[StrictMode/超时回归](task10_previews/attempt-003/実行結果.md)、[69 逻辑及普通/开发浏览器复验](task10_previews/attempt-004/実行結果.md) |
| T11 键盘、拖拽与焦点 | 实现及自动验证完成；实际 IME 待确认 | [初始 RED 与初验](task11_interaction/attempt-001/実行結果.md)、[并发拖拽 RED→GREEN 与 4 项浏览器复验](task11_interaction/attempt-002/実行結果.md) |
| T12 隔离与故障验收 | 自动验收完成；品牌浏览器待确认 | [初验与测试修正](task12_isolation/attempt-001/実行結果.md)、[25 普通与 9 StrictMode 浏览器通过](task12_isolation/attempt-002/実行結果.md)、[手动环境缺项](manual/run-002/実行結果.md) |
| T13 Python 生产交付与运行说明 | 完成 | [初验及审阅 RED](task13_production/attempt-001/実行結果.md)、[7 项独立运行与重启复验](task13_production/attempt-002/実行結果.md) |
| T14 自审和最终证据 | 审查与记录完成；整体手动验收待确认 | [最终回归及补充初验](task14_review/attempt-001/実行結果.md)、[共享文本安全复验](task14_review/attempt-002/実行結果.md)、[综合确认结果](acceptance-001/総合確認結果.md) |
| T15 集成 Docker 生命周期 | 实现、真实生命周期与 105 项后端回归完成 | [追加计划](../../2026-09-19_docker-operations/対応計画.md)、[初始测试](task15_docker/attempt-001/実行結果.md)、[审阅修复](task15_docker/attempt-002/実行結果.md)、[真实运行和自审结果](task15_docker/attempt-003/実行結果.md) |

## 下一步与阻碍

- 默认 Docker 看板、Jira、Mattermost 已启动，可访问 `http://board.localhost:4173/`；四个双击入口和 `bash docker.sh` 用法见 [运行说明](../../运行说明.md)。个人预览首次需加载 `dist/extension-docker`。没有外部部署或 push。
- 剩余 dummy 必需项：按 M06 验证真实 OS 输入法；按 M07 在实际 Chrome、Edge 安装扩展并完成核心操作。记录到新的 manual/run，再建立 acceptance-002，不覆盖本次记录。
- Docker 接口需要沙箱外权限，已通过项目 runner 获准访问 OrbStack；不在主机执行项目代码。
- 公司环境尚无：仅影响未来真实 SSO、权限和部署网络验收，不阻塞本计划中的 dummy 功能。
- 三个本地域名和扩展在容器 Chromium 中已验证。此前手动检查时 Mac 锁定，原生应用操作不可用，未发现 Edge；该次限制详见 manual/run-002。不能把容器自动化记作品牌浏览器/OS IME 通过。
- 普通历史返回实际重新读取已验证；真实 BFCache 本次未命中，缓存扫描证据的范围限制见综合确认结果。

## 执行记录约定

每次任务验证保存到 `taskNN_<name>/attempt-NNN/実行結果.md`；手动操作保存到 `manual/run-NNN/実行結果.md`；最终结论保存到 `acceptance-NNN/総合確認結果.md`，并在此链接。
失败重跑不覆盖旧记录；未执行不能改为通过。只保存允许的必要证据，不提交临时浏览器 profile、Cookie、Token 或个人预览正文。
