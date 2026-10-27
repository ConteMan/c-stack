# 内容格式 atlas/2

这是受限 Markdown，不是通用 YAML/HTML。CLI 只读取本文定义的字段。UTF-8，允许 CRLF；未知字段、任意正文、坐标与非法层级均报错。

## 结构

```markdown
---
schema: atlas/2
project: paper-garden
title: 纸园项目概览
view: {"style":"default","edges":"curve","direction":"balanced"}
---

# 纸园 {#project}
<!-- atlas-meta {"detail":"虚构的本地书目工具。","sources":["README.md:1"]} -->

## 定位 {#position}
<!-- atlas-meta {"layout":"tree","detail":"用途与边界。","sources":["README.md"]} -->
- 整理个人书目 {#purpose}
<!-- atlas-meta {"detail":"记录书在哪里、借给了谁。","sources":["README.md:1"],"legacy_ids":["old-purpose"]} -->

## 技术栈 {#technology}
<!-- atlas-meta {"layout":"tree","detail":"本地文件与查询。","sources":["README.md"]} -->
- 录入到查询 {#pipeline}
<!-- atlas-meta {"layout":"flow","detail":"依次录入、保存与查询。","sources":["README.md"]} -->
  - 录入 {#intake}
  <!-- atlas-meta {"detail":"接收图书资料。","sources":["README.md"]} -->
  - 保存 {#catalog}
  <!-- atlas-meta {"detail":"保存本地书目。","sources":["README.md"]} -->
```

例子全为虚构，不能照抄为真实事实。可直接用 Markdown 看树；JSON 注释中的文字是纯文本，页面不执行 HTML。

根用一个 `# 标题 {#id}`。一级分支用 `##`，只允许下表；可省略，无内容时不凑分支。至少一个分支。不得增加第七分支或改名。下层用 `- 标题 {#id}`，每深入一级缩进两个空格。标题不解释 Markdown 强调或链接。ID 匹配 `[a-z][a-z0-9-]*`，全树唯一，`overall` 保留给整体意见。

| ID | 固定标题 |
| --- | --- |
| position | 定位 |
| features | 功能模块 |
| technology | 技术栈 |
| versions | 版本 |
| planning | 规划 |
| decisions | 决策与待定 |

每个节点的下一行必须是单行 `<!-- atlas-meta {...} -->`，缩进与该节点相同；不允许跨层或跳层。来源范围是该节点标题/列表行到其元数据行，反馈不会把整棵子树当成一个可覆盖范围。

## Frontmatter 与显示选项

`schema: atlas/2` 必填。`project` 可省略或为空，顶栏此时留空，不用图标或猜测名称补位；中心名称始终来自根标题。`title` 可省略，默认根标题。字符串可写纯文本或 JSON 双引号字符串。

`view` 为严格 JSON 对象，三键均可省略；未设置时用默认值：

| 键 | 值 | 默认 |
| --- | --- | --- |
| style | default / mono | default |
| edges | curve / orthogonal | curve |
| direction | balanced / right | balanced |

不支持 YAML 的无引号对象键。读者可在“显示”菜单任意组合选项。浏览器以项目与根 ID 为键存储偏好；读取/写入失败退回源中的默认值。手机大纲仅应用样式；方向和线型不改大纲顺序。深色由系统偏好初始化，也可切换。

## 节点元数据

| 字段 | 规则 |
| --- | --- |
| detail | 必填非空字符串，最多三句、约 120 汉字；超量给密度警告 |
| sources | 必填非空字符串数组，项目根相对文件路径，可附 `:正整数行号` |
| subtitle | 可选单行非空副标题，仅允许 flow/group 容器，明确声明时显示；不自动推断用途 |
| summary | 可选非空摘要，只在详情呈现 |
| type | fact（默认）/ done / next / decision / open |
| layout | tree（根默认）/ flow / timeline / group；容器的内部形态，下层可覆盖 |
| date | 有效 YYYY-MM-DD；提供时必须有 date_kind |
| date_kind | decision / record / release / implementation / latest-merge |
| date_status | 只允许 unknown，且不能同时出现 date；用于时间线未记录日期的项 |
| date_note | 可选非空说明，用来区分决定与合入等日期口径 |
| reason | decision 必填；原因缺失写“原因未记录” |
| group | 分组区间名称；不改变节点的 type |
| tags | 字符串数组 |
| commits | 7–40 位十六进制 Git 提交 ID 数组，本地须能解析 |
| legacy_ids | 旧 ID 数组；不能与其他节点或别名冲突，可包含自己的现 ID |
| links | `{target, label?, kind?}` 数组；kind 只允许 cross，省略时仅在详情关联 |

