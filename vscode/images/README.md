# Icons

## icon.png (main extension icon)

Place the PatchX VS Code extension icon here as `icon.png`.

- **Size**: 128×128 pixels (for marketplace and general use)
- **Format**: PNG
- **Background**: Transparent or solid color

## Activity Bar (sidebar) icon

The Activity Bar uses a **28×28** version so the sidebar icon displays correctly. Generate it from `icon.png`:

```bash
npm run resize-icon
```

This runs `scripts/resize-activitybar-icon.js` (requires `sharp`) and writes **`icon-activitybar.png`** (28×28). The same script runs automatically after `npm install` (`prepare` script). If the sidebar icon is missing, run `npm run resize-icon` or `npm install` in the `vscode` folder.
