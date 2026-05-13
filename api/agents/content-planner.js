// Content Planner Agent - 内容策划师
// 职责：分析用户需求，生成结构化幻灯片大纲

const { callZhipuAI } = require('../utils/ai-client');

function buildPrompt(pages, userPrompt) {
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
- end: 结束页，content 放 ["Q & A"]

用户描述：${userPrompt}`;
}

async function execute({ prompt, pages = 8 }) {
  if (!prompt || !prompt.trim()) {
    throw new Error('请提供幻灯片描述');
  }

  const numPages = Math.min(Math.max(parseInt(pages) || 8, 4), 20);
  const aiContent = await callZhipuAI([
    { role: 'system', content: '你是一个专业的幻灯片内容策划师。' },
    { role: 'user', content: buildPrompt(numPages, prompt.trim()) }
  ], 4000);

  // 安全提取 JSON
  const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 未返回有效 JSON');

  let outline;
  try {
    outline = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    throw new Error('AI 返回的 JSON 格式不正确');
  }

  if (!outline.title || !Array.isArray(outline.slides)) {
    throw new Error('大纲格式无效：缺少 title 或 slides');
  }

  return {
    agent: 'content-planner',
    outline,
    pages: numPages,
  };
}

module.exports = { execute };
