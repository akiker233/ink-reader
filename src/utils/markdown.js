import { escapeHtml, escapeRegExp, MAX_SEGMENT, parseChapters, countChars } from './text.js'

/**
 * 精简 Markdown 解析器（零依赖）。
 *
 * 为什么自己写：产物里不想平白多出 50KB；更要紧的是，解析结果要塞进 v-html，
 * 必须由我们保证「任何输入都只产出白名单标签」—— 把安全边界握在自己手里，
 * 比交给一个库的配置项更可控、也更容易讲清。
 *
 * 安全模型（三条，缺一不可）：
 *   1. 所有文本先 escapeHtml 再拼装：原文里的 <script>、<img onerror> 只会变成字面量；
 *   2. 不支持内联 HTML（按 CommonMark 的可选行为直接转义），所以不存在「标签透传」这条路；
 *   3. 链接地址过一遍 safeUrl，javascript: / data: / vbscript: 一律降级为纯文本。
 *
 * 支持的语法见 README，这里刻意不追求 100% CommonMark 兼容。
 */

const SPECIAL_INLINE = '`![<*_~h'

/* ------------------------------------------------------------------ 入口 */

export function renderMarkdown(source, { query = '' } = {}) {
  const lines = normalize(source)
  const ctx = { query, notes: new Map(), order: [] }
  const skip = collectFootnotes(lines, ctx)
  const body = parseBlocks(lines, ctx, skip)
  const notes = renderFootnotes(ctx)
  const html = body + notes
  return html || '<p class="empty-chapter">（本章没有正文内容）</p>'
}

/**
 * 脚注定义通常写在引用它的段落之后，所以必须先全文扫一遍再渲染，
 * 否则引用处拿不到定义，只能原样输出 [^x]。
 */
function collectFootnotes(lines, ctx) {
  const skip = new Set()
  let i = 0
  while (i < lines.length) {
    const def = matchFootnoteDef(lines[i])
    if (!def) {
      i += 1
      continue
    }
    const parts = [def.text]
    skip.add(i)
    let j = i + 1
    while (j < lines.length && /^\s{2,}\S/.test(lines[j])) {
      parts.push(lines[j].trim())
      skip.add(j)
      j += 1
    }
    if (!ctx.notes.has(def.id)) ctx.notes.set(def.id, parts.join(' '))
    i = j
  }
  return skip
}

function normalize(source) {
  return String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n')
}

/* ------------------------------------------------------------ 块级解析 */

function parseBlocks(lines, ctx, skip) {
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim() || skip.has(i) || matchFootnoteDef(line)) {
      i += 1
      continue
    }

    // 围栏代码块必须最先判断：里面的 # 、| 、> 都不该被当成块级语法
    const fence = matchFence(line)
    if (fence) {
      const [html, next] = parseFence(lines, i, fence)
      out.push(html)
      i = next
      continue
    }

    if (isThematicBreak(line)) {
      out.push('<hr>')
      i += 1
      continue
    }

    const heading = matchAtxHeading(line)
    if (heading) {
      out.push(`<h${heading.level}>${inline(heading.text, ctx)}</h${heading.level}>`)
      i += 1
      continue
    }

    const setext = matchSetext(lines, i)
    if (setext) {
      out.push(`<h${setext.level}>${inline(setext.text, ctx)}</h${setext.level}>`)
      i = setext.next
      continue
    }

    if (/^\s{0,3}>/.test(line)) {
      const [html, next] = parseQuote(lines, i, ctx)
      out.push(html)
      i = next
      continue
    }

    if (isTableStart(lines, i)) {
      const [html, next] = parseTable(lines, i, ctx)
      out.push(html)
      i = next
      continue
    }

    if (matchListItem(line)) {
      const [html, next] = parseList(lines, i, ctx)
      out.push(html)
      i = next
      continue
    }

    if (isDefListStart(lines, i)) {
      const [html, next] = parseDefList(lines, i, ctx)
      out.push(html)
      i = next
      continue
    }

    const [html, next] = parseParagraph(lines, i, ctx)
    out.push(html)
    i = next
  }

  return out.join('\n')
}

