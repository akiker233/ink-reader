/*
 * Markdown 解析器自测（零依赖，直接跑 Node）：npm run test:md
 *
 * 断言全部是对 renderMarkdown / parseMarkdownChapters / stripMarkdown / safeUrl 的字符串级检查。
 * 其中「安全性」一节是重点：解析器的正确性崩了顶多排版乱，
 * XSS 漏了就是真事故，所以每个伪协议和事件属性都单独有一条断言盯着。
 */
const SRC = new URL('../src/utils/markdown.js', import.meta.url).href
const { renderMarkdown, parseMarkdownChapters, parseBookChapters, stripMarkdown, safeUrl } = await import(SRC)

let pass = 0
let fail = 0
function ok(name, cond, extra = '') {
  if (cond) {
    pass += 1
    console.log('  ok  ' + name)
  } else {
    fail += 1
    console.log('  FAIL ' + name + (extra ? '\n        ' + extra : ''))
  }
}
function has(html, needle, name) {
  const flat = html.replace(/\n/g, '')
  ok(name, flat.includes(needle), 'not found: ' + needle + '\n        got: ' + html.slice(0, 400))
}
function not(html, needle, name) {
  const flat = html.replace(/\n/g, '')
  ok(name, !flat.includes(needle), 'unexpectedly found: ' + needle + '\n        got: ' + html.slice(0, 400))
}

console.log('\n== 块级 ==')
{
  const h = renderMarkdown('# 一级\n## 二级\n###### 六级')
  has(h, '<h1>一级</h1>', 'h1')
  has(h, '<h2>二级</h2>', 'h2')
  has(h, '<h6>六级</h6>', 'h6')
}
{
  const h = renderMarkdown('# 中文标题 #\n\n正文')
  has(h, '<h1>中文标题</h1>', 'ATX 闭合井号被吃掉')
}
{
  const h = renderMarkdown('标题\n====\n\n副标题\n----')
  has(h, '<h1>标题</h1>', 'setext h1')
  has(h, '<h2>副标题</h2>', 'setext h2')
}
{
  const h = renderMarkdown('---\n\n***')
  ok('分割线', (h.match(/<hr>/g) || []).length === 2, h)
}
{
  const md = '```js\nconst a = "# 不是标题"\n// 注释\nconsole.log("hi", 42)\n```'
  const h = renderMarkdown(md)
  has(h, '<pre class="code"><code class="lang-js">', '围栏代码块 + 语言类名')
  has(h, 'tok--kw">const</span>', '关键字着色')
  has(h, 'tok--st">&quot;hi&quot;</span>', '字符串着色且已转义')
  has(h, 'tok--nu">42</span>', '数字着色')
  has(h, 'tok--cm">// 注释</span>', '行注释着色')
  not(h, '<h1>', '围栏里的 # 不产生标题')
}
{
  const h = renderMarkdown('```\n<div>a</div>\n```')
  has(h, '&lt;div&gt;a&lt;/div&gt;', '代码块内的 HTML 原样转义')
}
{
  const h = renderMarkdown('> 引用第一行\n> 引用第二行\n\n外边的段落')
  has(h, '<blockquote><p>引用第一行<br>引用第二行</p></blockquote>', '引用块合并为一段')
  has(h, '<p>外边的段落</p>', '引用块后段落仍在外面')
}
{
  const h = renderMarkdown('> 引用\n# 标题在外面')
  has(h, '<h1>标题在外面</h1>', '引用块的懒延续不吃掉标题')
  not(h, '<blockquote><p>引用<br># 标题在外面', '标题没被吞进引用')
}
{
  const md = '- 第一项\n- 第二项\n  - 嵌套一\n  - 嵌套二\n- 第三项'
  const h = renderMarkdown(md)
  has(h, '<ul><li>第一项</li>', '无序列表')
  has(h, '<li>第二项<ul><li>嵌套一</li><li>嵌套二</li></ul></li>', '两级嵌套列表')
  has(h, '<li>第三项</li>', '嵌套后回到第一级')
}
{
  const h = renderMarkdown('1. 一\n2. 二')
  has(h, '<ol><li>一</li><li>二</li></ol>', '紧凑有序列表')
}
{
  const h = renderMarkdown('5. 五\n6. 六')
  has(h, '<ol start="5"><li>五</li>', '有序列表起始序号')
}
{
  const h = renderMarkdown('1. 一\n\n2. 二')
  has(h, '<li><p>一</p></li>', '空行分隔的同类列表仍是同一个列表（松散条目用段落包）')
}
{
  const h = renderMarkdown('- [ ] 未完成\n- [x] 已完成')
  has(h, '<input type="checkbox" disabled>', '任务列表未勾选')
  has(h, '<input type="checkbox" disabled checked>', '任务列表已勾选')
}
{
  const h = renderMarkdown('| 左 | 中 | 右 |\n| :-- | :-: | --: |\n| a | b | c |')
  has(h, '<table>', '表格')
  has(h, 'style="text-align:left">左', '表头左对齐')
  has(h, 'style="text-align:center">中', '表头居中')
  has(h, 'style="text-align:right">右', '表头右对齐')
  has(h, '<td style="text-align:center">b</td>', '单元格对齐')
}
{
  const h = renderMarkdown('术语\n: 定义一\n: 定义二')
  has(h, '<dl><dt>术语</dt><dd>定义一</dd><dd>定义二</dd></dl>', '定义列表')
}
{
  const h = renderMarkdown('第一行\n第二行\n\n新段落')
  has(h, '<p>第一行<br>第二行</p>', '段落内软换行变 <br>')
  has(h, '<p>新段落</p>', '空行分段')
}

