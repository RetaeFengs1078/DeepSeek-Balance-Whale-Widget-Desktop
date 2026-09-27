const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const source = path.join(root, 'installer', 'watch.ps1')
const target = path.join(root, 'dist', 'WhaleWidget-win32-x64', 'watch.ps1')
fs.copyFileSync(source, target)
fs.copyFileSync(path.join(root, 'assets', 'whale.ico'), path.join(root, 'dist', 'WhaleWidget-win32-x64', 'whale.ico'))
console.log('Copied conditional launcher and whale icon to Windows package')