/** 这一行会不会打断正在累积的段落 */
function startsBlock(lines, i) {
  const line = lines[i]
  if (!line.trim()) return true
  if (matchFence(line)) return true
  if (isThematicBreak(line)) return true
  if (matchAtxHeading(line)) return true
  if (matchFootnoteDef(line)) return true
  if (/^\s{0,3}>/.test(line)) return true
  if (matchListItem(line)) return true
  if (isTableStart(lines, i)) return true
  return false
}

function parseParagraph(lines, start, ctx) {
  let i = start
  const buf = []
  while (i < lines.length && !startsBlock(lines, i)) {
    buf.push(lines[i].trim())
    i += 1
  }
  // 段落内的软换行保留为 <br>，中文笔记里常靠换行断句
  const text = buf.join('\n')
  const parts = text.split('\n').map((part) => inline(part, ctx))
  return [`<p>${parts.join('<br>')}</p>`, i]
}

/* ------------------------------------------------------------ 围栏代码 */

function matchFence(line) {
  const m = /^\s{0,3}(`{3,}|~{3,})\s*(.*)$/.exec(line)
  if (!m) return null
  const marker = m[1][0]
  // 反引号围栏的 info string 里不允许再出现反引号
  if (marker === '`' && m[2].includes('`')) return null
  return { marker, len: m[1].length, info: m[2].trim() }
}

function isFenceClose(line, fence) {
  const m = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line)
  return Boolean(m) && m[1][0] === fence.marker && m[1].length >= fence.len
}

function parseFence(lines, start, fence) {
  const body = []
  let i = start + 1
  while (i < lines.length && !isFenceClose(lines[i], fence)) {
    body.push(lines[i])
    i += 1
  }
  const lang = fence.info.split(/\s+/)[0] || ''
  const code = body.join('\n')
  const cls = lang ? ` class="lang-${escapeHtml(lang.toLowerCase())}"` : ''
  return [`<pre class="code"><code${cls}>${highlightCode(code, lang)}</code></pre>`, Math.min(i + 1, lines.length)]
}

/* ------------------------------------------------------------ 引用块 */

function parseQuote(lines, start, ctx) {
  const inner = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s{0,3}>/.test(line)) {
      inner.push(line.replace(/^\s{0,3}>\s?/, ''))
      i += 1
      continue
    }
    // 懒延续：引用块里没写 > 的续行也算引用；但标题、列表这些块级开头要让它出去
    if (line.trim() && inner.length && !startsBlock(lines, i)) {
      inner.push(line)
      i += 1
      continue
    }
    break
  }
  return [`<blockquote>${parseBlocks(inner, ctx, NO_SKIP)}</blockquote>`, i]
}

/** 引用块内部是重新切出来的一份行数组，原来的下标映射不再适用 */
const NO_SKIP = new Set()

/* ------------------------------------------------------------ 列表 */

function matchListItem(line) {
  const m = /^(\s*)([-+*]|\d{1,9}[.)])\s+(.*)$/.exec(line)
  if (!m) return null
  return {
    indent: m[1].replace(/\t/g, '    ').length,
    ordered: /\d/.test(m[2]),
    start: m[2].charCodeAt(0) - 48,
    marker: m[2],
    text: m[3]
  }
}

function nextContentLine(lines, from) {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i].trim()) return i
  }
  return null
}

function parseList(lines, start, ctx) {
  const first = matchListItem(lines[start])
  const base = first.indent
  const ordered = first.ordered
  const items = []
  let loose = false
  let i = start

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      // 空行要看后面还有没有同级条目：有就是「松散列表」，没有就结束
      const next = nextContentLine(lines, i)
      if (next == null) break
      const probe = matchListItem(lines[next])
      if (probe && probe.indent >= base && probe.ordered === ordered) {
        loose = true
        i = next
        continue
      }
      break
    }

    const item = matchListItem(line)
    if (item && item.indent >= base && item.ordered === ordered) {
      if (item.indent > base) {
        // 更深一层：交给子列表，挂在最后一个条目上
        const [html, next] = parseList(lines, i, ctx)
        if (items.length) items[items.length - 1].children.push(html)
        i = next
        continue
      }
      items.push({ text: [item.text], children: [] })
      i += 1
      continue
    }

    if (item) {
      // 换了一种列表类型（有序 ↔ 无序），同级也要另起一个列表
      break
    }

    // 非列表行：当作上一个条目的续行
    if (items.length) {
      items[items.length - 1].text.push(line.trim())
      i += 1
      continue
    }
    break
  }

  const tag = ordered ? 'ol' : 'ul'
  const attr = ordered && first.start !== 1 ? ` start="${first.start}"` : ''
  const body = items
    .map((it) => {
      const content = renderItemContent(it.text, loose, ctx)
      return `<li>${content}${it.children.join('')}</li>`
    })
    .join('\n')
  return [`<${tag}${attr}>${body}</${tag}>`, i]
}

/** 任务列表 - [ ] / - [x] 在这里拆成复选框；松散条目的多行用段落包起来 */
function renderItemContent(textLines, loose, ctx) {
  const task = /^\[([ xX])\]\s+(.*)$/.exec(textLines[0])
  let head = textLines[0]
  let box = ''
  if (task) {
    const checked = task[1].toLowerCase() === 'x'
    box = `<input type="checkbox" disabled${checked ? ' checked' : ''}>`
    head = task[2]
  }
  const joined = [head, ...textLines.slice(1)].join('\n')
  const html = joined
    .split('\n')
    .map((line) => inline(line, ctx))
    .join('<br>')
  if (!box) return loose ? `<p>${html}</p>` : html
  return loose ? `<p class="task">${box}${html}</p>` : `<span class="task">${box}${html}</span>`
}

/* ------------------------------------------------------------ 表格 */

function isTableStart(lines, i) {
  if (i + 1 >= lines.length) return false
  return splitRow(lines[i]).length > 0 && isDelimiterRow(lines[i + 1])
}

function isDelimiterRow(line) {
  const cells = splitRow(line)
  if (!cells.length) return false
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell.replace(/\s/g, '')))
}

function splitRow(line) {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return []
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let buf = ''
  for (let k = 0; k < inner.length; k += 1) {
    const ch = inner[k]
    if (ch === '\\' && inner[k + 1] === '|') {
      buf += '|'
      k += 1
      continue
    }
    if (ch === '|') {
      cells.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  cells.push(buf)
  return cells.map((c) => c.trim())
}

function parseTable(lines, start, ctx) {
  const header = splitRow(lines[start])
  const aligns = splitRow(lines[start + 1]).map((cell) => {
    const c = cell.replace(/\s/g, '')
    if (c.startsWith(':') && c.endsWith(':')) return 'center'
    if (c.endsWith(':')) return 'right'
    if (c.startsWith(':')) return 'left'
    return ''
  })

  const rows = []
  let i = start + 2
  while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
    rows.push(splitRow(lines[i]))
    i += 1
  }

  const cell = (content, index, tag) => {
    const align = aligns[index]
    return `<${tag}${align ? ` style="text-align:${align}"` : ''}>${inline(content, ctx)}</${tag}>`
  }
  const head = `<thead><tr>${header.map((c, k) => cell(c, k, 'th')).join('')}</tr></thead>`
  const body = rows
    .map((row) => `<tr>${header.map((_, k) => cell(row[k] || '', k, 'td')).join('')}</tr>`)
    .join('')
  return [`<div class="table-wrap"><table>${head}<tbody>${body}</tbody></table></div>`, i]
}

/* ------------------------------------------------------------ 定义列表 */

function isDefListStart(lines, i) {
  if (i + 1 >= lines.length) return false
  if (!lines[i].trim() || startsBlock(lines, i)) return false
  return /^\s{0,3}[:~]\s+\S/.test(lines[i + 1])
}

function parseDefList(lines, start, ctx) {
  const pairs = []
  let i = start
  while (i < lines.length) {
    const term = lines[i]
    if (!term.trim() || startsBlock(lines, i) || !lines[i + 1] || !/^\s{0,3}[:~]\s+\S/.test(lines[i + 1])) break
    const defs = []
    i += 1
    while (i < lines.length && /^\s{0,3}[:~]\s+\S/.test(lines[i])) {
      defs.push(lines[i].replace(/^\s{0,3}[:~]\s+/, ''))
      i += 1
    }
    pairs.push({ term: term.trim(), defs })
  }
  const html = pairs
    .map(
      (p) =>
        `<dt>${inline(p.term, ctx)}</dt>` + p.defs.map((d) => `<dd>${inline(d, ctx)}</dd>`).join('')
    )
    .join('')
  return [`<dl>${html}</dl>`, i]
}

/* ------------------------------------------------------------ 脚注 */

function matchFootnoteDef(line) {
  const m = /^\s{0,3}\[\^([^\]]+)\]:\s?(.*)$/.exec(line)
  return m ? { id: m[1], text: m[2] } : null
}

function renderFootnotes(ctx) {
  if (!ctx.order.length) return ''
  const items = ctx.order
    .map((id, index) => {
      const text = ctx.notes.get(id) || ''
      return `<li id="fn-${index + 1}">${inline(text, ctx)} <a class="fn-back" href="#fnref-${index + 1}">↩</a></li>`
    })
    .join('')
  return `<section class="footnotes"><h4>脚注</h4><ol>${items}</ol></section>`
}

/* ------------------------------------------------------------ 行内解析 */

function inline(text, ctx) {
  let out = ''
  let i = 0

  while (i < text.length) {
    const rest = text.slice(i)
    let m

    // 行内代码优先级最高：里面的 * _ [ 都不再解释
    if (text[i] === '`' && (m = /^(`+)([\s\S]*?)\1/.exec(rest))) {
      out += `<code>${pw(m[2])}</code>`
      i += m[0].length
      continue
    }

    // 图片降级成文字链接（阅读器不联网取图，也不想让外链图片把版面撑乱）
    if (text[i] === '!' && (m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest))) {
      out += renderLink(m[2], m[1] || '图片', ctx, true)
      i += m[0].length
      continue
    }

    if (text[i] === '[' && (m = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest))) {
      out += renderLink(m[2], m[1], ctx)
      i += m[0].length
      continue
    }

    if (text[i] === '[' && (m = /^\[\^([^\]]+)\]/.exec(rest))) {
      out += renderFootnoteRef(m[1], ctx)
      i += m[0].length
      continue
    }

    if (text[i] === '<' && (m = /^<((?:https?|mailto):[^>\s]+)>/.exec(rest))) {
      out += renderLink(m[1], m[1], ctx)
      i += m[0].length
      continue
    }

    if (text[i] === '*' && (m = /^\*\*\*([\s\S]+?)\*\*\*/.exec(rest))) {
      out += `<strong><em>${inline(m[1], ctx)}</em></strong>`
      i += m[0].length
      continue
    }

    if (text[i] === '_' && (m = /^___([\s\S]+?)___/.exec(rest))) {
      out += `<strong><em>${inline(m[1], ctx)}</em></strong>`
      i += m[0].length
      continue
    }

    if (text[i] === '*' && (m = /^\*\*([\s\S]+?)\*\*/.exec(rest))) {
      out += `<strong>${inline(m[1], ctx)}</strong>`
      i += m[0].length
      continue
    }

    if (text[i] === '_' && (m = /^__([\s\S]+?)__/.exec(rest))) {
      out += `<strong>${inline(m[1], ctx)}</strong>`
      i += m[0].length
      continue
    }

    if (text[i] === '~' && (m = /^~~([\s\S]+?)~~/.exec(rest))) {
      out += `<del>${inline(m[1], ctx)}</del>`
      i += m[0].length
      continue
    }

    if (text[i] === '*' && isEmphasisOpen(text, i) && (m = /^\*([^*\n]+?)\*/.exec(rest))) {
      out += `<em>${inline(m[1], ctx)}</em>`
      i += m[0].length
      continue
    }
    if (text[i] === '_' && isEmphasisOpen(text, i) && (m = /^_([^_\n]+?)_(?![\w])/.exec(rest))) {
      out += `<em>${inline(m[1], ctx)}</em>`
      i += m[0].length
      continue
    }

    if (text[i] === 'h' && (m = /^https?:\/\/[^\s<>()（）「」，。；]+/.exec(rest))) {
      out += renderLink(m[0], m[0], ctx)
      i += m[0].length
      continue
    }

    // 普通文本：一口气吃到下一个可能有意义的字符，避免逐字符拼字符串
    const stop = nextSpecial(text, i + 1)
    out += pw(text.slice(i, stop), ctx.query)
    i = stop
  }

  return out
}

