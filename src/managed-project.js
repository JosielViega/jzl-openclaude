import { createProjectConfig } from './project-config.js'
import {
  initializeProjectConfigStore,
  readProjectConfigStore,
} from './project-config-store.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
} from './project-state-store.js'

export function initializeManagedProject(context, input) {
  createProjectConfig(input)
  initializeProjectConfigStore(context, input)
  initializeProjectStateStore(context)

  return {
    projectRoot: context.projectRoot,
    config: readProjectConfigStore(context),
    state: readProjectStateStore(context),
  }
}
