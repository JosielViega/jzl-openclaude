import { parseCliOptions } from './cli-options.js'
import { listProjectHistory } from './execution-history.js'
import { initializeManagedProject } from './managed-project.js'
import {
  createProjectMission,
  listReadyProjectMissions,
} from './mission-engine.js'
import { executeProjectMission } from './mission-execution.js'
import { reviewProjectMission } from './mission-review.js'
import { planProjectMission } from './mission-planning.js'
import { approveMissionPlan } from './mission-plan-approval.js'
import { requestMissionReviewCorrection } from './mission-review-correction.js'
import { validateConfiguredProjectMission } from './mission-validation.js'
import { createProjectContext } from './project-context.js'
import { validateProjectRoot } from './project-root.js'
import { runProjectMission } from './project-runner.js'
import { configureProjectModel } from './model-router.js'

const projectRootOption = {
  '--project-root': { required: true },
}

function printJson(value) {
  console.log(JSON.stringify(value))
}

function createContext(options) {
  return createProjectContext(options['--project-root'])
}

const [command, ...argumentsList] = process.argv.slice(2)

try {
  if (command === undefined) {
    throw new Error('comando é obrigatório')
  }

  if (command === 'check-root') {
    const options = parseCliOptions(argumentsList, projectRootOption)
    const projectRoot = validateProjectRoot(options['--project-root'])

    console.log(`projectRoot válido: ${projectRoot}`)
  } else if (command === 'init-project') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--template': { required: true },
      '--php': {},
    })
    const tools = options['--php'] === undefined
      ? undefined
      : { php: { executable: options['--php'], argsPrefix: [] } }

    printJson(initializeManagedProject(createContext(options), {
      template: options['--template'],
      ...(tools === undefined ? {} : { tools }),
    }))
  } else if (command === 'create-mission') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--title': { required: true },
      '--objective': { required: true },
      '--depends-on': { repeatable: true },
    })

    printJson(createProjectMission(createContext(options), {
      title: options['--title'],
      objective: options['--objective'],
      dependencies: options['--depends-on'],
    }))
  } else if (command === 'list-ready') {
    const options = parseCliOptions(argumentsList, projectRootOption)

    printJson({ missions: listReadyProjectMissions(createContext(options)) })
  } else if (command === 'set-model') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--responsibility': { required: true },
      '--model': { required: true },
    })

    printJson(configureProjectModel(createContext(options), {
      responsibility: options['--responsibility'],
      model: options['--model'],
    }))
  } else if (command === 'execute-mission') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--mission': { required: true },
    })

    printJson(await executeProjectMission(
      createContext(options),
      options['--mission'],
    ))
  } else if (command === 'validate-mission') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--mission': { required: true },
    })

    printJson(await validateConfiguredProjectMission(
      createContext(options),
      options['--mission'],
    ))
  } else if (command === 'review-mission') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--mission': { required: true },
    })

    printJson(await reviewProjectMission(
      createContext(options),
      options['--mission'],
    ))
  } else if (command === 'plan-mission') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--mission': { required: true },
    })

    printJson(await planProjectMission(
      createContext(options),
      options['--mission'],
    ))
  } else if (command === 'approve-plan') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--mission': { required: true },
      '--plan-event': { required: true },
    })

    printJson(approveMissionPlan(
      createContext(options),
      options['--mission'],
      options['--plan-event'],
    ))
  } else if (command === 'request-review-correction') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--mission': { required: true },
      '--review-event': { required: true },
    })

    printJson(requestMissionReviewCorrection(
      createContext(options),
      options['--mission'],
      options['--review-event'],
    ))
  } else if (command === 'run-mission') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--mission': { required: true },
    })

    printJson(await runProjectMission(
      createContext(options),
      options['--mission'],
    ))
  } else if (command === 'history') {
    const options = parseCliOptions(argumentsList, {
      ...projectRootOption,
      '--mission': {},
    })

    printJson({
      events: listProjectHistory(createContext(options), options['--mission']),
    })
  } else {
    throw new Error(`comando desconhecido: ${command}`)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