function nextSpecial(text, from) {
  for (let i = from; i < text.length; i += 1) {
    if (SPECIAL_INLINE.includes(text[i])) return i
  }
  return text.length
}

/** `_` 只在词边界上当强调用（foo_bar 这种标识符不该变斜体） */
function isEmphasisOpen(text, i) {
  return i === 0 || !/[\w]/.test(text[i - 1])
}

/** 文本节点：先转义，再顺手把检索命中词包成 mark */
function pw(text, query = '') {
  if (!query) return escapeHtml(text)
  const q = query.trim()
  if (!q) return escapeHtml(text)
  const re = new RegExp(escapeRegExp(q), 'gi')
  let out = ''
  let last = 0
  let count = 0
  let m
  while (count < 300 && (m = re.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index)) + `<mark>${escapeHtml(m[0])}</mark>`
    last = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex += 1
    count += 1
  }
  return out + escapeHtml(text.slice(last))
}

function renderFootnoteRef(id, ctx) {
  if (!ctx.notes.has(id)) return pw(`[^${id}]`)
  if (!ctx.order.includes(id)) ctx.order.push(id)
  const n = ctx.order.indexOf(id) + 1
  return `<sup class="fn-ref"><a id="fnref-${n}" href="#fn-${n}">${n}</a></sup>`
}

