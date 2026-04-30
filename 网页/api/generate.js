// API: /api/generate
// 接收用户描述，调用智谱 AI GLM 模型生成完整的 reveal.js HTML 代码

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || '';
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// 支持的模型映射
const MODEL_MAP = {
  'glm-4-flash': 'glm-4-flash',
  'glm-4-plus': 'glm-4-plus',
  'glm-4': 'glm-4',
  'glm-4-air': 'glm-4-air',
  'glm-4-flashx': 'glm-4-flashx',
};

// 最大重试次数
const MAX_RETRIES = 2;
// 请求超时时间（毫秒）
const REQUEST_TIMEOUT = 60000;

async function callZhipuAI(prompt, theme, transition, pages, model, mode) {
  if (!ZHIPU_API_KEY) {
    throw new Error('未配置 ZHIPU_API_KEY 环境变量');
  }

  const modelId = MODEL_MAP[model] || 'glm-4-flash';

  // 根据模式选择不同的系统提示词
  const systemPrompt =
    mode === 'code' ? buildCodePrompt(theme, transition, pages) : buildJsonPrompt(pages);

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(ZHIPU_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ZHIPU_API_KEY}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `用户描述：${prompt}` },
          ],
          temperature: 0.7,
          max_tokens: mode === 'code' ? 8000 : 4000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`智谱 API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('AI 返回内容为空');
      }

      return content;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) {
        throw new Error(`AI 调用失败 (${error.message})`);
      }
      // 等待指数退避重试
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

// 代码模式：让 AI 直接生成完整 HTML
function buildCodePrompt(theme, transition, pages) {
  return `你是一个专业的 reveal.js 幻灯片开发专家。请根据用户的描述，直接生成一个完整的、可以直接在浏览器中打开的 HTML 文件。

**核心要求：**
1. 直接输出完整的 HTML 代码，不要有任何 markdown 代码块包裹
2. 不要添加任何解释文字，只输出 HTML 代码本身
3. 生成的幻灯片应该有 ${pages} 页左右
4. 使用 reveal.js CDN：
   - CSS: https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.css
   - 主题: https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/${theme}.css
   - 高亮: https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/highlight/monokai.css
   - JS: https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.js
   - 插件: highlight, notes, search, zoom
5. 配置 Reveal.initialize：
   - hash: true
   - transition: '${transition}'
   - controls: true, progress: true, center: true
   - width: 1400, height: 800, margin: 0.04
   - slideNumber: 'c/t'
6. 添加自定义 CSS 让幻灯片更美观：
   - 使用渐变背景、阴影、动画等现代设计元素
   - 标题使用渐变色文字效果
   - 添加自定义字体（Google Fonts 或系统字体）
   - 内容排版清晰，层次分明
7. 内容要专业、准确、有逻辑性
8. 根据用户描述的内容主题，创建合适的页面结构（标题页、目录页、内容页、总结页等）

**支持的幻灯片类型：**
- 标题页：大标题 + 副标题
- 内容页：标题 + 列表/图片/代码
- 章节分隔页：渐变背景 + 大字
- 引用页：大段引用文字
- 两列布局：左右对比
- 代码高亮页：代码块示例
- 结束页：感谢/Q&A

请直接开始输出 HTML 代码，以 <!DOCTYPE html> 开头，以 </html> 结尾。`;
}

// JSON 模式：生成结构化内容（保留向后兼容）
function buildJsonPrompt(pages) {
  return `你是一个专业的幻灯片内容生成助手。请根据用户的描述，生成 ${pages} 页 reveal.js 幻灯片的结构化内容。