console.log('\n== 行内 ==')
{
  const h = renderMarkdown('**粗** __也粗__ *斜* _也斜_ ~~删~~ ***又粗又斜***')
  has(h, '<strong>粗</strong>', '星号粗体')
  has(h, '<strong>也粗</strong>', '下划线粗体')
  has(h, '<em>斜</em>', '星号斜体')
  has(h, '<em>也斜</em>', '下划线斜体')
  has(h, '<del>删</del>', '删除线')
  has(h, '<strong><em>又粗又斜</em></strong>', '三连星号')
}
{
  const h = renderMarkdown('这是 `code *not em*` 行内代码')
  has(h, '<code>code *not em*</code>', '行内代码不解析内部标记')
}
{
  const h = renderMarkdown('看看 [链接](https://example.com) 和 <https://auto.example.com>')
  has(h, '<a href="https://example.com" target="_blank" rel="noopener noreferrer">链接</a>', '显式链接')
  has(h, 'href="https://auto.example.com"', '尖括号自动链接')
}
{
  const h = renderMarkdown('裸链接 https://bare.example.com/a?b=1 后面还有字')
  has(h, 'href="https://bare.example.com/a?b=1"', '裸 URL 识别')
  has(h, '后面还有字</p>', '裸 URL 后面的文字没被吃掉')
}
{
  const h = renderMarkdown('![截图](https://img.example.com/a.png)')
  has(h, 'rel="noopener noreferrer">🖼 截图</a>', '图片降级为带图标的文字链接')
  ok('图片不产生 img 标签', !h.includes('<img'), h)
  const bad = renderMarkdown('![x](javascript:alert(1))')
  has(bad, 'class="img-ref"', '地址不合法时降级为纯文字标记')
}
{
  const h = renderMarkdown('变量 foo_bar 里的下划线不该变斜体')
  not(h, '<em>', 'foo_bar 不误判为斜体')
  has(h, 'foo_bar', 'foo_bar 原样输出')
}
{
  const h = renderMarkdown('foo *bar* baz', { query: 'bar' })
  has(h, '<em><mark>bar</mark></em>', '检索高亮命中正文文本节点')
}
{
  const h = renderMarkdown('This is plain text with keyword', { query: 'keyword' })
  has(h, '<mark>keyword</mark>', '纯文本节点检索高亮')
}
{
  const h = renderMarkdown('这句 ==很重要== 请记住')
  has(h, '<mark class="hl">很重要</mark>', '==高亮== 渲染为带类名的 mark')
  has(h, '这句 <mark class="hl">很重要</mark> 请记住</p>', '高亮前后的正文都没被吃掉')
}
{
  ok('单独一个 = 不触发高亮', !renderMarkdown('a = b').includes('mark'))
  ok('四个等号不触发高亮', !renderMarkdown('=====').includes('mark'))
  ok('未闭合的 == 原样输出', renderMarkdown('未闭合 ==内容').includes('==内容'))
  const h = renderMarkdown('==**粗**体==', { query: '粗' })
  has(h, '<mark class="hl"><strong><mark>粗</mark></strong>体</mark>', '高亮里可以嵌粗体，检索命中仍生效')
  const esc = renderMarkdown('==<script>alert(1)</script>==')
  not(esc, '<script>', '高亮内容照样转义')
}

