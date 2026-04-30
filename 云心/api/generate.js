// API: /api/generate + /api/outline
// 接收用户描述，调用智谱 AI GLM-4-Flash 生成 reveal.js HTML

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || '';
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const DEFAULT_MODEL = 'glm-4-flash';
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT = 300000; // 5分钟超时，给大响应更多时间

// 更健壮的 fetch 封装，带超时和错误处理
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${timeoutMs}ms），请稍后重试`);
    }
    throw error;
  }
}

async function callZhipuAI(messages, maxTokens = 8000) {
  if (!ZHIPU_API_KEY) throw new Error('未配置 ZHIPU_API_KEY');
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(ZHIPU_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ZHIPU_API_KEY}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages,
          temperature: 0.6,
          max_tokens: maxTokens,
        }),
      }, REQUEST_TIMEOUT);

      // 先读取文本，避免 response.json() 在解析失败时丢失原始内容
      const responseText = await response.text();

      if (!response.ok) {
        // 尝试解析错误 JSON
        let errorDetail = responseText.slice(0, 300);
        try {
          const errorJson = JSON.parse(responseText);
          errorDetail = errorJson.error?.message || errorJson.message || errorDetail;
        } catch (_) { /* 非 JSON 错误响应 */ }
        throw new Error(`智谱 API 错误 (${response.status}): ${errorDetail}`);
      }

      // 安全解析 JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('智谱 API 返回非 JSON:', responseText.slice(0, 500));
        throw new Error('AI 服务返回了无效数据格式，请稍后重试');
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        console.error('AI 返回空内容:', JSON.stringify(data).slice(0, 500));
        throw new Error('AI 返回内容为空');
      }
      return content;
    } catch (error) {
      lastError = error;
      console.error(`AI 调用尝试 ${attempt + 1}/${MAX_RETRIES + 1} 失败:`, error.message);
      if (attempt === MAX_RETRIES) {
        throw new Error(`AI 调用失败: ${error.message}`);
      }
      // 指数退避重试
      const delay = 1500 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ========================= 大纲生成 =========================
function buildOutlinePrompt(pages) {
  return `你是一个专业的幻灯片内容策划师。请根据用户的描述，生成一个 JSON 格式的演示文稿大纲。

要求：
1. 返回严格 JSON，不要 markdown 代码块，不要额外文字
2. 结构：{"title": "标题", "slides": [{"type": "类型", "title": "页面标题", "content": ["要点1", "要点2"]}, ...]}
3. 生成 ${pages} 页左右的幻灯片大纲
4. 第一页 type="title"（封面），最后一页 type="end"（结束页）
5. 内容要专业、有逻辑、层次分明
6. content 用数组，每个元素是一个要点（简短，不超过15字）
7. 尽量使用多种类型：title, section, content, cards, two-col, quote, code
8. 为每个 slide 添加 "notes" 字段作为演讲者备注（简短，20字以内）

类型说明：
- title: 封面页，content 放副标题和作者
- section: 章节页，content 放章节描述
- content: 普通内容页，content 放要点列表
- cards: 卡片页，content 放 [{"icon":"emoji","title":"卡片标题","desc":"描述"}]
- two-col: 两列对比，content 放 {"left":["要点"],"right":["要点"]}
- quote: 引用页，content 放引用文字
- code: 代码页，content 放 ["代码语言", "代码片段描述"]
- end: 结束页，content 放 ["Q & A"]`;
}

// ========================= 代码生成提示词 =========================
function buildCodePrompt(theme, transition, pages, outline) {
  const outlineHint = outline
    ? `\n\n**用户确认的大纲（必须严格遵循）：**\n${JSON.stringify(outline, null, 2)}\n请根据以上大纲生成对应的幻灯片页面。`
    : '';
  return `你是一个专业的 reveal.js 5.x 幻灯片开发专家。请根据用户的描述${outline ? '和提供的大纲' : ''}，生成一个完整的、可直接在浏览器中打开的 HTML 文件。

