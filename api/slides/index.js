import { prisma } from '../lib/prisma.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req);
  if (!user) {
    return res.status(401).json({ error: '请先登录', success: false });
  }

  if (req.method === 'GET') {
    // 列出该用户所有幻灯片
    try {
      const slides = await prisma.slide.findMany({
        where: { userId: user.userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          theme: true,
          transition: true,
          pages: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return res.status(200).json({ success: true, slides });
    } catch (err) {
      console.error('List slides error:', err);
      return res.status(500).json({ error: '获取列表失败', success: false });
    }
  }

  if (req.method === 'DELETE') {
    // 删除幻灯片（只能删除自己的）
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: '缺少幻灯片ID', success: false });

    try {
      const slide = await prisma.slide.findFirst({
        where: { id: parseInt(id), userId: user.userId },
      });

      if (!slide) {
        return res.status(404).json({ error: '幻灯片不存在或无权删除', success: false });
      }

      await prisma.slide.delete({ where: { id: parseInt(id) } });

      return res.status(200).json({ success: true, message: '已删除' });
    } catch (err) {
      console.error('Delete slide error:', err);
      return res.status(500).json({ error: '删除失败', success: false });
    }
  }

  return res.status(405).json({ error: 'Method not allowed', success: false });
}
