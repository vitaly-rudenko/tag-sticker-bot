import fs from 'fs'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), { encoding: 'utf-8' }))

/**
 * @param {import('lambda-api').Request} req 
 * @param {import('lambda-api').Response} res 
 * @param {import('lambda-api').NextFunction | undefined} next 
 */
export function health(req, res, next) {
  res.status(200).json({ version: packageJson.version })
}
