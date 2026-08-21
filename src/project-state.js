export function createInitialProjectState() {
  return {
    schemaVersion: 1,
  }
}

export function validateProjectState(state) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('estado do projeto deve ser um objeto')
  }

  if (state.schemaVersion === undefined) {
    throw new Error('schemaVersion do estado do projeto é obrigatório')
  }

  if (!Number.isInteger(state.schemaVersion) || state.schemaVersion <= 0) {
    throw new Error(
      'schemaVersion do estado do projeto deve ser um inteiro positivo',
    )
  }

  if (state.schemaVersion !== 1) {
    throw new Error('schemaVersion do estado do projeto não é suportado')
  }

  return state
}
