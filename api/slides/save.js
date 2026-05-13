import { prisma } from '../lib/prisma.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 验证 JWT token，获取 userId
function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 验证登录
  const user = verifyToken(req);
  if (!user) {
    return res.status(401).json({ error: '请先登录', success: false });
  }

  if (req.method === 'POST') {
    // ===== 保存幻灯片 =====
    const { title, html, theme, transition, pages, outline, designSpec } = req.body || {};

    if (!title || !html) {
      return res.status(400).json({ error: '标题和内容不能为空', success: false });
    }

    try {
      const slide = await prisma.slide.create({
        data: {
          title,
          html,
          theme: theme || 'black',
          transition: transition || 'slide',
          pages: pages || 8,
          outline: outline || null,
          designSpec: designSpec || null,
          userId: user.userId,
        },
      });

      return res.status(201).json({
        success: true,
        message: '幻灯片已保存',
        slide: {
          id: slide.id,
          title: slide.title,
          theme: slide.theme,
          transition: slide.transition,
          pages: slide.pages,
          createdAt: slide.createdAt,
        },
      });
    } catch (err) {
      console.error('Save slide error:', err);
      return res.status(500).json({ error: '保存失败', success: false });
    }
  }

  return res.status(405).json({ error: 'Method not allowed', success: false });
}