## 🚫 绝对规则（必须遵守）
1. 直接输出完整 HTML 代码，**不要有任何 markdown 代码块包裹**（不要 \`\`\`html 开头）
2. **不要添加任何解释文字**，只输出 HTML 代码本身
3. 以 <!DOCTYPE html> 开头，以 </html> 结尾
4. 生成的幻灯片应有 ${pages} 页左右（可适当增减，但不得少于 4 页）
5. **HTML 必须完整、语法正确**，确保所有标签正确闭合

## 📦 CDN 引用（必须使用）
\`\`\`
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/${theme}.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/highlight/monokai.css">
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/highlight/highlight.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/notes/notes.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/search/search.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/zoom/zoom.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/math/math.js"></script>
\`\`\`

## ⚙️ Reveal.initialize 配置（必须使用）
\`\`\`javascript
Reveal.initialize({
  hash: true,
  transition: '${transition}',
  transitionSpeed: 'default',
  backgroundTransition: 'fade',
  controls: true,
  progress: true,
  center: false,
  width: 1400,
  height: 800,
  margin: 0.04,
  slideNumber: 'c/t',
  showSlideNumber: 'all',
  plugins: [RevealHighlight, RevealNotes, RevealSearch, RevealZoom, RevealMath.KaTeX]
});
\`\`\`

## 🎨 核心设计理念（必须体现）
- **每一页都应该是视觉作品**，不是白底黑字的文档
- **大胆使用渐变背景、模糊效果、阴影、圆角卡片**
- **文字要有层次**：标题大且醒目，正文清晰易读
- **善用留白和呼吸感**，不要堆满文字
- **配色要专业且统一**，建议使用 2-3 个主色
- **适当使用 emoji 或图标字体**增加趣味性

## 🔥 reveal.js 高级特性（必须主动使用以下至少 5 种）

### 1. 垂直幻灯片（Vertical Slides）
\`\`\`html
<section>
  <section data-background-gradient="linear-gradient(135deg, #667eea, #764ba2)">
    <h1>大主题</h1>
  </section>
  <section><h2>子内容 1</h2><p>...</p></section>
  <section><h2>子内容 2</h2><p>...</p></section>
</section>
\`\`\`

### 2. 自动动画（Auto-Animate）
\`\`\`html
<section data-auto-animate><h1 style="margin-top:100px">标题</h1></section>
<section data-auto-animate><h1 style="margin-top:0;font-size:1.2em">标题</h1><p>内容...</p></section>
\`\`\`

### 3. Fragments（逐步显示动画）
\`\`\`html
<ul>
  <li class="fragment fade-up">第一条</li>
  <li class="fragment fade-up">第二条</li>
  <li class="fragment fade-in-then-semi-out">第三条</li>
</ul>
\`\`\`
可用 class：fade-up, fade-down, fade-left, fade-right, fade-in-then-out, fade-in-then-semi-out, grow, shrink, highlight-red, highlight-green, highlight-blue

### 4. 背景过渡（Background Transitions）
\`\`\`html
<section data-background-gradient="radial-gradient(circle, #1a1a2e 0%, #16213e 100%)"><h2>渐变背景</h2></section>
<section data-background-color="#667eea"><h2>纯色背景</h2></section>
\`\`\`

### 5. 卡片式布局（Cards）
\`\`\`html
<section>
  <h2>三大特性</h2>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px;">
    <div style="background: rgba(255,255,255,0.1); border-radius: 16px; padding: 30px; backdrop-filter: blur(10px);">
      <div style="font-size: 3em;">🚀</div><h3>快速</h3><p>极致性能</p>
    </div>
  </div>
</section>
\`\`\`

### 6. 多列布局与 Grid
### 7. 引用页（Quote）
### 8. 演讲者备注（Speaker Notes）
### 9. 嵌入 Web 内容（Iframe）
### 10. 代码高亮（data-line-numbers）
### 11. 数学公式（KaTeX）
### 12. 缩放与导航（data-transition="zoom"）

## 📝 自定义 CSS 要求（在 <style> 中定义）
\`\`\`css
.reveal { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.reveal h1, .reveal h2, .reveal h3 { text-transform: none; font-weight: 700; letter-spacing: -0.02em; }
.reveal h1 { font-size: 2.8em; } .reveal h2 { font-size: 1.8em; }
.reveal p, .reveal li { font-size: 0.9em; line-height: 1.7; opacity: 0.9; }
.reveal ul { margin-left: 0; list-style: none; }
.reveal ul li::before { content: "▸ "; color: #667eea; font-weight: bold; margin-right: 8px; }
.reveal blockquote { background: rgba(255,255,255,0.05); border-left: 4px solid #667eea; padding: 20px 30px; font-style: italic; border-radius: 0 8px 8px 0; }
.reveal .slide-number { background: rgba(102,126,234,0.3); color: #e0e0e0; font-size: 14px; padding: 4px 10px; border-radius: 4px; }
.reveal pre { border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
\`\`\`

## ✅ 质量检查清单
- [ ] 是否使用了垂直幻灯片？
- [ ] 是否使用了 auto-animate？
- [ ] 是否大量使用了 fragment 动画？
- [ ] 背景是否丰富多样？
- [ ] 是否使用了卡片式布局？
- [ ] 是否添加了演讲者备注？
- [ ] 代码是否完整可运行？

请直接开始输出 HTML 代码。${outlineHint}`;
}

