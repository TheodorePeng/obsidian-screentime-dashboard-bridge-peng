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
