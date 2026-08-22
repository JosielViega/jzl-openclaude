import { isAbsolute } from 'node:path'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateProjectConfig(config) {
  if (!isObject(config)) {
    throw new Error('configuração do projeto deve ser um objeto')
  }

  if (config.schemaVersion === undefined) {
    throw new Error('schemaVersion da configuração do projeto é obrigatório')
  }

  if (!Number.isInteger(config.schemaVersion) || config.schemaVersion <= 0) {
    throw new Error(
      'schemaVersion da configuração do projeto deve ser um inteiro positivo',
    )
  }

  if (config.schemaVersion !== 1) {
    throw new Error('schemaVersion da configuração do projeto não é suportado')
  }

  if (config.template === undefined) {
    throw new Error('template da configuração do projeto é obrigatório')
  }

  if (typeof config.template !== 'string') {
    throw new Error('template da configuração do projeto deve ser uma string')
  }

  if (config.template.trim() === '') {
    throw new Error('template da configuração do projeto não pode ser vazio')
  }

  if (config.template !== 'traditional-web') {
    throw new Error('template da configuração do projeto não é suportado')
  }

  if (config.tools === undefined) {
    throw new Error('tools da configuração do projeto é obrigatório')
  }

  if (!isObject(config.tools)) {
    throw new Error('tools da configuração do projeto deve ser um objeto')
  }

  if (config.tools.php !== undefined) {
    const php = config.tools.php

    if (!isObject(php)) {
      throw new Error('configuração da ferramenta PHP deve ser um objeto')
    }

    if (php.executable === undefined) {
      throw new Error('executable PHP é obrigatório')
    }

    if (typeof php.executable !== 'string') {
      throw new Error('executable PHP deve ser uma string')
    }

    if (php.executable.trim() === '') {
      throw new Error('executable PHP não pode ser vazio')
    }

    if (!isAbsolute(php.executable)) {
      throw new Error('executable PHP deve ser um caminho absoluto')
    }

    if (!Array.isArray(php.argsPrefix)) {
      throw new Error('argsPrefix PHP deve ser um array')
    }

    if (!php.argsPrefix.every((argument) => typeof argument === 'string')) {
      throw new Error('argsPrefix PHP deve conter somente strings')
    }
  }

  return config
}

export function createProjectConfig(input) {
  if (!isObject(input)) {
    throw new Error('configuração do projeto deve ser um objeto')
  }

  if (Object.hasOwn(input, 'schemaVersion')) {
    throw new Error('schemaVersion da configuração inicial é controlado pelo JZL')
  }

  let tools = input.tools

  if (tools === undefined) {
    tools = {}
  } else if (isObject(tools)) {
    tools = { ...tools }

    if (isObject(tools.php)) {
      tools.php = {
        ...tools.php,
        argsPrefix: tools.php.argsPrefix === undefined
          ? []
          : Array.isArray(tools.php.argsPrefix)
            ? [...tools.php.argsPrefix]
            : tools.php.argsPrefix,
      }
    }
  }

  return validateProjectConfig({
    schemaVersion: 1,
    template: input.template,
    tools,
  })
}
