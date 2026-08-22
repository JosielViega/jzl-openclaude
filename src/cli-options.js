export function parseCliOptions(argumentsList, definitions) {
  const values = {}

  for (let index = 0; index < argumentsList.length; index += 2) {
    const option = argumentsList[index]

    if (!Object.hasOwn(definitions, option)) {
      throw new Error(`argumento desconhecido: ${option}`)
    }

    const value = argumentsList[index + 1]

    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${option} exige um valor`)
    }

    const { repeatable = false } = definitions[option]

    if (Object.hasOwn(values, option) && !repeatable) {
      throw new Error(`opção duplicada: ${option}`)
    }

    if (repeatable) {
      values[option] ??= []
      values[option].push(value)
    } else {
      values[option] = value
    }
  }

  for (const [option, { required = false, repeatable = false }] of (
    Object.entries(definitions)
  )) {
    if (required && !Object.hasOwn(values, option)) {
      throw new Error(`${option} é obrigatório`)
    }

    if (repeatable && !Object.hasOwn(values, option)) {
      values[option] = []
    }
  }

  return values
}
