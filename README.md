# ScreenTime Dashboard Bridge

This plugin bridges Obsidian Daily Notes and the local ScreenTime Dashboard project.

## Core features
- Start/stop Dashboard (`start.py` / `stop.py`) from Obsidian commands.
- Open Daily Note by date via protocol:
  `obsidian://screen-time-dashboard-bridge/open-daily?date=YYYY-MM-DD`
- Push vault Daily Note config to Dashboard backend:
  - vault path
  - daily folder
  - daily format
  - timezone
  - ScreenTime heading

## Development
```bash
npm install
npm run build
```

This generates `main.js` required by Obsidian.

## Installation / 安装

### Via BRAT (Recommended for Beta Testing)
1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin in Obsidian.
2. Open BRAT settings and click "Add Beta plugin".
3. Enter the repository URL: `https://github.com/TheodorePeng/obsidian-screentime-dashboard-bridge-peng`
4. Click "Add Plugin" and enable "ScreenTime Dashboard Bridge" in Community Plugins.

> Please refer to the [BRAT developer guide](https://tfthacker.com/brat-developers) for the latest workflow details.

### 通过 BRAT 安装（推荐用于测试版）
1. 在 Obsidian 中安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件。
2. 打开 BRAT 设置，点击「Add Beta plugin」。
3. 输入仓库地址：`https://github.com/TheodorePeng/obsidian-screentime-dashboard-bridge-peng`
4. 点击「Add Plugin」，然后在社区插件中启用「ScreenTime Dashboard Bridge」。

> 请以 [BRAT 官方文档](https://tfthacker.com/brat-developers) 为准，本说明可能随 BRAT 更新而变化。
