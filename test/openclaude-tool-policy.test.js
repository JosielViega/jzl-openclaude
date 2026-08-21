import assert from 'node:assert/strict'
import {
  mkdirSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { createOpenClaudeToolPolicy } from '../src/openclaude-tool-policy.js'

let temporaryBase
let projectRoot
let externalRoot
let canUseTool
let initialRootEntries

before(() => {
  temporaryBase = mkdtempSync(join(tmpdir(), 'jzl-tool-policy-'))
  projectRoot = join(temporaryBase, 'project')
  externalRoot = join(temporaryBase, 'external')

  mkdirSync(join(projectRoot, 'src'), { recursive: true })
  mkdirSync(join(projectRoot, '.jzl'))
  mkdirSync(join(projectRoot, '.git'))
  mkdirSync(join(projectRoot, '.openclaude'))
  mkdirSync(externalRoot)
  writeFileSync(join(projectRoot, 'AGENTS.md'), 'protected agents')
  writeFileSync(join(projectRoot, 'src', 'inside.txt'), 'inside')
  writeFileSync(join(projectRoot, '.jzl', 'state.json'), '{}')
  writeFileSync(join(projectRoot, '.git', 'config'), 'config')
  writeFileSync(join(projectRoot, '.openclaude', 'settings.json'), '{}')
  writeFileSync(join(projectRoot, 'src', 'hardlinked.txt'), 'normal hardlink')
  writeFileSync(join(externalRoot, 'outside.txt'), 'outside')
  linkSync(
    join(projectRoot, '.jzl', 'state.json'),
    join(projectRoot, 'state-hardlink.json'),
  )
  linkSync(
    join(projectRoot, 'AGENTS.md'),
    join(projectRoot, 'agents-hardlink.txt'),
  )
  linkSync(
    join(projectRoot, 'src', 'hardlinked.txt'),
    join(projectRoot, 'src', 'hardlinked-alias.txt'),
  )

  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  symlinkSync(externalRoot, join(projectRoot, 'external-link'), linkType)
  symlinkSync(join(projectRoot, '.jzl'), join(projectRoot, 'state-alias'), linkType)

  initialRootEntries = readdirSync(projectRoot).sort()
  canUseTool = createOpenClaudeToolPolicy(projectRoot)
})

after(() => {
  rmSync(temporaryBase, { recursive: true, force: true })
})

async function assertDenied(name, input) {
  const result = await canUseTool(name, input)

  assert.equal(result.behavior, 'deny')
  assert.equal(typeof result.message, 'string')
  assert.ok(result.message.includes('JZL'))
}

test('autoriza Read de arquivo interno e AGENTS.md', async () => {
  assert.deepEqual(
    await canUseTool('Read', {
      file_path: join(projectRoot, 'src', 'inside.txt'),
    }),
    { behavior: 'allow' },
  )
  assert.deepEqual(
    await canUseTool('Read', { file_path: join(projectRoot, 'AGENTS.md') }),
    { behavior: 'allow' },
  )
})

test('autoriza Write interno novo e existente sem escrever', async () => {
  assert.equal(statSync(join(projectRoot, 'src', 'inside.txt')).nlink, 1)
  assert.deepEqual(
    await canUseTool('Write', {
      file_path: join(projectRoot, 'src', 'new.txt'),
      content: 'new',
    }),
    { behavior: 'allow' },
  )
  assert.deepEqual(
    await canUseTool('Write', {
      file_path: join(projectRoot, 'src', 'inside.txt'),
      content: 'changed',
    }),
    { behavior: 'allow' },
  )
  assert.equal(readFileSync(join(projectRoot, 'src', 'inside.txt'), 'utf8'), 'inside')
  assert.equal(readdirSync(join(projectRoot, 'src')).includes('new.txt'), false)
})

test('autoriza Edit de arquivo interno sem alterar conteúdo', async () => {
  assert.deepEqual(
    await canUseTool('Edit', {
      file_path: join(projectRoot, 'src', 'inside.txt'),
      old_string: 'inside',
      new_string: 'changed',
    }),
    { behavior: 'allow' },
  )
  assert.equal(readFileSync(join(projectRoot, 'src', 'inside.txt'), 'utf8'), 'inside')
})

test('autoriza Glob com base padrão e interna', async () => {
  assert.deepEqual(
    await canUseTool('Glob', { pattern: '**/*.txt' }),
    { behavior: 'allow' },
  )
  assert.deepEqual(
    await canUseTool('Glob', { pattern: '*.txt', path: 'src' }),
    { behavior: 'allow' },
  )
})

test('autoriza Grep com base padrão, diretório e arquivo internos', async () => {
  assert.deepEqual(
    await canUseTool('Grep', { pattern: 'inside' }),
    { behavior: 'allow' },
  )
  assert.deepEqual(
    await canUseTool('Grep', { pattern: 'inside', path: 'src' }),
    { behavior: 'allow' },
  )
  assert.deepEqual(
    await canUseTool('Grep', {
      pattern: 'inside',
      path: join(projectRoot, 'src', 'inside.txt'),
      glob: '*.txt',
    }),
    { behavior: 'allow' },
  )
})

test('nega allowlist fechada e chamadas malformadas', async () => {
  await assertDenied('Bash', { command: 'echo no' })
  await assertDenied('Agent', { prompt: 'no' })
  await assertDenied('FutureTool', {})
  await assertDenied('Write', { content: 'missing path' })
  await assertDenied('Read', null)
})

test('nega Read, Write e Edit externos antes de acessá-los', async () => {
  const externalFile = join(externalRoot, 'outside.txt')

  await assertDenied('Read', { file_path: externalFile })
  await assertDenied('Write', { file_path: externalFile, content: 'no' })
  await assertDenied('Edit', {
    file_path: externalFile,
    old_string: 'outside',
    new_string: 'no',
  })
})

test('nega bases externas e escapes de Glob e Grep', async () => {
  await assertDenied('Glob', { pattern: '*.txt', path: externalRoot })
  await assertDenied('Grep', { pattern: 'x', path: externalRoot })
  await assertDenied('Glob', { pattern: 'src/../../*' })
  await assertDenied('Grep', { pattern: 'x', glob: '../*.txt' })
})

test('nega junction externa para todas as operações com path', async () => {
  const linkedExternalFile = join(projectRoot, 'external-link', 'outside.txt')

  await assertDenied('Read', { file_path: linkedExternalFile })
  await assertDenied('Write', {
    file_path: linkedExternalFile,
    content: 'no',
  })
  await assertDenied('Edit', {
    file_path: linkedExternalFile,
    old_string: 'outside',
    new_string: 'no',
  })
  await assertDenied('Glob', {
    pattern: '*.txt',
    path: join(projectRoot, 'external-link'),
  })
  await assertDenied('Grep', {
    pattern: 'outside',
    path: join(projectRoot, 'external-link'),
  })
})

test('protege áreas autoritativas contra Write', async () => {
  for (const filePath of [
    join(projectRoot, '.jzl', 'state.json'),
    join(projectRoot, '.git', 'config'),
    join(projectRoot, '.openclaude', 'settings.json'),
    join(projectRoot, 'AGENTS.md'),
  ]) {
    await assertDenied('Write', { file_path: filePath, content: 'no' })
  }
})

test('protege AGENTS.md contra Edit e casing alternativo no Windows', async () => {
  await assertDenied('Edit', {
    file_path: join(projectRoot, 'AGENTS.md'),
    old_string: 'protected',
    new_string: 'no',
  })

  if (process.platform === 'win32') {
    await assertDenied('Write', {
      file_path: join(projectRoot, 'AGENTS.MD'),
      content: 'no',
    })
  }
})

test('protege alias físico para área protegida', async () => {
  await assertDenied('Write', {
    file_path: join(projectRoot, 'state-alias', 'state.json'),
    content: 'no',
  })
  await assertDenied('Edit', {
    file_path: join(projectRoot, 'state-alias', 'state.json'),
    old_string: '{}',
    new_string: 'no',
  })
})

test('nega hard link para .jzl em Write e Edit', async () => {
  const statePath = join(projectRoot, '.jzl', 'state.json')
  const hardlinkPath = join(projectRoot, 'state-hardlink.json')
  const originalContent = readFileSync(statePath)

  assert.ok(statSync(hardlinkPath).nlink > 1)
  assert.deepEqual(
    await canUseTool('Read', { file_path: hardlinkPath }),
    { behavior: 'allow' },
  )
  await assertDenied('Write', { file_path: hardlinkPath, content: 'no' })
  await assertDenied('Edit', {
    file_path: hardlinkPath,
    old_string: '{}',
    new_string: 'no',
  })
  assert.deepEqual(readFileSync(statePath), originalContent)
})

test('nega hard link para AGENTS.md em Write e Edit', async () => {
  const agentsPath = join(projectRoot, 'AGENTS.md')
  const hardlinkPath = join(projectRoot, 'agents-hardlink.txt')
  const originalContent = readFileSync(agentsPath)

  assert.ok(statSync(hardlinkPath).nlink > 1)
  await assertDenied('Write', { file_path: hardlinkPath, content: 'no' })
  await assertDenied('Edit', {
    file_path: hardlinkPath,
    old_string: 'protected agents',
    new_string: 'no',
  })
  assert.deepEqual(readFileSync(agentsPath), originalContent)
})

test('nega modificação de qualquer arquivo normal com múltiplos hard links', async () => {
  const filePath = join(projectRoot, 'src', 'hardlinked.txt')
  const aliasPath = join(projectRoot, 'src', 'hardlinked-alias.txt')
  const originalContent = readFileSync(filePath)

  assert.ok(statSync(filePath).nlink > 1)
  await assertDenied('Write', { file_path: filePath, content: 'no' })
  await assertDenied('Edit', {
    file_path: aliasPath,
    old_string: 'normal hardlink',
    new_string: 'no',
  })
  assert.deepEqual(readFileSync(filePath), originalContent)
})

test('policy não cria, altera ou remove entradas', () => {
  assert.deepEqual(readdirSync(projectRoot).sort(), initialRootEntries)
  assert.equal(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), 'protected agents')
  assert.equal(readFileSync(join(externalRoot, 'outside.txt'), 'utf8'), 'outside')
})
