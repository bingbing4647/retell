# 朵拉英语九宫格复述 · Dora Retell

给三年级小朋友看的《爱探险的朵拉》英语复述练习站。看完一集动画，用 **九张剧照 + 九句英文**
把故事讲一遍，可在线朗读、可打印成 A4 单页。

目前收录：**Season 02（26 集）+ Season 03（25 集）= 51 集**。

## 技术栈

- Next.js 15（App Router，`output: "export"` 纯静态导出）
- React 19
- 无后端、无数据库，所有剧集数据编译期静态生成

## 本地运行

```bash
npm install
npm run dev          # 开发预览 http://localhost:3000
npm run build        # 导出静态站到 out/
npx serve out        # 或任意静态服务器
```

> 注：Windows 上若 `next build` 在沙箱环境报 `EPERM`，需在非沙箱终端执行。

## 目录结构

```
app/                   页面（首页 + /lesson/[id] 静态路由）
components/            NineGrid 等组件（A4 纸面模拟、朗读、打印）
lib/
  parts/SxxEyy.json    ← 每集一个内容分片，加新集只改这里
  lessons.json         ← 合并后的总数据（由脚本生成，勿手改）
public/img/sxxeyy/     每集 9 张剧照 f1..f9.jpg（768×576，取自片源原字幕）
scripts/merge-lessons.py  校验 + 合并分片
```

## 加一集怎么做

1. 从片源抽 9 帧，存到 `public/img/<小写集号>/f1..f9.jpg`
2. 写 `lib/parts/<SxxEyy>.json`（9 格英文句 + 12 个词 + opener/ending）
3. `python scripts/merge-lessons.py`
4. `npm run build`

合并脚本会校验：9 格序号连续、12 组词、图片真实存在且 > 4KB、
英文句 6–22 词、`key` 里的词确实出现在句子里。

## PDF 下载（单集 / 整季）

站点提供两种下载：

- **单集**：详情页「下载本集 PDF」→ `public/pdf/SxxEyy.pdf`
- **整季**：首页切到某一季，顶部出现「整季 PDF · N 页」→ `public/pdf/season-XX.pdf`
  （整季文件带每集书签，可直接跳转）

PDF 是**构建期预生成**的静态文件，不是浏览器打印：

```bash
npm run build            # 先导出 out/
npx serve out            # 或 python -m http.server 3111 -d out
npm run pdf              # Playwright 逐集打印 A4 → public/pdf/*.pdf
                         # 再用 pypdf 按季合并 + 生成 manifest.json
```

- `npm run pdf:one S03E01` 只重做指定集；`ONLY_MISSING=1` 跳过已存在的
- 依赖：`playwright`（本机已装 Chromium）+ Python `pypdf`
- `manifest.json` 记录每集页数与体积，站点按钮文案从这里读；
  文件缺失时按钮自动隐藏，不会出现死链

## 内容标准（三年级）

- 每格英文 8–14 词，只用一般现在时 / `there is` / `can`
- 每格配一行中文小字，方便家长核对
- Word Bank 收 12 个词，含当集出现的西语词（如 `¡Vamos!`）
- 页面恒为 A4 纵向单页：页头 / 3×3 九宫格 / Word Bank + 复述框架 + 自评签字
- 剧照保留原片英文字幕，孩子可以「看图 — 对字幕 — 说句子」

## 素材来源

《爱探险的朵拉》（Dora the Explorer）剧集截图，仅用于家庭英语学习。
