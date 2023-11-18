import fs from 'fs'
import path from 'path'
import url from 'url'

/** @typedef {import('telegraf').Context} Context */

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), { encoding: 'utf-8' }))

export function useCommonFlow() {
  /** @param {Context} context */
  async function start(context) {
    await context.reply('👋 Hi, just send a sticker to continue.')
  }

  /** @param {Context} context */
  async function version(context) {
    await context.reply(`Version: ${packageJson.version}`)
  }

  return {
    start,
    version,
  }
}