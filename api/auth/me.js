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

// GET /api/auth/me — 获取当前登录用户信息
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

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    if (!dbUser) {
      return res.status(404).json({ error: '用户不存在', success: false });
    }

    return res.status(200).json({ success: true, user: dbUser });
  } catch (err) {
    console.error('Get user error:', err);
    return res.status(500).json({ error: '服务器错误', success: false });
  }
}
