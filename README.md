# 万物备忘

把本机软件、本地项目、网址和一段文字记在本地，对话里找回来，确认后再打开或运行。

## 开发

需要 Node 20+（本仓库已用 Volta 钉在 20.20.2）。

```bash
npm install
npm run dev
```

首次打开可先在「对话」里说「记住……」试用本地粗整理。接上 DeepSeek / OpenAI / 智谱 / Cursor SDK 密钥后，会先读路径、git 或网页再出确认卡。

例子：

- 「帮我记住我电脑上有个小红薯视频下载软件，名字叫 xx」→ 出确认卡，点确定入库
- 「小红薯视频下载软件」→ 先列出相关项，再问要不要打开
- 丢 `~/code/foo`、git 地址或网址，模型会先读源再整理

打包安装后，数据在系统 userData，和安装目录分开。

## 打包

```bash
npm run package:mac
npm run package:win
```

产物在 `dist/`。Windows 包建议在 Windows 机器或 CI 上打。`better-sqlite3` 会在 `postinstall` 里按 Electron 版本重建。

## 数据

全部在系统 userData 目录的 SQLite 里。设置页可导出 zip、换机导入。导出不含 API Key。路径会写成 `{{HOME}}` 等占位符。
