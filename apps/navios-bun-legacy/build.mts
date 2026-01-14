Bun.build({
  entrypoints: ['./src/main.mts'],
  outdir: './bundle',
  target: 'bun',
  format: 'esm',
  packages: 'external',
  // minify: true,
  splitting: true,
})
console.log('done')
