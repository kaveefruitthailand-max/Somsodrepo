import { readFile } from 'node:fs/promises'
import { Script } from 'node:vm'

const requiredFiles = ['public/index.html', 'ai-chat.mjs', 'sheets-proxy.mjs']

for (const file of requiredFiles) {
  await readFile(file, 'utf8')
}

const html = await readFile('public/index.html', 'utf8')
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\bsrc\s*=/.test(match[1]))

for (const [index, match] of inlineScripts.entries()) {
  new Script(match[2], { filename: `public/index.html inline script ${index + 1}` })
}

console.log('Static site validation passed')