console.log('\n== 脚注 ==')
{
  const h = renderMarkdown('正文有引用[^a]，还有[^b]。\n\n[^a]: 第一条\n[^b]: 第二条')
  has(h, '<sup class="fn-ref"><a id="fnref-1" href="#fn-1">1</a></sup>', '脚注引用编号')
  has(h, '<section class="footnotes"><h4>脚注</h4><ol>', '脚注区')
  has(h, '<li id="fn-1">第一条', '脚注内容')
}
{
  const h = renderMarkdown('没有定义的引用[^nope]')
  has(h, '[^nope]', '未定义的脚注原样输出')
  not(h, '<section class="footnotes">', '未定义时不生成脚注区')
}

console.log('\n== 安全 ==')
{
  const h = renderMarkdown('<script>alert(1)</script>')
  not(h, '<script>', 'script 标签被转义')
  has(h, '&lt;script&gt;', 'script 变成字面量')
}
{
  const h = renderMarkdown('<img src=x onerror=alert(1)>')
  not(h, '<img', 'img 标签被转义')
}
{
  const h = renderMarkdown('[点我](javascript:alert(1))')
  not(h, 'href="javascript', 'javascript: 链接被拦下')
  has(h, '点我', '被拦下的链接降级为文字')
}
{
  const h = renderMarkdown('![x](javascript:alert(1))')
  not(h, 'href="javascript', '图片的伪协议也被拦下')
}
{
  const h = renderMarkdown('[d](data:text/html;base64,PHNjcmlwdD4=)')
  not(h, 'data:text/html', 'data: 协议被拦下')
}
{
  const h = renderMarkdown('<a href="javascript:alert(1)">x</a>')
  not(h, '<a href', '内联 HTML 不透传')
}
{
  ok('safeUrl 放行 https', safeUrl('https://a.com') === 'https://a.com')
  ok('safeUrl 放行锚点', safeUrl('#fn-1') === '#fn-1')
  ok('safeUrl 放行相对路径', safeUrl('./a/b.md') === './a/b.md')
  ok('safeUrl 拦 javascript', safeUrl('javascript:x') === '')
  ok('safeUrl 拦 vbscript', safeUrl('vbscript:x') === '')
  ok('safeUrl 拦 file', safeUrl('file:///etc/passwd') === '')
}