/**
 * 链接渲染。地址只允许 http/https/mailto/tel 与页内锚点，
 * javascript: 这类协议直接降级成纯文本 —— 否则正文里写个链接就能执行脚本。
 */
function renderLink(url, label, ctx, isImage = false) {
  const href = safeUrl(url)
  // 标签与地址相同时（自动链接、裸 URL）不能再走一遍行内解析，否则会再次命中 URL 分支无限递归
  const same = !label || label === url
  const text = same ? pw(label || url, ctx.query) : inline(label, ctx)
  if (!href) return isImage ? `<span class="img-ref">🖼 ${text}</span>` : text
  const icon = isImage ? '🖼 ' : ''
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${icon}${text}</a>`
}

export function safeUrl(raw) {
  const url = String(raw || '').trim()
  if (!url) return ''
  if (url.startsWith('#')) return url
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url
  // 相对路径也放行（本地 md 里常见），但挡掉带协议的伪协议写法
  if (/^[\w./-]+$/.test(url) && !url.includes(':')) return url
  return ''
}

/* ------------------------------------------------------------ 代码着色 */

/** 这些语言里 `#` 是注释；其它语言（如 css 的 #fff）不能当注释处理 */
const HASH_COMMENT_LANGS = new Set([
  'py', 'python', 'sh', 'bash', 'shell', 'zsh', 'yaml', 'yml', 'rb', 'ruby',
  'toml', 'ini', 'conf', 'dockerfile', 'makefile', 'r', 'pl', 'perl', 'ps1', 'properties'
])

const KEYWORDS = new Set(
  (
    'abstract arguments as assert async await break case catch class const continue def default del elif else ' +
    'enum except extends false final finally fn for from func global go if implements import in instanceof ' +
    'interface is lambda let new nil None not null or package pass private protected public raise return ' +
    'self static struct super switch this throw throws true try type typeof var void while with yield ' +
    'and do end module use where select insert update delete create table join on group order by limit'
  ).split(/\s+/)
)

/**
 * 通用词法着色：只认注释、字符串、数字、关键字，不区分语言语法。
 * 代价是着色比较浅，好处是几十行就能覆盖十来种语言，且不用为每种语言维护语法表。
 */
export function highlightCode(code, lang = '') {
  const hash = HASH_COMMENT_LANGS.has(String(lang).toLowerCase())
  let out = ''
  let i = 0

  while (i < code.length) {
    const ch = code[i]

    if (/\s/.test(ch)) {
      out += escapeHtml(ch)
      i += 1
      continue
    }

    if (ch === '/' && code[i + 1] === '/') {
      const end = lineEnd(code, i)
      out += tok('cm', code.slice(i, end))
      i = end
      continue
    }

    if (ch === '/' && code[i + 1] === '*') {
      const close = code.indexOf('*/', i + 2)
      const end = close < 0 ? code.length : close + 2
      out += tok('cm', code.slice(i, end))
      i = end
      continue
    }

    if (ch === '<' && code.startsWith('<!--', i)) {
      const close = code.indexOf('-->', i + 4)
      const end = close < 0 ? code.length : close + 3
      out += tok('cm', code.slice(i, end))
      i = end
      continue
    }

    if (ch === '-' && code[i + 1] === '-') {
      const end = lineEnd(code, i)
      out += tok('cm', code.slice(i, end))
      i = end
      continue
    }

    if (ch === '#' && hash) {
      const end = lineEnd(code, i)
      out += tok('cm', code.slice(i, end))
      i = end
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const end = scanString(code, i)
      out += tok('st', code.slice(i, end))
      i = end
      continue
    }

    if (ch >= '0' && ch <= '9') {
      const m = /^[0-9][0-9a-fA-F_xX.]*(?:[eE][+-]?\d+)?/.exec(code.slice(i))
      out += tok('nu', m[0])
      i += m[0].length
      continue
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(code.slice(i))
      out += KEYWORDS.has(m[0]) ? tok('kw', m[0]) : escapeHtml(m[0])
      i += m[0].length
      continue
    }

    out += escapeHtml(ch)
    i += 1
  }

  return out
}

function tok(kind, text) {
  return `<span class="tok tok--${kind}">${escapeHtml(text)}</span>`
}

function lineEnd(code, from) {
  const nl = code.indexOf('\n', from)
  return nl < 0 ? code.length : nl
}

function scanString(code, start) {
  const quote = code[start]
  let i = start + 1
  while (i < code.length) {
    if (code[i] === '\\') {
      i += 2
      continue
    }
    if (code[i] === quote) return i + 1
    if (quote !== '`' && code[i] === '\n') return i
    i += 1
  }
  return code.length
}

/* ------------------------------------------------------------ 章节识别 */

/**
 * Markdown 的目录直接取标题行。
 *
 * 层级选取用「命中最多的那一层」：`# 书名` + 一堆 `## 小节` 的文档，
 * 命中最多的显然是 `##`，取它才不会把整篇变成一个章节。
 * 全篇没有标题时回退到纯文本那套正则（parseChapters），保证任何文件都有分章维度。
 */
export function parseMarkdownChapters(text) {
  const lines = normalize(text)
  const offsets = []
  let cursor = 0
  for (const line of lines) {
    offsets.push(cursor)
    cursor += line.length + 1
  }

  const hits = []
  let fence = null
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (fence) {
      if (isFenceClose(line, fence)) fence = null
      i += 1
      continue
    }
    const open = matchFence(line)
    if (open) {
      fence = open
      i += 1
      continue
    }

    const atx = matchAtxHeading(line)
    if (atx) {
      hits.push({ level: atx.level, title: atx.text, at: offsets[i], head: offsets[i] + line.length + 1 })
      i += 1
      continue
    }

    const setext = matchSetext(lines, i)
    if (setext) {
      const underline = lines[i + 1]
      hits.push({
        level: setext.level,
        title: setext.text,
        at: offsets[i],
        head: offsets[i] + line.length + 1 + underline.length + 1
      })
      i = setext.next
      continue
    }

    i += 1
  }

  if (!hits.length) return parseChapters(text)

  const byLevel = new Map()
  for (const h of hits) byLevel.set(h.level, (byLevel.get(h.level) || 0) + 1)
  const ranked = [...byLevel.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
  const picked = (ranked.find(([, count]) => count >= 2) || ranked[0])[0]
  const best = hits.filter((h) => h.level === picked)

  const segments = best.map((item, i) => ({
    title: item.title || `第 ${i + 1} 节`,
    start: item.at,
    head: Math.min(item.head, i + 1 < best.length ? best[i + 1].at : text.length),
    end: i + 1 < best.length ? best[i + 1].at : text.length
  }))

  // 第一个标题之前的内容（书名、简介）单独成「前言」
  if (segments[0].start > 0 && String(text).slice(0, segments[0].start).trim()) {
    segments.unshift({ title: '前言', start: 0, head: 0, end: segments[0].start })
  }

  return splitOversizedMd(segments, String(text))
}

function matchAtxHeading(line) {
  const m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
  if (!m) return null
  const text = m[2].trim()
  return text ? { level: m[1].length, text } : null
}

function matchSetext(lines, i) {
  if (i + 1 >= lines.length) return null
  const line = lines[i]
  if (!line.trim() || startsBlock(lines, i)) return null
  const under = lines[i + 1]
  if (/^\s{0,3}=+\s*$/.test(under)) return { level: 1, text: line.trim(), next: i + 2 }
  if (/^\s{0,3}-{2,}\s*$/.test(under)) return { level: 2, text: line.trim(), next: i + 2 }
  return null
}

function isThematicBreak(line) {
  return /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)
}

