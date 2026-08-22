import { validateMission } from './mission.js'
import { validateProjectRoot } from './project-root.js'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateStandards(standards) {
  if (!isObject(standards)) {
    throw new Error('standards deve ser um objeto')
  }

  if (typeof standards.id !== 'string' || standards.id.trim() === '') {
    throw new Error('id de standards deve ser uma string não vazia')
  }

  if (
    !Array.isArray(standards.instructions)
    || standards.instructions.length === 0
  ) {
    throw new Error('instructions de standards deve ser um array não vazio')
  }

  if (!standards.instructions.every(
    (instruction) => typeof instruction === 'string' && instruction.trim() !== '',
  )) {
    throw new Error('instructions de standards deve conter strings não vazias')
  }
}

export function buildMissionReviewContext(context, input) {
  if (!isObject(input)) {
    throw new Error('dados do contexto de revisão devem ser um objeto')
  }

  validateMission(input.mission)

  if (input.mission.status !== 'validation') {
    throw new Error('Mission deve estar validation para construir contexto de revisão')
  }

  validateStandards(input.standards)
  validateProjectRoot(context?.projectRoot)

  return {
    mission: structuredClone(input.mission),
    standards: structuredClone(input.standards),
  }
}
