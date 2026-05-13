// Quality Inspector Agent - 质量检查员
// 职责：检查 HTML 完整性，修复常见问题

function validateHTML(html) {
  const issues = [];

  // 检查基本结构
  if (!html.includes('<!DOCTYPE')) issues.push('缺少 DOCTYPE 声明');
  if (!html.includes('<html')) issues.push('缺少 <html> 标签');
  if (!html.includes('</html>')) issues.push('缺少 </html> 闭合标签');
  if (!html.includes('<head>')) issues.push('缺少 <head> 标签');
  if (!html.includes('<body>')) issues.push('缺少 <body> 标签');

  // 检查 reveal.js 关键元素
  if (!html.includes('Reveal.initialize')) issues.push('缺少 Reveal.initialize 配置');
  if (!html.includes('class="reveal"')) issues.push('缺少 reveal 容器');
  if (!html.includes('class="slides"')) issues.push('缺少 slides 容器');

  // 检查标签闭合（简单检查）
  const openTags = (html.match(/<section[^>]*>/g) || []).length;
  const closeTags = (html.match(/<\/section>/g) || []).length;
  if (openTags !== closeTags) issues.push(`<section> 标签未闭合: ${openTags} 开启, ${closeTags} 闭合`);

  // 检查 script 标签闭合
  const scriptOpen = (html.match(/<script[^>]*>/g) || []).length;
  const scriptClose = (html.match(/<\/script>/g) || []).length;
  if (scriptOpen !== scriptClose) issues.push(`<script> 标签未闭合`);

  return issues;
}

function fixCommonIssues(html) {
  let fixed = html;

  // 补全 DOCTYPE
  if (!fixed.includes('<!DOCTYPE')) {
    fixed = '<!DOCTYPE html>\n' + fixed;
  }

  // 补全 html 标签
  if (!fixed.includes('<html')) {
    fixed = '<html lang="zh-CN">\n' + fixed;
  }
  if (!fixed.includes('</html>')) {
    fixed = fixed + '\n</html>';
  }

  // 修复未闭合的 script 标签（简单处理）
  const scriptOpen = (fixed.match(/<script[^>]*>/g) || []).length;
  const scriptClose = (fixed.match(/<\/script>/g) || []).length;
  if (scriptOpen > scriptClose) {
    fixed = fixed + '\n</script>';
  }

  return fixed;
}

async function execute({ html }) {
  if (!html || !html.trim()) {
    throw new Error('缺少 HTML 内容');
  }

  const issues = validateHTML(html);
  let fixedHTML = html;

  if (issues.length > 0) {
    console.log('质检发现的问题:', issues);
    fixedHTML = fixCommonIssues(html);

    // 再次检查
    const remainingIssues = validateHTML(fixedHTML);
    if (remainingIssues.length > 0) {
      console.warn('修复后仍有问题:', remainingIssues);
    }
  }

  return {
    agent: 'quality-inspector',
    issues,
    issuesFixed: issues.length > 0,
    html: fixedHTML,
    isValid: issues.length === 0 || (validateHTML(fixedHTML).length === 0),
  };
}

module.exports = { execute, validateHTML, fixCommonIssues };
