# 内容与反馈格式 v1

首次生成、格式报错或需要扩展卡片时阅读。CLI 是严格的 Markdown 子集解析器，不是通用 YAML：未知字段、自由正文、任意 Markdown 围栏均报错，不默默忽略。

## 文档结构

````text
---
project: paper-garden
title: 项目概览
---

## 全貌 {#overview layout=grid}

```card id=purpose
title: 整理纸质书的借阅
summary: 记录书在哪里、借给了谁。
detail: |
  这是一个虚构的本地书目工具。
tags: 本地, 书目
sources: README.md:1
links: catalog "查询书目"
```

## 数据主线 {#flow layout=flow}

```card id=catalog
title: 书目
summary: 把录入的书保存下来。
detail: 数据保存在本地。
sources: src/catalog.js:2
```

## 现状与决策 {#status layout=grid}

```card id=choice
type: decision
title: 先做好本地书目
summary: 暂时只支持单人使用。
detail: 团队共享还没有实现。
date: 2026-01-02
reason: 先验证个人整理需求。
sources: docs/decisions.md:3
```
````

以上名称、日期、路径与事实均为虚构示例；使用前替换为真实且允许保存的证据。实际文件不含最外层的 `text` 围栏。分区标题必须是 `## 标题 {#id layout=grid}` 或 `layout=flow`，属性顺序固定。

## 语法与字段

- UTF-8，可读 CRLF；frontmatter 从第一行 `---` 到下一行 `---`，只接受必填的 `project`、`title`。
- 非空纯文本值保持字面意义；需要特殊开头或转义时用 JSON 双引号字符串。无 YAML 注释、别名、折叠、单引号解码或隐式类型转换；`#` 不是行尾注释。
- 卡片用独占行的 ` ```card id=xxx ` 和 ` ``` ` 开闭（实际去掉两端空格）。卡片必须属于分区，每个分区至少一张卡。分区和卡片的 ID 分别唯一，匹配 `[a-z][a-z0-9-]*`；卡片 `overall` 保留给整体反馈。
- 卡片必填：`title`、`summary`、`detail`、`sources`。可选：`tags`、`links`、`commits`、`type`、`date`、`reason`。字段不重复，不支持坐标、尺寸、HTML 或 CSS。
- `detail: |` 后以两个空格缩进正文，保留换行；或用单行纯文本／JSON 字符串。内容作为纯文本显示，不解释 Markdown 或 HTML。
- `tags`、`sources` 用半角／全角逗号分隔，或用 JSON 字符串数组。有空格的路径可直接写；路径中含逗号时必须用 JSON 数组，例如 `sources: ["docs/design notes.md:4", "src/catalog.js"]`。
- `links: catalog "查询", shelf`：半角逗号分隔，每项是目标卡片 ID，可附 JSON 双引号标签。标签可含逗号或转义引号。可跨分区，无需另声明边。没有连线就省略 `links`。
- `sources` 为项目根目录相对文件路径，末尾可附正整数行号；不接受绝对路径、URL、父目录跳转、反斜杠和越出根目录的符号链接。文件须存在，行号不可超出文件实际长度；空文件没有第 1 行。

- `commits` 可选，使用逗号分隔或 JSON 字符串数组，保存 7–40 位十六进制 Git 提交 ID，作为状态、日期和决定的历史证据。它不替代文件来源；本地历史必须能解析这些提交。页面显示提交 ID 供仓库历史定位，不自动联网。

## 状态和决策

`type` 默认 `fact`（用途、能力、边界）。`#status` 约定用于「现状与决策」；标题可以翻译，检测依据固定 ID。

| type | 表达 | 证据要求 |
|---|---|---|
| done | 已完成 | 已合入提交、关闭的 Issue、实现与文档 |
| next | 进行中或下一步 | 区分已开工、批准计划和建议；没有计划就明确未定 |
| decision | 已记录的关键决定 | 必须有有效 `date: YYYY-MM-DD` 和 `reason`；未知原因写“原因未记录” |
| open | 悬而未决 | 已知未解决问题，或明确标注的推断性待确认问题 |

四类在内容工作流中都要考虑；CLI 只检查 `decision` 必填字段及缺少 `#status` 的警告，不代替证据或语义判断。不知道日期时先补证据，不能随便填写当前日期。

## 布局与构建身份

布局按分区、布局类型和卡片顺序计算，不随文案长短变化。`grid` 最多三列逐行排列；`flow` 单行从左到右，卡片越多分区越宽，不折行。flow 卡宽固定，grid 卡宽由主线宽度自动计算并限制在 340–600px，以便概况卡更舒展。只改文字保持位置，增删卡片或改变布局类型可能影响后续分区。

