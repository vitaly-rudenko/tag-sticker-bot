import fs from 'fs'
import path from 'path'
import url from 'url'
import json from '@rollup/plugin-json'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const lambdas = fs.readdirSync(path.join(__dirname, 'src', 'aws', 'lambdas'))

/** @type {import('rollup').RollupOptions[]} */
export default lambdas.map(lambda => ({
  input: `src/aws/lambdas/${lambda}/index.mjs`,
  output: [{
    file: `dist/dev/${lambda}/index.mjs`,
    format: 'esm',
  }, {
    file: `dist/prod/${lambda}/index.mjs`,
    format: 'esm',
    plugins: [terser({
      module: true,
      format: {
        comments: false,
      }
    })],
  }],
  plugins: [
    json(),
    commonjs(),
    resolve(),
  ],
  external: [/^@aws-sdk\/.*/],
  context: 'globalThis',
}))