console.log('\n== 畸零输入 ==')
{
  ok('空串有兜底', renderMarkdown('').includes('empty-chapter'))
  ok('null 有兜底', renderMarkdown(null).includes('empty-chapter'))
  ok('undefined 有兜底', renderMarkdown(undefined).includes('empty-chapter'))
  const h = renderMarkdown('```\n没闭合的代码块')
  has(h, '<pre class="code">', '未闭合围栏也能出块')
  const h2 = renderMarkdown('**没闭合的加粗')
  has(h2, '**没闭合的加粗', '未闭合强调原样输出')
  const h3 = renderMarkdown('| 只有表头 |\n| --- |')
  has(h3, '<table>', '只有表头的表格')
  const h4 = renderMarkdown('> \n> 空引用')
  has(h4, '<blockquote>', '空引用行不炸')
  const a = renderMarkdown('很长的单行 ' + 'x'.repeat(20000) + ' 结尾')
  has(a, '结尾', '超长单行不丢内容')
  ok('超长单行不超时', true)
}

console.log('\n== 章节识别 ==')
{
  const md = '# 书名\n\n简介在这里\n\n## 第一章\n内容一\n\n## 第二章\n内容二\n\n## 第三章\n内容三'
  const chs = parseMarkdownChapters(md)
  ok('层级选命中最多的一层', chs.length === 4, JSON.stringify(chs.map((c) => c.title)))
  ok('第一个是前言', chs[0].title === '前言', chs[0].title)
  ok('后续是三个二级标题', chs.slice(1).map((c) => c.title).join(',') === '第一章,第二章,第三章')
  ok('切片覆盖全文', chs[chs.length - 1].end === md.length)
  ok('前言不含标题行', md.slice(chs[0].head, chs[0].end).includes('简介在这里'), md.slice(chs[0].head, chs[0].end))
  ok('章节正文不含标题行', !md.slice(chs[1].head, chs[1].end).includes('## 第一章'), md.slice(chs[1].head, chs[1].end))
  ok('章节正文含内容', md.slice(chs[1].head, chs[1].end).includes('内容一'))
}
{
  const md = '# 一\n\n```\n# 代码里的井号\n```\n\n# 二'
  const chs = parseMarkdownChapters(md)
  ok('围栏里的 # 不算章节', chs.length === 2, JSON.stringify(chs.map((c) => c.title)))
  ok('标题不是代码里的那个', chs.map((c) => c.title).join(',') === '一,二', chs.map((c) => c.title).join(','))
}
{
  const md = '# 唯一标题\n\n正文'
  const chs = parseMarkdownChapters(md)
  ok('只有一层标题时用最浅层', chs.length === 1 && chs[0].title === '唯一标题', JSON.stringify(chs))
}
{
  const md = '普通文本没有井号\n\n第二段'
  const chs = parseMarkdownChapters(md)
  ok('无标题回退到纯文本分章', chs.length >= 1, JSON.stringify(chs.map((c) => c.title)))
}
{
  const md = '第一章 纯文本式\n内容\n\n第二章 还是\n内容'
  const chs = parseMarkdownChapters(md)
  ok('md 里用正则也能识别出章节', chs.length === 2, JSON.stringify(chs.map((c) => c.title)))
}
{
  const md = '标题甲\n===\n\n内容甲\n\n标题乙\n===\n\n内容乙'
  const chs = parseMarkdownChapters(md)
  ok('setext 标题也能成章', chs.length === 2, JSON.stringify(chs.map((c) => c.title)))
}
{
  const md = '## 甲 ##\n内容\n\n## 乙 ##\n内容'
  const chs = parseMarkdownChapters(md)
  ok('闭合井号从章节名里去掉', chs[0].title === '甲', chs[0].title)
}

