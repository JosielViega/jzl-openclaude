import {
  readProjectConfigStore,
  writeProjectConfigStore,
} from './project-config-store.js'

const supportedResponsibilities = new Set([
  'mission-execution',
  'mission-review',
])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCanonicalModel(value) {
  return typeof value === 'string'
    && value.trim() !== ''
    && value === value.trim()
}

export function validateProjectModelRoute(route) {
  if (!isObject(route)) {
    throw new Error('rota de modelo deve ser um objeto')
  }

  if (!supportedResponsibilities.has(route.responsibility)) {
    throw new Error('responsabilidade da rota de modelo não é suportada')
  }

  if (!isCanonicalModel(route.model)) {
    throw new Error('modelo da rota deve ser uma string não vazia')
  }

  return route
}

export function resolveProjectModelRoute(context, responsibility) {
  if (!supportedResponsibilities.has(responsibility)) {
    throw new Error('responsabilidade de modelo não é suportada')
  }

  const config = readProjectConfigStore(context)
  const model = config.models?.[responsibility]

  if (model === undefined) {
    throw new Error(`modelo não configurado para responsabilidade ${responsibility}`)
  }

  return validateProjectModelRoute({ responsibility, model })
}

export function configureProjectModel(context, input) {
  if (!isObject(input)) {
    throw new Error('configuração de modelo deve ser um objeto')
  }

  if (!supportedResponsibilities.has(input.responsibility)) {
    throw new Error('responsabilidade de modelo não é suportada')
  }

  if (typeof input.model !== 'string' || input.model.trim() === '') {
    throw new Error('modelo da configuração de modelo deve ser uma string não vazia')
  }

  const route = {
    responsibility: input.responsibility,
    model: input.model.trim(),
  }
  const config = readProjectConfigStore(context)
  const updatedConfig = structuredClone(config)
  updatedConfig.models = {
    ...(updatedConfig.models ?? {}),
    [route.responsibility]: route.model,
  }

  writeProjectConfigStore(context, updatedConfig)

  return resolveProjectModelRoute(context, route.responsibility)
}
