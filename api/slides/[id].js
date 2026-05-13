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

// GET /api/slides/[id] — 获取单张幻灯片详情（需登录，只能看自己的）
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', success: false });
  }

  const user = verifyToken(req);
  if (!user) {
    return res.status(401).json({ error: '请先登录', success: false });
  }

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: '缺少幻灯片ID', success: false });

  try {
    const slide = await prisma.slide.findFirst({
      where: { id: parseInt(id), userId: user.userId },
    });

    if (!slide) {
      return res.status(404).json({ error: '幻灯片不存在', success: false });
    }

    return res.status(200).json({ success: true, slide });
  } catch (err) {
    console.error('Get slide error:', err);
    return res.status(500).json({ error: '获取失败', success: false });
  }
}