console.log('\n== 目录来源（chapterSource） ==')
{
  const md = '# 书名\n\n简介在这里\n\n第一章 出发\n内容一\n\n第二章 到达\n内容二'

  const byHeading = parseBookChapters(md, 'markdown')
  ok('md 默认按 # 标题切分', byHeading.length === 1 && byHeading[0].title === '书名', JSON.stringify(byHeading.map((c) => c.title)))

  const byPlain = parseBookChapters(md, 'markdown', 'plain')
  ok(
    'md + plain 改按正文里的章名切分（首章之前的书名简介成为「序」）',
    byPlain.map((c) => c.title).join(',') === '序,第一章 出发,第二章 到达',
    JSON.stringify(byPlain.map((c) => c.title))
  )
  ok('换口径后正文仍覆盖全文', byPlain[byPlain.length - 1].end === md.length, String(byPlain[byPlain.length - 1].end))
  ok('章名行不进正文', !md.slice(byPlain[1].head, byPlain[1].end).includes('第一章 出发'), md.slice(byPlain[1].head, byPlain[1].end))
  ok('章节内容还在', md.slice(byPlain[1].head, byPlain[1].end).includes('内容一'))

  const asText = parseBookChapters(md, 'text', 'heading')
  ok(
    '纯文本书忽略 chapterSource',
    asText.map((c) => c.title).join(',') === '序,第一章 出发,第二章 到达',
    JSON.stringify(asText.map((c) => c.title))
  )

  const noMark = '# 书名\n\n只有简介没有章名'
  const chunks = parseBookChapters(noMark, 'markdown', 'plain')
  ok('正文也没章名时按字数切节兜底', chunks.length === 1 && chunks[0].title === '第 1 节', JSON.stringify(chunks.map((c) => c.title)))

  /*
   * 按正文规则切分的 Markdown：正文里的章名本身带 ATX 标题符（## 第一章 出发）。
   * 规则是行锚定的，看不见行首的 #，所以拿去匹配前要先摘掉；但下标不能跟着变，
   * 否则整章会错位、正文里会多出半行标记。
   */
  const atx = '## 第一章 出发\n\n内容一\n\n## 第二章 到达\n\n内容二'
  const atxPlain = parseBookChapters(atx, 'markdown', 'plain')
  ok(
    'plain 口径认得出行首 # 的章名',
    atxPlain.map((c) => c.title).join(',') === '第一章 出发,第二章 到达',
    JSON.stringify(atxPlain.map((c) => c.title))
  )
  ok('章节起点算在行首的 # 上，不会凭空多出一个只剩标记的「序」', atxPlain[0].start === 0, String(atxPlain[0].start))
  ok('章名行不进正文', !atx.slice(atxPlain[0].head, atxPlain[0].end).includes('第一章 出发'), JSON.stringify(atx.slice(atxPlain[0].head, atxPlain[0].end)))
  ok('章节内容完整', atx.slice(atxPlain[0].head, atxPlain[0].end).includes('内容一'))
  ok('末章仍覆盖到全文末尾', atxPlain[atxPlain.length - 1].end === atx.length, String(atxPlain[atxPlain.length - 1].end))

  const atxText = parseBookChapters(atx, 'text')
  ok(
    '纯文本口径同样认得出（导入 md 后手动切成纯文本渲染）',
    atxText.map((c) => c.title).join(',') === '第一章 出发,第二章 到达',
    JSON.stringify(atxText.map((c) => c.title))
  )

  // # 之后必须有空白才算 ATX 标题（CommonMark 如此），#5. 这种不该被当成章名
  const hashNoSpace = '#5. 他说\n\n内容\n\n#6. 她说\n\n内容'
  ok('# 后无空格时不按章名处理', !parseBookChapters(hashNoSpace, 'text').some((c) => c.title.includes('他说')), JSON.stringify(parseBookChapters(hashNoSpace, 'text').map((c) => c.title)))

  /*
   * 章节标题在目录/工具条/页面抬头都是当纯文本插值的，不解析行内标记。
   * 源文件里写 `## 四、==验收==` 时不清一遍，目录上就会挂着 `==` —— 正文里那对
   * `==` 已经被渲染成高亮，两边对不上就显得像 bug。
   */
  const marked = '## 四、==验收==\n\n内容\n\n## 五、**评分**标准\n\n内容'
  const markedCh = parseBookChapters(marked, 'markdown')
  ok(
    '标题里的行内标记被擦掉',
    markedCh.map((c) => c.title).join(',') === '四、验收,五、评分标准',
    JSON.stringify(markedCh.map((c) => c.title))
  )
  ok('擦标记不影响下标', markedCh[0].start === 0 && marked.slice(markedCh[0].head, markedCh[0].end).includes('内容'), String(markedCh[0].start))
  ok(
    '纯文本口径的标题同样擦干净',
    parseBookChapters('==第一章== 出发\n\n内容\n\n第二章 到达\n\n内容', 'text').map((c) => c.title).join(',') === '第一章 出发,第二章 到达',
    JSON.stringify(parseBookChapters('==第一章== 出发\n\n内容\n\n第二章 到达\n\n内容', 'text').map((c) => c.title))
  )
}

