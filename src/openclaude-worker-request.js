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

  return { prompt: validatedPrompt }
}
