# Atlas 文字布局回归

`make test` 使用 `atlas-fixture.mjs`，覆盖八种显示组合与默认/局部/全部展开，除节点几何外也检查 `scene.texts` 的两两相交和所属 frame 边界。包含标题、副标题、显式分组名、直接子计数、时间线日期与所有 cross 标签（即使默认隐藏）。

`atlas-browser.mjs` 是补充的实际浏览器测试：由已有浏览器宿主传入显示生成物的 Page，调用 `runTextMatrix(page, {partial: 'pipeline'})`。函数返回 24 项结果，调用方必须断言每项 `pass`，并将 JSON 留在仓库外。它不安装或启动浏览器，不增加项目依赖。

浏览器夹具可用以下模块生成：

```js
import {parse, render, RENDERER} from '../skills/c-project-atlas/scripts/atlas.mjs';
import {source} from './atlas-fixture.mjs';
const html = render({...parse(source), renderer:RENDERER, sourceBase:'.',
  version:'text-fixture', revision:'0000000', generated:'2026-01-02'});
// 由宿主将 html 写到仓库外临时文件并导航至该文件。
```

`atlas-text-geometry.mjs` 使用每个可见 SVG text 的实际 `getBBox()` 和变换矩阵，统一到 world 坐标；不能用布局模型中的估算值代替实际文字测量。检查所有文字互不重叠、不超出所属 frame/整图、没有漏登记文字，并确认实际文字落在布局预留范围内。容差为 0.5 world 单位，用于浏览器浮点与坐标变换误差。

矩阵在每个状态执行一次默认隐藏关系的检查，再对所有可见 cross 端点逐个派发 pointerenter/pointerleave，调用页面真实事件处理器并重新测量。关系可同时显示的文字也纳入断言；不会通过改 CSS 强制展示。正式交付还需用宿主实际鼠标及截图审查关键视图。

这里验证画布 SVG 文字，工具栏/详情面板不属于自动布局区块。测试通过不能证明任意机器字体、真机或读屏可用性，也不等于内容事实或模型行为评估通过。