/** 超长章节要切，但不能切进围栏代码块里 */
function splitOversizedMd(segments, text) {
  const result = []
  for (const seg of segments) {
    if (seg.end - seg.start <= MAX_SEGMENT) {
      result.push(seg)
      continue
    }
    const parts = chunkMd(text, seg.head, seg.end)
    parts.forEach((part, i) => {
      result.push({
        title: i === 0 ? seg.title : `${seg.title}（续 ${i + 1}/${parts.length}）`,
        start: i === 0 ? seg.start : part.start,
        head: part.start,
        end: part.end
      })
    })
  }
  return result.length ? result : [{ title: '正文', start: 0, head: 0, end: text.length }]
}

function chunkMd(text, start, end) {
  const out = []
  let cursor = start
  while (cursor < end) {
    const stop = findSplit(text, cursor, Math.min(cursor + MAX_SEGMENT, end), end)
    out.push({ start: cursor, end: stop })
    cursor = stop
  }
  return out.length ? out : [{ start, end }]
}

/** 从目标位置往回找最近的「围栏之外的空行」，找不到就退回目标位置 */
function findSplit(text, from, target, end) {
  if (target >= end) return end
  const head = text.slice(0, target)
  const fenceState = openFenceAt(head)
  let probe = target
  while (probe > from + MAX_SEGMENT * 0.5) {
    const nl = text.lastIndexOf('\n', probe)
    if (nl <= from) break
    const quote = text.slice(0, nl)
    if (isBlankAt(text, nl) && !openFenceAt(quote)) return nl + 1
    if (!fenceState && nl <= target) {
      const prev = text.lastIndexOf('\n', nl - 1)
      if (prev > from && isBlankAt(text, prev)) return nl
    }
    probe = nl
  }
  return target
}