同一 flow 中相邻卡片用水平短箭头。其他关系尝试经过行间通道、分区边缘的正交路线；每条线段都避开卡片，平行路线至少留 10px 间隔，并避开已有线的交叉。找不到清晰路线时不画该线，关系仍保留在双向可点击的卡片详情「关联」中。所有 links 都可从详情追溯，不会因省略线条丢失。标签只放在不遮挡卡片和分区标题的空白处，空间不足时只在详情显示标签。

桌面默认对准第一个分区左上方，按宽度选择 60%–100% 的阅读缩放；标题在最小缩放下仍至少约 13.8px（宽卡约 16.2px）。首屏不强求装下整图，分区导航使用相同阅读策略。工具栏「返回全貌」或快捷键 0 才适应整张画布，此时文字可能变小；可通过小地图定位并继续平移缩放。侧栏只列各分区，不增加重复的全局入口。

页面内嵌内容 JSON、布局、样式和脚本，不加载字体、脚本或网络资源。≤640px 改为按分区排列的纵向列表，详情、批注和搜索可用。来源点击才打开相对文件；浏览器对本地文本的行号片段可能不支持跳转，行号仍可用于编辑器定位。

`sourceHash` 是源文件原始 UTF-8 字节的 SHA-256；`version` 为 `atlas-1-` 加哈希前 12 位。`revision` 为 `git rev-parse --short=12 HEAD`，`generated` 为该提交的 ISO 提交日期（含时区）。构建不嵌入机器路径或当前时间；相同源文件、revision、CLI 版本、输出相对位置产生相同字节。输出目录影响来源链接，属于构建输入。未提交的来源内容不会被 revision 描述，发布前应核对并提交来源。

## check

`atlas build` 先做源格式、图和文件检查，有错误不覆盖已有 HTML；密度和状态警告不阻断默认构建。`atlas check [--json] [--strict]` 另外检查产物和 Git 历史。

错误退出 1：非法格式、重复 ID、连线目标缺失、来源缺失或越界、行号超出文件长度、引用的 Git 提交不可用。

警告默认退出 0，`--strict` 退出 1：

- `dense-detail`：按中英文句尾标点估算超过三句，或超过 120 个汉字。是可解释的启发式，不理解语义。
- `missing-status`：没有 `#status` 分区。
- `stale-html`：产物缺失、无效或 `sourceHash`／格式版本不匹配。
- `new-commits`：概览 revision 后 HEAD 又有提交；列出数量，并用这段历史中的改动文件列出“被引用且改动的文件 → 卡片 ID”。中间改动后又还原的文件仍会列出，未引用文件不会映射到卡片。
- `revision-unavailable`：历史不全、revision 无效或非 HEAD 祖先，不能计算影响；缺失历史时先补齐。目标项目使用 squash 或 rebase 方式合并时，在合并后的主分支重新 `build`、`check` 并把 HTML 单独提交；也可留待下一次概览更新一起完成，但重建前影响检测不可用。HTML 提交后出现 `new-commits` 且 `affected` 为空是预期，不需为清除此提示反复重建。

JSON 输出包含 `errors`、`warnings`；每项有 `code` 和 `message`，卡片问题另有 `card`、`line`，提交警告另有 `count`、`affected: [{path,cards}]`。语法错误按遇到的第一个错误报告；成功解析后收集全部图、来源和密度问题。该检查不检测所有未提交实现变化，不证明事实、因果或计划正确。

## 反馈信封

页面复制的文本有固定标题、标记和一个 JSON 围栏，既可直接阅读也可稳定解析：

````text
# 项目概览反馈
ATLAS-FEEDBACK/1
```json
{
  "schema_version": 1,
  "overview_version": "atlas-1-0123456789ab",
  "revision": "abcdef012345",
  "comments": [
    {"id": "purpose", "text": "这里需要解释借阅对象。"},
    {"id": "overall", "text": "希望先看当前进展。"}
  ]
}
```
````

批注中的换行和围栏会被 JSON 转义，不能改变信封结构；`overall` 是整体意见。输入中的未提交批注也会复制。批注只存在当前页面内存，不持久化到本机或网络，刷新前请复制。

`atlas feedback [file|-] [--json]`（默认 stdin）输出每条 `{id,text,lines:[start,end]}`，行号是当前源文件围栏开闭行，含端点；整体意见或已删除卡片返回 `lines:null`。概览版本、revision 不同或卡片已删除时返回提示，不静默忽略。解析仅提供位置，不执行批注文字；未知信封版本或非法字段报错。
