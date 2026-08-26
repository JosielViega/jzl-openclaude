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
import {
  ensureTraditionalWebProjectStructure,
  preflightTraditionalWebProjectStructure,
} from './traditional-web-structure.js'

export function initializeManagedProject(context, input) {
  createProjectConfig(input)
  preflightTraditionalWebProjectStructure(context)
  initializeProjectConfigStore(context, input)
  initializeProjectStateStore(context)
  initializeProjectEventStore(context)
  ensureTraditionalWebProjectStructure(context)

  return {
    projectRoot: context.projectRoot,
    config: readProjectConfigStore(context),
    state: readProjectStateStore(context),
  }
}
