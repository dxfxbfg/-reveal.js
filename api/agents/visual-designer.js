// Visual Designer Agent - 视觉设计师
// 职责：根据大纲内容，设计配色方案、字体、背景效果

const { callZhipuAI } = require('../utils/ai-client');

function buildPrompt(outline, theme, transition) {
  const outlineJson = JSON.stringify(outline, null, 2);
  return `你是一个专业的幻灯片视觉设计师。请根据以下幻灯片大纲，设计一套完整的视觉方案。

## 大纲内容
${outlineJson}

## 用户选择的主题
- reveal.js 主题: ${theme}
- 转场效果: ${transition}

## 输出要求
返回严格 JSON 格式，不要 markdown 代码块，不要额外文字：

\`\`\`json
{
  "theme": "${theme}",
  "transition": "${transition}",
  "colorPalette": {
    "primary": "#667eea",
    "secondary": "#764ba2", 
    "accent": "#f093fb",
    "background": "#1a1a2e",
    "text": "#ffffff",
    "textMuted": "rgba(255,255,255,0.7)"
  },
  "fonts": {
    "heading": "'Inter', sans-serif",
    "body": "'Inter', sans-serif"
  },
  "slideDesigns": [
    {
      "slideIndex": 0,
      "background": "linear-gradient(135deg, #667eea, #764ba2)",
      "textColor": "#ffffff",
      "layout": "center",
      "effects": ["glow", "blur"]
    }
  ],
  "globalEffects": {
    "useGradientBackgrounds": true,
    "useGlassmorphism": true,
    "useAnimations": true,
    "useFragments": true
  }
}
\`\`\`

设计原则：
1. 配色要专业统一，2-3个主色
2. 背景要丰富多样（渐变、纯色、图片）
3. 每页幻灯片应该有独特的视觉设计
4. 考虑内容的情感色彩（科技用冷色、商业用稳重的颜色等）
5. 确保文字在背景上清晰可读`;
}

async function execute({ outline, theme = 'black', transition = 'slide' }) {
  if (!outline || !outline.slides) {
    throw new Error('缺少大纲数据');
  }

  const aiContent = await callZhipuAI([
    { role: 'system', content: '你是一个专业的幻灯片视觉设计师，擅长配色和视觉设计。' },
    { role: 'user', content: buildPrompt(outline, theme, transition) }
  ], 4000);

  // 安全提取 JSON
  const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 未返回有效设计规范');

  let designSpec;
  try {
    designSpec = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    throw new Error('AI 返回的设计规范格式不正确');
  }

  // 验证必要字段
  if (!designSpec.colorPalette || !designSpec.slideDesigns) {
    throw new Error('设计规范缺少必要字段');
  }

  return {
    agent: 'visual-designer',
    designSpec,
    theme,
    transition,
  };
}

module.exports = { execute };
