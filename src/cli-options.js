export function parseCliOptions(argumentsList, definitions) {
  const values = {}

  for (let index = 0; index < argumentsList.length; index += 1) {
    const option = argumentsList[index]

    if (!Object.hasOwn(definitions, option)) {
      throw new Error(`argumento desconhecido: ${option}`)
    }

    const { boolean = false, repeatable = false } = definitions[option]

    if (boolean) {
      if (Object.hasOwn(values, option) && !repeatable) {
        throw new Error(`opção duplicada: ${option}`)
      }
      values[option] = true
      continue
    }

    const value = argumentsList[index + 1]

    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${option} exige um valor`)
    }

    if (Object.hasOwn(values, option) && !repeatable) {
      throw new Error(`opção duplicada: ${option}`)
    }

    if (repeatable) {
      values[option] ??= []
      values[option].push(value)
    } else {
      values[option] = value
    }
    index += 1
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