要求：
1. 返回严格的 JSON 格式，不要有任何 markdown 标记或其他文字
2. JSON 结构：{"title": "标题", "slides": [{"type": "title|content|section|two-col|end|quote", "title": "页面标题", "content": ["要点1", "要点2"], "notes": "演讲者备注(可选)", "fragments": ["逐条显示的文字(可选)"]}, ...]}
3. 第一页必须是 type="title"，最后一页必须是 type="end"
4. content 使用数组，每个元素是一个要点
5. 内容要专业、简洁、有逻辑性
6. 如果用户描述的是技术话题，内容要准确
7. 可以使用 type="two-col" 创建两列布局，此时 content 格式为 {"left": ["左列要点"], "right": ["右列要点"]}
8. 可以使用 type="quote" 创建引用页，content 为引用文字
9. fragments 字段用于该页需要逐步显示的内容（reveal.js fragment 功能）
10. section 类型用于章节分隔页，适合大段落切换`;
}

// JSON 模式渲染 HTML
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
    .reveal h1, .reveal h2, .reveal h3 { text-transform: none; font-weight: 700; }
    .reveal p, .reveal li { font-size: 0.85em; line-height: 1.6; }
    .reveal ul { margin-left: 0; }
    .reveal blockquote {
      background: rgba(255,255,255,0.05);
      border-left: 4px solid #667eea;
      padding: 16px 24px;
      font-style: italic;
    }
    .reveal .slide-number { background: rgba(102,126,234,0.3); color: #e0e0e0; }
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
{{SLIDES}}
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/highlight/highlight.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/notes/notes.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/search/search.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/zoom/zoom.js"></script>
  <script>
    Reveal.initialize({
      hash: true,
      transition: '{{TRANSITION}}',
      controls: true,
      progress: true,
      center: true,
      width: 1400,
      height: 800,
      margin: 0.04,
      slideNumber: 'c/t',
      plugins: [RevealHighlight, RevealNotes, RevealSearch, RevealZoom],
    });
  </script>
</body>
</html>`;

function renderSlides(data) {
  const slides = data.slides || [];

  return slides
    .map(slide => {
      const title = escapeHtml(slide.title || '');
      const notesHtml = slide.notes
        ? `\n        <aside class="notes">${escapeHtml(slide.notes)}</aside>`
        : '';

      switch (slide.type) {
        case 'title':
          return `      <section data-auto-animate>
        <h1>${title}</h1>
        <p>${slide.content?.[0] ? escapeHtml(String(slide.content[0])) : ''}</p>
${notesHtml}
      </section>`;

        case 'section':
          return `      <section data-background-gradient="linear-gradient(135deg, #667eea, #764ba2)">
        <h1>${title}</h1>
        <p>${slide.content?.[0] ? escapeHtml(String(slide.content[0])) : ''}</p>
${notesHtml}
      </section>`;

        case 'quote':
          return `      <section>
        <blockquote>${escapeHtml(String(slide.content || ''))}</blockquote>
        <p style="text-align:right;margin-top:20px">— ${title}</p>
${notesHtml}
      </section>`;

        case 'two-col': {
          const colData = slide.content || {};
          const leftItems = (Array.isArray(colData.left) ? colData.left : [])
            .map(c => `          <li>${escapeHtml(String(c))}</li>`)
            .join('\n');
          const rightItems = (Array.isArray(colData.right) ? colData.right : [])
            .map(c => `          <li>${escapeHtml(String(c))}</li>`)
            .join('\n');
          return `      <section>
        <h2>${title}</h2>
        <div style="display:flex;gap:40px;">
          <div style="flex:1">
            <ul>\n${leftItems || '            <li>...</li>'}\n            </ul>
          </div>
          <div style="flex:1">
            <ul>\n${rightItems || '            <li>...</li>'}\n            </ul>
          </div>
        </div>
${notesHtml}
      </section>`;
        }

        case 'end':
          return `      <section data-background-gradient="linear-gradient(135deg, #0f0f13, #1a1a2e)">
        <h1>${title}</h1>
        <p>${slide.content?.[0] ? escapeHtml(String(slide.content[0])) : 'Q & A'}</p>
${notesHtml}
      </section>`;

        default: {
          const content =
            (slide.content || [])
              .map(c => {
                const fragText = String(c);
                if (slide.fragments && slide.fragments.includes(fragText)) {
                  return `          <li class="fragment fade-up">${escapeHtml(fragText)}</li>`;
                }
                return `          <li>${escapeHtml(fragText)}</li>`;
              })
              .join('\n') || '          <li>...</li>';

          return `      <section>
        <h2>${title}</h2>
        <ul>
${content}
        </ul>
${notesHtml}
      </section>`;
        }
      }
    })
    .join('\n\n');
}

