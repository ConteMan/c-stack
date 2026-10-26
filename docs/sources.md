# 来源与架构取舍

调研日期：2026-10-05。以下是方法与组织方式的参考，不代表这些项目为 c-stack 背书。

| 来源 | 借鉴 | c-stack 的取舍 |
|---|---|---|
| [Agent Skills specification](https://agentskills.io/specification) | 每个技能一个目录；`SKILL.md` 元数据和入口；引用资料按需加载 | 使用标准技能目录，保持可独立分发 |
| [anthropics/skills](https://github.com/anthropics/skills) | 集中的 `skills/` 目录、自包含技能和明确来源 | 技能扁平组织，分类写在 README；不复制产品专用内容 |
| [hylarucoder/hai-stack](https://github.com/hylarucoder/hai-stack) | 日常方法沉淀、术语和主体明确、条件前置、触发和工作用例、安全链接 | 重写适合自身任务的指导；语义保真优先，不照搬禁词表、硬句长和双语执行副本 |
| [openai/plugins](https://github.com/openai/plugins) | 技能可作为更大插件的一部分，客户端元数据与核心内容分离 | 当前只需技能库，暂不增加插件清单、marketplace 和连接器；确有分发需求再包装 |

[openai/skills 的 README](https://github.com/openai/skills) 当前提示该仓库已弃用，并指向 `openai/plugins`。因此 c-stack 不把它旧有的分类目录作为长期架构依据。

## 技术写作的来源与改动

[hai-simplified-technical](https://github.com/hylarucoder/hai-stack/tree/main/skills/hai-simplified-technical) 的受控语言思路是起点。c-stack 的规则、例子和脚本为重新编写，没有复制该项目的规则文件或检查器，也不宣称符合完整 ASD-STE100 标准。

保留：术语一致、动作主体清楚、条件在指令前、风险在操作前、区别当前事实和未来计划、措辞修改与事实核验分开。

调整：

- 保留要求强度、条件、因果和不确定性是最高约束；风格不能覆盖语义。
- 术语按概念和语境一致，不强制把不同领域的同名概念另造名称。
- 句长、主动句、结论先行、标点是偏好，项目约定与读者任务优先。
- 支持从零组织文档，但结构按文档类型选择，不把每种文档套成同一模板。
- 不对技术正文做禁词正则门禁；静态工具只检查能可靠判断的仓库结构。

## 项目概览画布的来源与改动

`answer-me-with-html` 是本地参照技能：只借鉴“模型写内容草稿，CLI 负责布局与渲染”的分工及入口按工作流组织的思路，没有复制其代码、模板或文字。项目概览另行实现严格的内容格式、来源与版本检查、状态决策卡片和可定位反馈。

渲染器基于维护者提供并授权改造的自有画布原型，延续其配色、导航、详情和批注交互；去除项目专用内容与手工坐标，改为顺序布局、通用内嵌 JSON 与窄屏列表。公开测试仅使用虚构项目，未引入第三方资源或运行时依赖。

## 授权与第三方内容

c-stack 自有内容采用 MIT。未来引入第三方代码、模板或技能时，逐项核实许可，保留原有归属及所需文件；根目录 MIT 不覆盖第三方内容的许可条件。
