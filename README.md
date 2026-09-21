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
npm run test
npm run build
```

This generates `main.js` required by Obsidian.

## Dashboard launch identity

- Canonical Dashboard path: `/Users/peng/Documents/GitHub-Peng/ScreenTimeDashboard`.
- Version 0.1.3 migrates the retired path only when that path is missing and the canonical checkout contains both `start.py` and `stop.py`.
- A valid custom path is never overwritten.
- Version 0.1.5 resolves and probes an absolute Python 3.11+ executable before running `start.py` or `stop.py`. It prefers the project virtual environment, then common Homebrew/Python installations, and only then candidates from Obsidian's `PATH`.
- The optional Python interpreter setting is an advanced override. Leave it blank for automatic detection; a non-empty value must be an absolute path (a leading `~/` is supported) and fails closed when invalid.
- Dashboard launch does not depend on Terminal shell initialization or the Xcode-backed `/usr/bin/python3` being usable.
- After launch, the plugin checks `GET /api/system/runtime`. It opens the browser only when the app id, real project path, and launch mode match the configured checkout.
- If another program owns ports 8000/5173, the Dashboard refuses to terminate that unknown process.

For local deployment, copy `main.js`, `manifest.json`, and `styles.css` into the Vault plugin directory and keep its `data.json` unchanged. Reload the plugin in Obsidian after copying.

The regular test suite validates local BRAT assets without network access. Checking assets attached to a published GitHub Release is a separate post-release verification step.

## Installation / 安装

### Via BRAT (Recommended for Beta Testing)
1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin in Obsidian.
2. Open BRAT settings and click "Add Beta plugin".
3. Enter the repository URL: `https://github.com/TheodorePeng/obsidian-screentime-dashboard-bridge-peng`
4. Click "Add Plugin" and enable "ScreenTime Dashboard Bridge" in Community Plugins.

> Please refer to the [BRAT developer guide](https://tfthacker.com/brat-developers) for the latest workflow details.

After a new release is pushed to GitHub, use BRAT's manual update action to install the tracked `manifest.json`/`main.js` version.

### 通过 BRAT 安装（推荐用于测试版）
1. 在 Obsidian 中安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件。
2. 打开 BRAT 设置，点击「Add Beta plugin」。
3. 输入仓库地址：`https://github.com/TheodorePeng/obsidian-screentime-dashboard-bridge-peng`
4. 点击「Add Plugin」，然后在社区插件中启用「ScreenTime Dashboard Bridge」。

> 请以 [BRAT 官方文档](https://tfthacker.com/brat-developers) 为准，本说明可能随 BRAT 更新而变化。
