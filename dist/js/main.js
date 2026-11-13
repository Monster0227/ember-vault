// 入口。场景流程：boot（预加载）→ menu → play ⇄ gameover。
// 加新场景：新建 js/scenes/xxx.js（末尾 G.engine.register('xxx', 类名)），在 index.html 里加一行 <script>，
// 需要时调用 G.engine.go('xxx', 参数)。
G.engine.start('boot');
