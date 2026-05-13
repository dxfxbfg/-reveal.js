// API: /api/generate
// 支持多 Agent 分步工作流
// action 参数:
//   - outline:     内容策划 Agent
//   - design:      视觉设计 Agent
//   - code:        代码生成 Agent
//   - inspect:     质量检查 Agent
//   - full:        完整工作流（串行执行所有 Agent）

const contentPlanner = require('./agents/content-planner');
const visualDesigner = require('./agents/visual-designer');
const codeEngineer = require('./agents/code-engineer');
const qualityInspector = require('./agents/quality-inspector');

// ========================= 完整工作流 =========================
async function runFullWorkflow({ prompt, theme, transition, pages }) {
  const results = {
    steps: [],
    success: false,
  };

  // Step 1: 内容策划
  try {
    const step1 = await contentPlanner.execute({ prompt, pages });
    results.steps.push({ agent: 'content-planner', status: 'success', data: step1 });
    results.outline = step1.outline;
  } catch (err) {
    results.steps.push({ agent: 'content-planner', status: 'error', error: err.message });
    throw new Error(`内容策划失败: ${err.message}`);
  }

  // Step 2: 视觉设计
  try {
    const step2 = await visualDesigner.execute({
      outline: results.outline,
      theme: theme || 'black',
      transition: transition || 'slide',
    });
    results.steps.push({ agent: 'visual-designer', status: 'success', data: step2 });
    results.designSpec = step2.designSpec;
  } catch (err) {
    results.steps.push({ agent: 'visual-designer', status: 'error', error: err.message });
    throw new Error(`视觉设计失败: ${err.message}`);
  }

  // Step 3: 代码生成
  try {
    const step3 = await codeEngineer.execute({
      outline: results.outline,
      designSpec: results.designSpec,
      pages,
    });
    results.steps.push({ agent: 'code-engineer', status: 'success', data: step3 });
    results.html = step3.html;
    results.title = step3.title;
  } catch (err) {
    results.steps.push({ agent: 'code-engineer', status: 'error', error: err.message });
    throw new Error(`代码生成失败: ${err.message}`);
  }

  // Step 4: 质量检查
  try {
    const step4 = await qualityInspector.execute({ html: results.html });
    results.steps.push({ agent: 'quality-inspector', status: 'success', data: step4 });
    results.html = step4.html;
    results.qualityCheck = {
      issues: step4.issues,
      issuesFixed: step4.issuesFixed,
      isValid: step4.isValid,
    };
  } catch (err) {
    results.steps.push({ agent: 'quality-inspector', status: 'error', error: err.message });
    // 质检失败不影响整体成功
  }

  results.success = true;
  return results;
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

  try {
    switch (action) {
      // ---------- Step 1: 内容策划 ----------
      case 'outline': {
        const { prompt, pages = 8 } = body;
        const result = await contentPlanner.execute({ prompt, pages });
        return res.status(200).json({
          success: true,
          step: 'outline',
          outline: result.outline,
          pages: result.pages,
        });
      }

      // ---------- Step 2: 视觉设计 ----------
      case 'design': {
        const { outline, theme = 'black', transition = 'slide' } = body;
        if (!outline) {
          return res.status(400).json({ error: '缺少大纲数据', success: false });
        }
        const result = await visualDesigner.execute({ outline, theme, transition });
        return res.status(200).json({
          success: true,
          step: 'design',
          designSpec: result.designSpec,
          theme: result.theme,
          transition: result.transition,
        });
      }

      // ---------- Step 3: 代码生成 ----------
      case 'code': {
        const { outline, designSpec, pages = 8 } = body;
        if (!outline) {
          return res.status(400).json({ error: '缺少大纲数据', success: false });
        }
        const result = await codeEngineer.execute({ outline, designSpec, pages });
        return res.status(200).json({
          success: true,
          step: 'code',
          html: result.html,
          title: result.title,
          pages: result.pages,
        });
      }

      // ---------- Step 4: 质量检查 ----------
      case 'inspect': {
        const { html } = body;
        if (!html) {
          return res.status(400).json({ error: '缺少 HTML 内容', success: false });
        }
        const result = await qualityInspector.execute({ html });
        return res.status(200).json({
          success: true,
          step: 'inspect',
          html: result.html,
          issues: result.issues,
          issuesFixed: result.issuesFixed,
          isValid: result.isValid,
        });
      }

      // ---------- 完整工作流 ----------
      case 'full': {
        const { prompt, theme, transition, pages = 8 } = body;
        if (!prompt || !prompt.trim()) {
          return res.status(400).json({ error: '请提供幻灯片描述', success: false });
        }
        const results = await runFullWorkflow({ prompt, theme, transition, pages });
        return res.status(200).json({
          success: true,
          step: 'full',
          title: results.title,
          html: results.html,
          outline: results.outline,
          designSpec: results.designSpec,
          qualityCheck: results.qualityCheck,
          steps: results.steps,
        });
      }

      // ---------- 默认：向后兼容 ----------
      default: {
        // 兼容旧版调用（无 action 参数）
        const { prompt, outline, theme = 'black', transition = 'slide', pages = 8, mode = 'code' } = body;

        if (!prompt || !prompt.trim()) {
          return res.status(400).json({ error: '请提供幻灯片描述', success: false });
        }

        // 如果提供了 outline，直接走代码生成
        if (outline) {
          try {
            // 尝试生成设计规范（如果用户没提供）
            let designSpec = body.designSpec;
            if (!designSpec) {
              try {
                const designResult = await visualDesigner.execute({ outline, theme, transition });
                designSpec = designResult.designSpec;
              } catch (e) {
                // 设计失败不影响，继续用默认
                designSpec = null;
              }
            }

            const codeResult = await codeEngineer.execute({ outline, designSpec, pages });
            const inspectResult = await qualityInspector.execute({ html: codeResult.html });

            return res.status(200).json({
              success: true,
              title: codeResult.title,
              html: inspectResult.html,
              ai: true,
              model: 'glm-4-flash',
              mode,
            });
          } catch (err) {
            return res.status(500).json({
              error: '生成失败: ' + err.message,
              success: false,
            });
          }
        }

        // 无 outline，走完整工作流
        try {
          const results = await runFullWorkflow({ prompt, theme, transition, pages });
          return res.status(200).json({
            success: true,
            title: results.title,
            html: results.html,
            outline: results.outline,
            ai: true,
            model: 'glm-4-flash',
            mode,
            steps: results.steps,
          });
        } catch (err) {
          return res.status(500).json({
            error: '生成失败: ' + err.message,
            success: false,
          });
        }
      }
    }
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({
      error: err.message,
      success: false,
    });
  }
};
