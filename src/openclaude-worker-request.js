import {
  isRegisteredResponsibility,
  resolveResponsibilityDefinition,
} from './responsibility-registry.js'

export function parseOpenClaudeWorkerRequest(input) {
  if (input.trim() === '') {
    throw new Error('entrada do worker não pode ser vazia')
  }

  let request

  try {
    request = JSON.parse(input)
  } catch {
    throw new Error('entrada do worker deve ser JSON válido')
  }

  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    throw new Error('solicitação do worker deve ser um objeto')
  }

  if (!Object.hasOwn(request, 'prompt')) {
    throw new Error('prompt é obrigatório')
  }

  if (typeof request.prompt !== 'string') {
    throw new Error('prompt deve ser uma string')
  }

  const validatedPrompt = request.prompt.trim()

  if (validatedPrompt === '') {
    throw new Error('prompt não pode ser vazio')
  }

  if (!Object.hasOwn(request, 'sessionMode')) {
    throw new Error('sessionMode é obrigatório')
  }

  if (typeof request.sessionMode !== 'string') {
    throw new Error('sessionMode deve ser uma string')
  }

  if (!Object.hasOwn(request, 'responsibility')) {
    throw new Error('responsibility é obrigatório')
  }

  if (typeof request.responsibility !== 'string') {
    throw new Error('responsibility deve ser uma string')
  }

  if (!isRegisteredResponsibility(request.responsibility)) {
    throw new Error('responsibility do worker não é suportada')
  }

  const definition = resolveResponsibilityDefinition(request.responsibility)

  if (request.sessionMode !== definition.sessionMode) {
    throw new Error('sessionMode do worker não é suportado')
  }

  if (!Object.hasOwn(request, 'model')) {
    throw new Error('model é obrigatório')
  }

  if (typeof request.model !== 'string') {
    throw new Error('model deve ser uma string')
  }

  const validatedModel = request.model.trim()

  if (validatedModel === '') {
    throw new Error('model não pode ser vazio')
  }

  return {
    prompt: validatedPrompt,
    sessionMode: request.sessionMode,
    responsibility: request.responsibility,
    model: validatedModel,
  }
}
