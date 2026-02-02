/**
 * Resize images/icon.png to 28x28 for VS Code Activity Bar (viewsContainers).
 * Run after npm install (prepare script). Requires: npm install sharp --save-dev
 */
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const srcPath = path.join(root, 'images', 'icon.png')
const outPath = path.join(root, 'images', 'icon-activitybar.png')
const size = 28

if (!fs.existsSync(srcPath)) {
  console.warn('PatchX: images/icon.png not found, skipping activity bar icon resize.')
  process.exit(0)
}

let sharp
try {
  sharp = require('sharp')
} catch (e) {
  console.warn('PatchX: sharp not installed. Run: npm install sharp --save-dev. Skipping activity bar icon resize.')
  process.exit(0)
}

sharp(srcPath)
  .resize(size, size)
  .png()
  .toFile(outPath)
  .then(() => console.log('PatchX: activity bar icon written to images/icon-activitybar.png (28x28)'))
  .catch((err) => {
    console.error('PatchX: failed to resize activity bar icon:', err.message)
    process.exit(1)
  })