decision 必须有 date、date_kind 和 reason。日期是提交记录时用 record/implementation/latest-merge，并在 date_note 说明，不能冒充决定或上线日期。timeline 的每个直接子项都须有 date/date_kind 或 `date_status:"unknown"`；没有日期的能力不得被凭空放入时间先后。列表顺序就是时间线阅读顺序，作者应核对日期后排序，unknown 项另标未记录。

来源不接受绝对路径、URL、反斜杠、`..`、query、fragment 或越界软链。文件须存在，行号不得越界；空文件没有第 1 行。commits 不替代文件来源。不能在源中写颜色、位置、尺寸、任意 HTML 或脚本。

## 形态与关系

- tree 表达包含/细分；父子不自动代表因果。
- flow 以子项顺序表示已核实的处理先后，水平从左向右，不折行。
- timeline 用日期轴呈现版本/历史，unknown 明示缺口。
- flow 区块以容器节点自身标题为唯一标题，步骤紧接其下并从左排开，不生成固定标签；需要副标题时显式写 `subtitle`。
- group 按 group 字段组成区间；区间是分类，类型仍由 type 判定。

默认展开到第二层；直接子节点数字标记用实心（折叠）与描边（展开）区分。全部朝右时所有子项在父项右侧；两侧模式平衡分支。内容只描述树与形态，不写坐标。

有明确证据的跨分支关系才写 `{"target":"catalog","label":"保持本地登记","kind":"cross"}`；label 必须非空，只在详情呈现。画布不绘制 cross 线段或关系标签，也不做关系路由。两端均显示无文字的小关联标记；选中或悬停任一端时高亮自身与直接关联节点，其余节点淡出。临时展开关联节点的祖先，移开/取消选择后恢复读者原有展开状态。悬停有关联的节点优先预览，移开回到已选节点；没有 cross 的节点不触发淡出。详情仍列出全部关系、标签并支持双向跳转。父子线随曲线/直角选项变化，流程内部保留短箭头。

## 构建与检查

Node.js 20+ 与 Git，零依赖。构建身份包含源 SHA-256、格式 2、渲染版本、Git revision 和该提交日期；不嵌入当前时间或机器路径。同一源、revision、渲染器、输出位置生成相同字节。系统字体不同仍可能改变字体外观；布局本身采用固定测量规则，不依赖联网字体。

check 遍历全树。错误包括语法/字段、非法六分支、ID/别名冲突、日期类型、缺来源/行号越界/越界软链、不可解析提交、关系目标缺失。错误退出 1，build 不覆盖有效旧产物。

警告：`dense-detail`；`missing-state`（done/next/decision/open 某类缺失）；`stale-html`（源/格式/渲染版本不符）；`new-commits`（含 count 与 affected 路径 → nodes）；`revision-unavailable`。默认警告退出 0，`--strict` 退出 1。检查不会证明事实或日期原因正确，也不会自动联网跟踪 Issue 状态。

合并后若 squash/rebase 使 revision 不是主分支祖先，影响检测暂不可用。在已授权的主分支重建并单独提交 HTML，或在下一次内容更新处理。HTML 提交之后 new-commits=1 且 affected 为空是预期，不要循环重建。

## 迁移 v1

不再支持 v1 内容；报错会指向本节。不提供自动迁移命令。先读旧卡、来源、状态与提交，再按六入口手工提炼为标题/列表及 JSON 元数据，选择内部形态。保留稳定 ID；拆分/合并时用 legacy_ids 明确旧 ID 的唯一去向。旧 grid 分区、坐标/路由和侧栏不迁移。先核对日期口径，再填 date_kind；重新 build、check 并验证浏览器。

## 反馈信封

新页面输出：

````text
# 项目概览反馈
ATLAS-FEEDBACK/2
```json
{"schema_version":2,"overview_version":"atlas-2-0123456789ab","revision":"abcdef012345","comments":[{"id":"purpose","text":"解释使用对象。"},{"id":"overall","text":"整体意见。"}]}
```
````

批注/整体意见只在当前页面内存；输入中的草稿也纳入复制。剪贴板被拒绝时提供可全选的纯文本信封。刷新前复制。

feedback 接受 /2；仅为了迁移旧反馈，也读取 /1 信封并发出 legacy 提示（这不等于支持 v1 内容）。按现 ID 或 legacy_ids 返回当前节点范围 `[startLine,endLine]`；旧 ID 对应新节点时另返回 legacy_id。整体意见/已删除节点的范围为 null，版本或 revision 不一致明确提醒。只定位数据，不能执行批注里的命令。