function isBlankAt(text, nl) {
  const before = text.lastIndexOf('\n', nl - 1)
  return text.slice(before + 1, nl).trim() === ''
}

/** 该片段结束时是否还停在未闭合的围栏里 */
function openFenceAt(text) {
  let fence = null
  for (const line of text.split('\n')) {
    const open = matchFence(line)
    if (fence) {
      if (isFenceClose(line, fence)) fence = null
    } else if (open) {
      fence = open
    }
  }
  return Boolean(fence)
}

/* ------------------------------------------------------------ 统计辅助 */

/** 按扩展名判断文件该用哪种渲染方式 */
export function formatOfFilename(name) {
  return /\.(md|markdown|mdx|mdown|mkd|mkdn)$/i.test(String(name || '')) ? 'markdown' : 'text'
}

/** 章节解析的唯一入口：调用方不用自己判断格式 */
export function parseBookChapters(text, format) {
  return format === 'markdown' ? parseMarkdownChapters(text) : parseChapters(text)
}

/** 字数统计：Markdown 的 # * ` 这些标记不该算进「字数」里 */
export function countBookChars(text, format) {
  return countChars(format === 'markdown' ? stripMarkdown(text) : text)
}

/** 去掉 Markdown 标记，只留正文 —— 用于字数统计这类「按内容算」的地方 */
export function stripMarkdown(source) {
  return String(source == null ? '' : source)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\^([^\]]+)\]/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[:~]\s+/gm, '')
    .replace(/^\s*[-+*]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*([-+*]|\d{1,9}[.)])\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/[|]/g, ' ')
}