function extractHTMLFromAI(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // 移除可能的首尾空白
  content = content.trim();

  // 尝试提取 markdown 代码块中的 HTML
  const codeBlockMatch = content.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // 尝试提取 <!DOCTYPE html> 开头的完整 HTML
  const doctypeMatch = content.match(/<!DOCTYPE\s+html[^>]*>[\s\S]*<\/html>/i);
  if (doctypeMatch) {
    return doctypeMatch[0].trim();
  }

  // 尝试提取 <html> 开头的 HTML
  const htmlMatch = content.match(/<html[^>]*>[\s\S]*<\/html>/i);
  if (htmlMatch) {
    return htmlMatch[0].trim();
  }

  // 如果都没有，检查是否已经是完整的 HTML 片段
  const hasHtmlTags = content.includes('<') && content.includes('>');
  const hasRevealInit = content.includes('Reveal.initialize');

  // 如果有 HTML 标签和 reveal.js 初始化，可能是 AI 直接返回的 HTML
  if (hasHtmlTags && hasRevealInit) {
    // 尝试补全必要的结构
    if (!content.includes('<!DOCTYPE')) {
      content = '<!DOCTYPE html>\n' + content;
    }
    if (!content.includes('</html>')) {
      content = content + '\n</html>';
    }
    return content;
  }

  return null;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 降级模板生成
function generateFallbackHTML(prompt, theme, transition, pages) {
  const lines = prompt.split(/[，。！？\n]/).filter(l => l.trim());
  const title = lines[0] || '幻灯片演示';

  let slidesHTML = '';
  slidesHTML += `      <section data-auto-animate>
        <h1>${escapeHtml(title)}</h1>
        <p>由 SlideGen AI 生成</p>
      </section>\n\n`;

  const contentItems =
    lines.length > 1 ? lines.slice(1) : ['要点一', '要点二', '要点三', '要点四', '要点五'];
  const itemsPerSlide = Math.max(
    2,
    Math.ceil(contentItems.length / Math.max(1, parseInt(pages) - 2))
  );

  for (
    let i = 0;
    i < contentItems.length && slidesHTML.split('<section').length - 1 < parseInt(pages);
    i += itemsPerSlide
  ) {
    const chunk = contentItems.slice(i, i + itemsPerSlide);
    const listItems = chunk
      .map(item => `          <li>${escapeHtml(item.trim() || '...')}</li>`)
      .join('\n');
    slidesHTML += `      <section>
        <h2>${escapeHtml(chunk[0] || `第 ${i} 页`)}</h2>
        <ul>
${listItems}
        </ul>
      </section>\n\n`;
  }

  slidesHTML += `      <section data-background-gradient="linear-gradient(135deg, #0f0f13, #1a1a2e)">
        <h1>感谢观看</h1>
        <p>Q & A</p>
      </section>`;

  return TEMPLATE.replace(/{{TITLE}}/g, escapeHtml(title))
    .replace(/{{THEME}}/g, theme)
    .replace(/{{TRANSITION}}/g, transition)
    .replace(/{{SLIDES}}/g, slidesHTML)
    .replace(/<\\\/script>/g, '</script>');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      prompt,
      theme = 'black',
      transition = 'slide',
      pages = 5,
      model = 'glm-4-flash',
      mode = 'code', // 'code' 或 'json'，默认代码模式
    } = req.body || {};

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: '请提供幻灯片描述' });
    }

    const numPages = Math.min(Math.max(parseInt(pages) || 5, 3), 30);
    let html = '';
    let title = prompt.trim().slice(0, 30);
    let usedAI = false;
    let aiError = null;

    // 尝试调用智谱 AI 生成代码
    if (ZHIPU_API_KEY) {
      try {
        if (mode === 'code') {
          // 代码模式：AI 直接生成完整 HTML
          const aiContent = await callZhipuAI(
            prompt.trim(),
            theme,
            transition,
            numPages,
            model,
            'code'
          );
          const extractedHTML = extractHTMLFromAI(aiContent);

          if (extractedHTML) {
            html = extractedHTML;
            // 从生成的 HTML 中提取标题
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            if (titleMatch) title = titleMatch[1];
          } else {
            throw new Error('无法从 AI 返回中提取 HTML');
          }
        } else {
          // JSON 模式：生成结构再渲染（向后兼容）
          const aiContent = await callZhipuAI(
            prompt.trim(),
            theme,
            transition,
            numPages,
            model,
            'json'
          );

          let slideData;
          try {
            // 尝试多种方式提取 JSON
            const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              throw new Error('未找到 JSON 结构');
            }

            slideData = JSON.parse(jsonMatch[0]);

            // 验证数据结构
            if (!slideData || typeof slideData !== 'object') {
              throw new Error('无效的 JSON 数据');
            }

            if (!Array.isArray(slideData.slides)) {
              slideData.slides = [];
            }

            // 确保有标题
            if (!slideData.title || typeof slideData.title !== 'string') {
              slideData.title = prompt.trim().slice(0, 30);
            }

            // 验证每页幻灯片数据
            slideData.slides = slideData.slides.map(slide => {
              if (!slide || typeof slide !== 'object') {
                return { type: 'content', title: '未命名页', content: ['...'] };
              }

              // 确保有必要的字段
              slide.type = slide.type || 'content';
              slide.title = slide.title || '未命名页';

              // 处理内容字段
              if (slide.type === 'two-col' && slide.content && typeof slide.content === 'object') {
                // two-col 类型 content 应该是对象
                slide.content.left = Array.isArray(slide.content.left) ? slide.content.left : [];
                slide.content.right = Array.isArray(slide.content.right) ? slide.content.right : [];
              } else if (!slide.content || !Array.isArray(slide.content)) {
                slide.content = ['...'];
              }

              return slide;
            });

            const slidesHTML = renderSlides(slideData);
            title = slideData.title;
            html = TEMPLATE.replace(/{{TITLE}}/g, escapeHtml(title))
              .replace(/{{THEME}}/g, theme)
              .replace(/{{TRANSITION}}/g, transition)
              .replace(/{{SLIDES}}/g, slidesHTML)
              .replace(/<\/script>/g, '</script>');
          } catch (jsonError) {
            console.error(
              'JSON 解析失败:',
              jsonError.message,
              '原始内容:',
              aiContent.slice(0, 200)
            );
            throw new Error(`AI 返回的数据格式无效: ${jsonError.message}`);
          }
        }
        usedAI = true;
      } catch (aiErr) {
        console.error('AI 调用失败:', aiErr.message);
        aiError = aiErr.message;
        html = generateFallbackHTML(prompt.trim(), theme, transition, numPages);
      }
    } else {
      aiError = '未配置 API Key';
      html = generateFallbackHTML(prompt.trim(), theme, transition, numPages);
    }

    res.status(200).json({
      success: true,
      title,
      html,
      pages: numPages,
      ai: usedAI,
      model: usedAI ? MODEL_MAP[model] || 'glm-4-flash' : null,
      mode,
      ...(aiError ? { warning: `AI 调用失败，已使用基础模板。原因：${aiError}` } : {}),
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: '生成失败: ' + err.message });
  }
};
