import fs from 'fs'
import path from 'path'
import url from 'url'
import json from '@rollup/plugin-json'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const lambdas = fs.readdirSync(path.join(__dirname, 'src', 'aws', 'lambdas'))

const isProduction = process.env.NODE_ENV === 'production'

/** @type {import('rollup').RollupOptions[]} */
export default lambdas.map(lambda => ({
  input: `src/aws/lambdas/${lambda}/index.mjs`,
  output: [ {
    file: `dist/${lambda}/index.mjs`,
    format: 'esm',
    plugins: [isProduction && terser({
      module: true,
      format: {
        comments: false,
      }
    })],
  }],
  plugins: [
    json(),
    commonjs({
      dynamicRequireTargets: [
        '@img/sharp-wasm32/sharp.node',
        '@img/sharp-linux-x64/sharp.node',
        '**/sharp-wasm32.node',
        '**/sharp-linux-x64.node',
      ]
    }),
    resolve(),
  ],
  external: [/^@aws-sdk\/.*/, 'sharp'],
  context: 'globalThis',
}))
