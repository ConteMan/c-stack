# c-stack

ConteMan 长期维护的 Agent Skills：把真实工作中反复有效的方法，整理成可复用、可验证的技能。

## 技能目录

| 技能 | 用途 | 状态 |
|---|---|---|
| [c-technical-writing](skills/c-technical-writing/SKILL.md) | 撰写、改写和审查技术文档；优先保留语义，再改善结构和措辞 | 初版，待真实任务评估 |

## 使用

单个技能可以直接阅读，或按所用客户端的安装方式加载整个技能目录。`SKILL.md` 是唯一执行入口，引用资料随目录一起分发。

例如：

```text
用 $c-technical-writing 改写这份设计文档。保留章节、要求强度和尚未确认的内容。
```

需要本地持续使用时，可将技能链接到客户端支持的目录。安装目标由你显式指定：

```sh
python3 scripts/manage.py link --target /absolute/path/to/client/skills --skill c-technical-writing --dry-run
python3 scripts/manage.py link --target /absolute/path/to/client/skills --skill c-technical-writing
python3 scripts/manage.py status --target /absolute/path/to/client/skills
python3 scripts/manage.py unlink --target /absolute/path/to/client/skills --skill c-technical-writing
```

链接器不会覆盖已有目录、文件或其他来源的链接；卸载只移除指向本仓库当前技能的链接。更新仓库后，链接指向的技能随之更新。

## 仓库结构

```text
skills/<name>/
  SKILL.md              # 触发条件、核心规则、工作方式
  agents/openai.yaml    # 可选客户端展示信息
  references/           # 按需读取的规则、例子与文档类型指导
docs/                   # 仓库维护方式、架构来源
evals/<name>/cases.json # 触发边界和行为评估用例
scripts/                # 仓库校验与安全链接工具
tests/                  # 仓库工具的回归测试
```

目录按技能扁平组织，不按工具或成熟度重复存放。分类和成熟度写在目录表与维护记录里；只有实际需要的技能才创建 `scripts/`、`assets/` 等资源目录。

## 验证

需要 Python 3.10+。写作技能本身不依赖 Python 或联网。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
make validate PYTHON=.venv/bin/python
make test PYTHON=.venv/bin/python
```

静态校验检查技能元数据、引用路径和评估用例格式。测试验证仓库工具的行为。二者都不能证明模型的触发与写作质量；行为评估方式见 [维护说明](docs/maintenance.md)。

## 维护

- 中文为当前技能的执行规范，不维护重复的英文执行版；产出语言跟随任务。
- 语义和任务范围优先，风格偏好不能改变事实或扩大授权。
- 新增技能以具体任务和可观察收益为依据；相近任务优先用模式或参考资料扩展。
- 原有本地技能逐项评估、确认来源后迁入。公开仓库不自动收录本地文件、账号信息或内部项目材料。
- 自有内容采用 [MIT](LICENSE)；第三方内容保留各自的许可证与来源。

参考项目、借鉴范围与架构取舍见 [来源说明](docs/sources.md)。