// ========================= JSON 模式提示词 =========================
function buildJsonPrompt(pages) {
  return `你是一个专业的 reveal.js 幻灯片内容生成助手。请根据用户的描述，生成 ${pages} 页 reveal.js 幻灯片的结构化内容。

要求：
1. 返回严格的 JSON 格式，不要有任何 markdown 标记或其他文字
2. JSON 结构：{"title": "标题", "slides": [...]}
3. 第一页必须是 type="title"，最后一页必须是 type="end"

幻灯片类型：
- title: 标题页（大标题 + 副标题 + 作者）
- section: 章节分隔页（渐变背景 + 大字）
- content: 普通内容页（标题 + 列表）
- cards: 卡片布局页（展示多个卡片）
- two-col: 两列布局
- quote: 引用页
- code: 代码页
- end: 结束页

每页字段：type, title, content, notes(演讲者备注), fragments(逐步显示), background, animation

返回格式示例：
{"title": "AI 技术展望", "slides": [{"type": "title", "title": "AI 技术展望", "content": ["2024 技术趋势", "主讲人：XXX"]}, {"type": "content", "title": "核心趋势", "content": ["大模型进化", "多模态融合"], "fragments": ["大模型进化", "多模态融合"]}, {"type": "end", "title": "感谢观看", "content": ["Q & A"]}]}`;
}

