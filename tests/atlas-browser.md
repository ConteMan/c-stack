# Atlas 关联高亮与文字布局回归

`make test` 使用 `atlas-fixture.mjs`，覆盖八种显示组合与默认/局部/全部展开。除了节点几何，检查所有 `scene.texts` 的两两相交与所属 frame 边界；在关联高亮状态下再次验证。包含标题、副标题、显式分组名、直接子计数和时间线日期。关联标记预留布局空间，不能碰到文字或超出区块。

`atlas-browser.mjs` 为宿主已有浏览器提供 `runTextMatrix(page, {partial: 'pipeline'})`，不安装或启动浏览器，也不增加项目依赖。函数返回24项结果，调用方必须断言每项 `pass`，把JSON留在仓库外。它调用页面真实按钮/指针处理器，浏览器实际字形测量由 `atlas-text-geometry.mjs` 完成。

浏览器夹具可由以下模块构建，交给宿主写到仓库外临时文件并导航：

```js
import {parse, render, RENDERER} from '../skills/c-project-atlas/scripts/atlas.mjs';
import {source} from './atlas-fixture.mjs';
const html = render({...parse(source), renderer:RENDERER, sourceBase:'.',
  version:'association-fixture', revision:'0000000', generated:'2026-01-02'});
```

测量每个可见 SVG text 的实际 `getBBox()`，用变换矩阵统一到 world 坐标。检查文字两两不重叠、不越出所属 frame/整图、没有漏登记文字、实际字形落在预留范围内。浮点与坐标变换容差为0.5 world单位。淡出的文字仍然纳入检查。

每个状态对当前可见的每个 cross 端点分别触发 pointerenter/pointerleave：另一端即使被折叠也应可见且强调描边，其余节点淡出，预览不改变手动展开集合，移开后恢复可见节点与折叠。另测选中状态、详情跳转和取消选中恢复。夹具“个人书目”的关联“读者”默认在折叠层级中，因此不会只验证已经可见的目标。

所有状态均断言画布没有 cross 线段/箭头，标记与文字不相交、不越出区块，空心标记的描边/填充对比度至少4.5:1，且有足够线宽。正式交付还需使用宿主实际鼠标验证折叠目标，并截图审查关键视图；自动派发事件不能替代原生鼠标检验。

这些检查针对自动布局画布；工具栏/详情不属于图中区块。通过不等于任意字体、真机、读屏或模型行为评估通过。
