# SlideGen - AI 幻灯片生成器

基于 reveal.js v5 的 AI 驱动幻灯片生成器，部署在 Vercel。

## ✨ 核心功能

- 🤖 **AI 生成幻灯片** - 使用智谱 GLM 模型生成完整 reveal.js HTML
- 🎨 **12 种主题** - black / white / moon / night / dracula / sky / blood / beige / league / serif / solarized
- 🎬 **6 种转场效果** - slide / fade / zoom / convex / concave / none
- 📝 **在线编辑器** - 实时预览、代码格式化、编辑历史
- ⬇️ **导出功能** - 下载 HTML、复制代码、导出 PDF

## 🚀 快速部署

### 部署到 Vercel

1. **准备 API Key**
   - 访问 [智谱开放平台](https://open.bigmodel.cn/usercenter/apikeys) 获取 API Key

2. **部署项目**
   - 使用 Vercel 一键部署按钮：
   
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/slidegen&env=ZHIPU_API_KEY&project-name=slidegen&repository-name=slidegen)

3. **配置环境变量**
   - 在 Vercel 项目设置中添加：`ZHIPU_API_KEY=your_key_here`

### 本地开发

```bash
# 安装依赖
npm install

# 设置环境变量
cp .env.example .env.local
# 编辑 .env.local 添加 ZHIPU_API_KEY

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

## 📁 项目结构

```
slidegen/
├── api/generate.js       # 核心 API：调用智谱 AI
├── public/               # 前端文件
│   ├── index.html       # 主页
│   ├── preview.html     # 预览页
│   └── css/style.css    # 样式文件
├── package.json         # 项目配置
└── vercel.json          # Vercel 配置
```

## 🔧 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `ZHIPU_API_KEY` | ✅ | 智谱 AI API Key |

## 📞 技术支持

部署问题请查看 Vercel 日志或检查环境变量配置。