// ========================= JSON 渲染模板 =========================
const TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{TITLE}}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/{{THEME}}.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/highlight/monokai.css">
  <style>
    .reveal { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .reveal h1, .reveal h2, .reveal h3 { text-transform: none; font-weight: 700; letter-spacing: -0.02em; }
    .reveal h1 { font-size: 2.8em; } .reveal h2 { font-size: 1.8em; }
    .reveal p, .reveal li { font-size: 0.9em; line-height: 1.7; opacity: 0.9; }
    .reveal ul { margin-left: 0; list-style: none; }
    .reveal ul li::before { content: "▸ "; color: #667eea; font-weight: bold; margin-right: 8px; }
    .reveal blockquote { background: rgba(255,255,255,0.05); border-left: 4px solid #667eea; padding: 20px 30px; font-style: italic; border-radius: 0 8px 8px 0; }
    .reveal .slide-number { background: rgba(102,126,234,0.3); color: #e0e0e0; font-size: 14px; padding: 4px 10px; border-radius: 4px; }
    .reveal pre { border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .reveal .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 40px; }
    .reveal .card { background: rgba(255,255,255,0.1); border-radius: 16px; padding: 30px; backdrop-filter: blur(10px); transition: transform 0.3s; }
    .reveal .card:hover { transform: translateY(-5px); }
    .reveal .card-icon { font-size: 3em; margin-bottom: 15px; }
    .reveal .card h3 { margin: 0 0 10px 0; font-size: 1.2em; }
    .reveal .card p { margin: 0; font-size: 0.8em; opacity: 0.8; }
  </style>
</head>
<body>
  <div class="reveal"><div class="slides">
{{SLIDES}}
  </div></div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/highlight/highlight.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/notes/notes.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/search/search.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/zoom/zoom.js"></script>
  <script>
    Reveal.initialize({
      hash: true, transition: '{{TRANSITION}}', transitionSpeed: 'default', backgroundTransition: 'fade',
      controls: true, progress: true, center: false, width: 1400, height: 800, margin: 0.04,
      slideNumber: 'c/t', showSlideNumber: 'all',
      plugins: [RevealHighlight, RevealNotes, RevealSearch, RevealZoom],
    });
  </script>
</body>
</html>`;

function renderSlides(data) {
  const slides = data.slides || [];
  return slides.map(slide => {
    const title = escapeHtml(slide.title || '');
    const notesHtml = slide.notes ? `\n        <aside class="notes">${escapeHtml(String(slide.notes))}</aside>` : '';
    let bgAttr = '', animAttr = '', styleAttr = '';
    if (slide.background) {
      if (slide.background.gradient) bgAttr = ` data-background-gradient="${escapeHtml(String(slide.background.gradient))}"`;
      else if (slide.background.image) bgAttr = ` data-background-image="${escapeHtml(String(slide.background.image))}"`;
      else if (slide.background.color) bgAttr = ` data-background-color="${escapeHtml(String(slide.background.color))}"`;
    }
    if (slide.animation) animAttr = ` data-transition="${escapeHtml(String(slide.animation))}"`;
    if (slide.style) styleAttr = ` style="${escapeHtml(String(slide.style))}"`;

    switch (slide.type) {
      case 'title':
        return `      <section${bgAttr}${animAttr} data-auto-animate>\n        <h1>${title}</h1>\n        <p>${slide.content?.[0] ? escapeHtml(String(slide.content[0])) : ''}</p>\n        ${slide.content?.[1] ? `<p style="opacity:0.7;margin-top:20px;">${escapeHtml(String(slide.content[1]))}</p>` : ''}${notesHtml}\n      </section>`;
      case 'section':
        return `      <section${bgAttr}${animAttr}>\n        <h1>${title}</h1>\n        <p>${slide.content?.[0] ? escapeHtml(String(slide.content[0])) : ''}</p>${notesHtml}\n      </section>`;
      case 'quote':
        return `      <section${bgAttr}${animAttr}>\n        <blockquote style="border:none;font-size:1.5em;font-style:italic;text-align:center;background:none;">${escapeHtml(String(slide.content || ''))}</blockquote>\n        <p style="text-align:center;opacity:0.7;margin-top:20px;">— ${title}</p>${notesHtml}\n      </section>`;
      case 'cards': {
        const cards = Array.isArray(slide.content) ? slide.content : [];
        const cardsHtml = cards.map(c => typeof c === 'object' && c !== null
          ? `        <div class="card">\n          <div class="card-icon">${escapeHtml(String(c.icon || '●'))}</div>\n          <h3>${escapeHtml(String(c.title || ''))}</h3>\n          <p>${escapeHtml(String(c.desc || ''))}</p>\n        </div>`
          : '').join('\n');
        return `      <section${bgAttr}${animAttr}>\n        <h2>${title}</h2>\n        <div class="card-grid">\n${cardsHtml || '        <div class="card"><p>暂无内容</p></div>'}\n        </div>${notesHtml}\n      </section>`;
      }
      case 'two-col': {
        const colData = slide.content || {};
        const leftItems = (Array.isArray(colData.left) ? colData.left : []).map(c => `          <li>${escapeHtml(String(c))}</li>`).join('\n');
        const rightItems = (Array.isArray(colData.right) ? colData.right : []).map(c => `          <li>${escapeHtml(String(c))}</li>`).join('\n');
        return `      <section${bgAttr}${animAttr}>\n        <h2>${title}</h2>\n        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:30px;">\n          <div><ul>\n${leftItems || '            <li>...</li>'}\n            </ul></div>\n          <div><ul>\n${rightItems || '            <li>...</li>'}\n            </ul></div>\n        </div>${notesHtml}\n      </section>`;
      }
      case 'code': {
        const codeContent = slide.content?.[0] || '';
        const lang = slide.content?.[1] || 'javascript';
        return `      <section${bgAttr}${animAttr}>\n        <h2>${title}</h2>\n        <pre><code class="language-${escapeHtml(lang)}">${escapeHtml(String(codeContent))}</code></pre>${notesHtml}\n      </section>`;
      }
      case 'end':
        return `      <section${bgAttr}${animAttr} data-background-gradient="linear-gradient(135deg, #0f0f13, #1a1a2e)">\n        <h1>${title}</h1>\n        <p>${slide.content?.[0] ? escapeHtml(String(slide.content[0])) : 'Q & A'}</p>\n        ${slide.content?.[1] ? `<p style="opacity:0.7;margin-top:20px;">${escapeHtml(String(slide.content[1]))}</p>` : ''}${notesHtml}\n      </section>`;
      default: {
        const content = (slide.content || []).map(c => {
          const fragText = String(c);
          if (slide.fragments && slide.fragments.includes(fragText)) return `          <li class="fragment fade-up">${escapeHtml(fragText)}</li>`;
          return `          <li>${escapeHtml(fragText)}</li>`;
        }).join('\n') || '          <li>...</li>';
        return `      <section${bgAttr}${animAttr}>\n        <h2>${title}</h2>\n        <ul>\n${content}\n        </ul>${notesHtml}\n      </section>`;
      }
    }
  }).join('\n\n');
}