console.log('\n== 分章模板的选取（带 # 的命中优先） ==')
{
  /*
   * 导入 Markdown 后切成「正文规则」分章时，正文里的 `1.` `2.` 列表项会命中编号模板，
   * 数量上常压过真正的 `## 一、` 标题。这类文件（比如一份考核题）应该仍按标题分章。
   */
  const md = ['## 一、考核对象与周期', '正文', '', '## 二、项目选择', '正文', '', '1. 源码仓库', '2. README', '3. 部署链接'].join('\n')
  const chs = parseBookChapters(md, 'markdown', 'plain')
  ok(
    '正文里的编号列表不抢走分章（按带 # 的那套模板）',
    chs.map((c) => c.title).join(',') === '一、考核对象与周期,二、项目选择',
    JSON.stringify(chs.map((c) => c.title))
  )
  ok('换模板后正文仍覆盖全文', chs[chs.length - 1].end === md.length, String(chs[chs.length - 1].end))

  // 列表行再多也压不过带 # 的标题
  const many = ['## 一、甲', '', '## 二、乙', '', '1. a', '2. b', '3. c', '4. d', '5. e', '6. f'].join('\n')
  ok(
    '列表再多也压不过带 # 的章名',
    parseBookChapters(many, 'text').map((c) => c.title).join(',') === '一、甲,二、乙',
    JSON.stringify(parseBookChapters(many, 'text').map((c) => c.title))
  )

  // 没有 # 时（纯 txt 的写法）行为不变：编号模板照旧按数量胜出
  const txt = ['1. 列表一', '正文', '', '2. 列表二', '正文', '', '一、甲', '正文', '', '二、乙', '正文'].join('\n')
  ok(
    '纯 txt 无 # 时行为不变（编号模板仍胜出）',
    parseBookChapters(txt, 'text').map((c) => c.title).join(',') === '1. 列表一,2. 列表二',
    JSON.stringify(parseBookChapters(txt, 'text').map((c) => c.title))
  )
}

console.log('\n== stripMarkdown ==')
{
  ok('去掉标题符', stripMarkdown('# 标题') === '标题')
  ok('去掉强调符', stripMarkdown('**粗** 和 *斜*') === '粗 和 斜')
  ok('保留链接文字', stripMarkdown('[文字](http://a.com)') === '文字')
  ok('去掉行内代码符', stripMarkdown('`code`') === 'code')
  const bare = stripMarkdown('前\n```\ncode\n```\n后')
  ok('去掉代码块', bare.includes('前') && bare.includes('后') && !bare.includes('code') && !bare.includes('```'), JSON.stringify(bare))
}

console.log('\n== 性能兜底 ==')
{
  const big = ('# 标题\n\n段落内容 **加粗** [链接](https://a.com)\n\n- 列表项\n\n').repeat(4000)
  const t0 = Date.now()
  const html = renderMarkdown(big)
  const dt = Date.now() - t0
  ok('8000 行文档可解析', html.length > 1000 && dt < 5000, dt + 'ms')
  console.log('       渲染 8000 行耗时 ' + dt + 'ms，产物 ' + html.length + ' 字符')
}

console.log('\n通过 ' + pass + ' / 失败 ' + fail)
process.exit(fail ? 1 : 0)
