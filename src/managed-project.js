import { createProjectConfig } from './project-config.js'
import {
  initializeProjectConfigStore,
  readProjectConfigStore,
} from './project-config-store.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
} from './project-state-store.js'
import { initializeProjectEventStore } from './project-event-store.js'

export function initializeManagedProject(context, input) {
  createProjectConfig(input)
  initializeProjectConfigStore(context, input)
  initializeProjectStateStore(context)
  initializeProjectEventStore(context)

  return {
    projectRoot: context.projectRoot,
    config: readProjectConfigStore(context),
    state: readProjectStateStore(context),
  }
}