function extractHTMLFromAI(content) {
  if (!content || typeof content !== 'string') return null;
  content = content.trim();

  // 1. 尝试提取 markdown 代码块
  const codeBlockMatch = content.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim();
    if (extracted.includes('<') && extracted.includes('>')) return extracted;
  }

  // 2. 尝试匹配完整 HTML 文档（带 DOCTYPE）
  const doctypeMatch = content.match(/<!DOCTYPE\s+html[^>]*>[\s\S]*<\/html>/i);
  if (doctypeMatch) return doctypeMatch[0].trim();

  // 3. 尝试匹配 html 标签包裹的内容
  const htmlMatch = content.match(/<html[^>]*>[\s\S]*<\/html>/i);
  if (htmlMatch) {
    // 补全 DOCTYPE
    return '<!DOCTYPE html>\n' + htmlMatch[0].trim();
  }

  // 4. 检查是否包含关键 HTML 特征
  const hasHtmlTags = content.includes('<') && content.includes('>');
  const hasRevealInit = content.includes('Reveal.initialize');
  const hasHead = content.includes('<head>');
  const hasBody = content.includes('<body>');

  if (hasHtmlTags && (hasRevealInit || hasHead || hasBody)) {
    let result = content;
    if (!result.includes('<!DOCTYPE')) result = '<!DOCTYPE html>\n' + result;
    if (!result.includes('<html')) result = '<html lang="zh-CN">\n' + result + '\n</html>';
    else if (!result.includes('</html>')) result = result + '\n</html>';
    return result;
  }

  return null;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateFallbackHTML(prompt, theme, transition, pages) {
  const lines = prompt.split(/[，。！？\n]/).filter(l => l.trim());
  const title = lines[0] || '幻灯片演示';
  let slidesHTML = `      <section data-auto-animate data-background-gradient="linear-gradient(135deg, #667eea, #764ba2)">\n        <h1 style="color:#fff;">${escapeHtml(title)}</h1>\n        <p style="color:rgba(255,255,255,0.8);">由 SlideGen AI 生成</p>\n      </section>\n\n`;
  const contentItems = lines.length > 1 ? lines.slice(1) : ['要点一', '要点二', '要点三', '要点四', '要点五'];
  const itemsPerSlide = Math.max(2, Math.ceil(contentItems.length / Math.max(1, parseInt(pages) - 3)));
  let slideCount = 1;
  for (let i = 0; i < contentItems.length && slideCount < parseInt(pages) - 1; i += itemsPerSlide) {
    const chunk = contentItems.slice(i, i + itemsPerSlide);
    const listItems = chunk.map((item, idx) => `          <li class="fragment fade-up" style="animation-delay: ${idx * 0.1}s">${escapeHtml(item.trim() || '...')}</li>`).join('\n');
    const bgGradients = ['linear-gradient(135deg, #1a1a2e, #16213e)', 'linear-gradient(135deg, #0f0f13, #1a1a2e)', 'linear-gradient(135deg, #16213e, #0f3460)'];
    slidesHTML += `      <section data-background-gradient="${bgGradients[slideCount % bgGradients.length]}">\n        <h2>${escapeHtml(chunk[0] || `第 ${slideCount + 1} 页`)}</h2>\n        <ul>\n${listItems}\n        </ul>\n      </section>\n\n`;
    slideCount++;
  }
  slidesHTML += `      <section data-background-gradient="linear-gradient(135deg, #0f0f13, #1a1a2e)" data-transition="zoom">\n        <h1>感谢观看</h1>\n        <p>Q & A</p>\n      </section>`;
  return TEMPLATE.replace(/{{TITLE}}/g, escapeHtml(title)).replace(/{{THEME}}/g, theme).replace(/{{TRANSITION}}/g, transition).replace(/{{SLIDES}}/g, slidesHTML).replace(/<\/script>/g, '</script>');
}

