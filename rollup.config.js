import json from '@rollup/plugin-json'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'

/** @type {import('rollup').RollupOptions} */
export default {
  input: 'src/aws/lambda/lambda.js',
  output: {
    file: 'dist/lambda.mjs',
    format: 'esm',
  },
  plugins: [
    json(),
    commonjs(),
    resolve(),
  ],
  external: [/^@aws-sdk\/.*/],
  context: 'globalThis',
}
