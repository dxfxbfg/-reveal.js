// Code Engineer Agent - 代码工程师
// 职责：将大纲 + 设计规范 转换为 reveal.js HTML

const { callZhipuAI } = require('../utils/ai-client');

function buildPrompt(outline, designSpec, pages) {
  const outlineJson = JSON.stringify(outline, null, 2);
  const designJson = JSON.stringify(designSpec, null, 2);

  return `你是一个专业的 reveal.js 5.x 幻灯片开发专家。请根据以下大纲和视觉设计规范，生成一个完整的、可直接在浏览器中打开的 HTML 文件。

## 幻灯片大纲
${outlineJson}

## 视觉设计规范
${designJson}

## 绝对规则（必须遵守）
1. 直接输出完整 HTML 代码，不要有任何 markdown 代码块包裹
2. 不要添加任何解释文字，只输出 HTML 代码本身
3. 以 <!DOCTYPE html> 开头，以 </html> 结尾
4. 生成的幻灯片应有 ${pages} 页左右
5. HTML 必须完整、语法正确，确保所有标签正确闭合

## CDN 引用（必须使用）
\`\`\`
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/${designSpec.theme || 'black'}.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/highlight/monokai.css">
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/highlight/highlight.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/notes/notes.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/search/search.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/zoom/zoom.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5/plugin/math/math.js"></script>
\`\`\`

## Reveal.initialize 配置（必须使用）
\`\`\`javascript
Reveal.initialize({
  hash: true,
  transition: '${designSpec.transition || 'slide'}',
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

## 设计要求
- 严格遵循视觉设计规范中的配色方案
- 每页幻灯片应用对应的背景设计
- 使用 fragment 动画增强内容展示
- 添加演讲者备注（speaker notes）
- 确保代码高亮、数学公式等功能正常

请直接开始输出 HTML 代码。`;
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

// 后处理：修复 AI 生成的 reveal.js HTML 中的常见问题
function fixRevealJS(html, designSpec) {
  let fixed = html;

  // === 修复 1: 替换不存在的背景图片 URL ===
  // AI 经常生成 url('background1.jpg') 这种本地文件引用，替换为渐变背景
  const palette = designSpec?.colorPalette || {};
  const c1 = palette.primary || '#667eea';
  const c2 = palette.secondary || '#764ba2';
  const grad = `linear-gradient(135deg, ${c1}, ${c2})`;

  // 替换 url('background*.jpg') → 渐变
  fixed = fixed.replace(/url\(['"]?background\d+\.jpg['"]?\)/gi, grad);

  // 替换 data-background="url('background*.jpg') no-repeat ..." → 渐变
  fixed = fixed.replace(/data-background="url\(['"]?background\d+\.jpg['"]?\)[^"]*"/gi, `data-background="${grad}"`);

  return fixed;
}

async function execute({ outline, designSpec, pages = 8 }) {
  if (!outline || !outline.slides) {
    throw new Error('缺少大纲数据');
  }
  if (!designSpec) {
    throw new Error('缺少设计规范');
  }

  const numPages = Math.min(Math.max(parseInt(pages) || 8, 4), 30);

  const aiContent = await callZhipuAI([
    { role: 'system', content: '你是一个专业的 reveal.js 幻灯片开发专家。' },
    { role: 'user', content: buildPrompt(outline, designSpec, numPages) }
  ], 8000);

  const html = extractHTMLFromAI(aiContent);
  if (!html) {
    console.error('无法从 AI 响应中提取 HTML，原始内容前500字:', aiContent.slice(0, 500));
    throw new Error('无法从 AI 返回中提取有效 HTML');
  }

  // 后处理：修复 AI 生成 HTML 中的常见问题
  const fixedHTML = fixRevealJS(html, designSpec);

  // 提取标题
  const titleMatch = fixedHTML.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : (outline.title || '未命名幻灯片');

  return {
    agent: 'code-engineer',
    html: fixedHTML,
    title,
    pages: numPages,
  };
}

module.exports = { execute, extractHTMLFromAI };