// ========================= API 入口 =========================
module.exports = async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', success: false });
  }

  // 安全解析请求体
  let body;
  try {
    body = req.body || {};
  } catch (e) {
    return res.status(400).json({ error: '无效的请求体', success: false });
  }

  const { action } = body;

  // ---------- /api/generate?action=outline ----------
  if (action === 'outline') {
    try {
      const { prompt, pages = 8 } = body;
      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: '请提供幻灯片描述', success: false });
      }
      const numPages = Math.min(Math.max(parseInt(pages) || 8, 4), 20);
      const systemPrompt = buildOutlinePrompt(numPages);
      const aiContent = await callZhipuAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `用户描述：${prompt.trim()}` }
      ], 4000);

      // 安全提取 JSON
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI 未返回有效 JSON');

      let outline;
      try {
        outline = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        console.error('大纲 JSON 解析失败:', jsonMatch[0].slice(0, 500));
        throw new Error('AI 返回的 JSON 格式不正确');
      }

      if (!outline.title || !Array.isArray(outline.slides)) {
        throw new Error('大纲格式无效：缺少 title 或 slides');
      }

      return res.status(200).json({ success: true, outline });
    } catch (err) {
      console.error('Outline error:', err);
      return res.status(500).json({
        error: '大纲生成失败: ' + err.message,
        success: false,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      });
    }
  }

  // ---------- /api/generate (default: generate slides) ----------
  try {
    const {
      prompt,
      outline,
      theme = 'black',
      transition = 'slide',
      pages = 8,
      mode = 'code',
    } = body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: '请提供幻灯片描述', success: false });
    }

    const numPages = Math.min(Math.max(parseInt(pages) || 8, 4), 30);
    let html = '';
    let title = prompt.trim().slice(0, 30);
    let usedAI = false;
    let aiError = null;

    if (ZHIPU_API_KEY) {
      try {
        if (mode === 'code') {
          const systemPrompt = buildCodePrompt(theme, transition, numPages, outline);
          const userContent = outline
            ? `用户描述：${prompt.trim()}\n\n请根据以上大纲生成 HTML 幻灯片。`
            : `用户描述：${prompt.trim()}`;

          const aiContent = await callZhipuAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ], 8000);

          const extractedHTML = extractHTMLFromAI(aiContent);
          if (extractedHTML) {
            html = extractedHTML;
            // 提取标题
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            if (titleMatch) title = titleMatch[1];
          } else {
            console.error('无法从 AI 响应中提取 HTML，原始内容前500字:', aiContent.slice(0, 500));
            throw new Error('无法从 AI 返回中提取有效 HTML，可能是返回格式不正确');
          }
        } else {
          // JSON 模式
          const aiContent = await callZhipuAI([
            { role: 'system', content: buildJsonPrompt(numPages) },
            { role: 'user', content: `用户描述：${prompt.trim()}` }
          ], 4000);

          let slideData;
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('未找到 JSON 结构');

          try {
            slideData = JSON.parse(jsonMatch[0]);
          } catch (parseErr) {
            console.error('JSON 解析失败:', jsonMatch[0].slice(0, 500));
            throw new Error('AI 返回的 JSON 格式不正确');
          }

          if (!slideData || typeof slideData !== 'object' || !Array.isArray(slideData.slides)) {
            throw new Error('无效的 JSON 数据');
          }
          if (!slideData.title || typeof slideData.title !== 'string') {
            slideData.title = prompt.trim().slice(0, 30);
          }

          // 清理和规范化 slides 数据
          slideData.slides = slideData.slides.map((slide, idx) => {
            if (!slide || typeof slide !== 'object') {
              return { type: 'content', title: `第 ${idx + 1} 页`, content: ['...'] };
            }
            slide.type = slide.type || 'content';
            slide.title = slide.title || `第 ${idx + 1} 页`;

            if (slide.type === 'two-col' && slide.content && typeof slide.content === 'object') {
              slide.content.left = Array.isArray(slide.content.left) ? slide.content.left : [];
              slide.content.right = Array.isArray(slide.content.right) ? slide.content.right : [];
            } else if (slide.type === 'cards' && Array.isArray(slide.content)) {
              // keep as is
            } else if (!slide.content || !Array.isArray(slide.content)) {
              slide.content = ['...'];
            }
            return slide;
          });

          const slidesHTML = renderSlides(slideData);
          title = slideData.title;
          html = TEMPLATE
            .replace(/{{TITLE}}/g, escapeHtml(title))
            .replace(/{{THEME}}/g, theme)
            .replace(/{{TRANSITION}}/g, transition)
            .replace(/{{SLIDES}}/g, slidesHTML)
            .replace(/<\/script>/g, '</script>');
        }
        usedAI = true;
      } catch (aiErr) {
        console.error('AI 调用失败:', aiErr.message);
        aiError = aiErr.message;
        // 使用 fallback 模板
        html = generateFallbackHTML(prompt.trim(), theme, transition, numPages);
      }
    } else {
      aiError = '未配置 API Key';
      html = generateFallbackHTML(prompt.trim(), theme, transition, numPages);
    }

    // 最终检查：确保 html 不为空
    if (!html || !html.trim()) {
      throw new Error('生成的 HTML 内容为空');
    }

    // 确保返回的 JSON 是有效的，且 HTML 被正确编码
    const responsePayload = {
      success: true,
      title,
      html,
      pages: numPages,
      ai: usedAI,
      model: usedAI ? DEFAULT_MODEL : null,
      mode,
    };

    if (aiError) {
      responsePayload.warning = `AI 调用失败，已使用基础模板。原因：${aiError}`;
    }

    // 设置内容类型并返回
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(responsePayload);

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({
      error: '生成失败: ' + err.message,
      success: false,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
};
