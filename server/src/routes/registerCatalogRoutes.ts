import type { Express } from 'express'
import { registerChangeRequestRoutes } from './changeRequests.routes.js'
import { registerHealthAndTreeRoutes } from './healthAndTree.routes.js'
import { registerMetaRoutes } from './meta.routes.js'
import { registerMethodsRoutes } from './methods.routes.js'
import { registerProcessRoutes } from './processes.routes.js'
import { registerServicesRoutes } from './services.routes.js'

/** Servis katalog API (`/api/*`, DWH hariç). */
export function registerCatalogRoutes(app: Express) {
  registerHealthAndTreeRoutes(app)
  registerServicesRoutes(app)
  registerProcessRoutes(app)
  registerMethodsRoutes(app)
  registerMetaRoutes(app)
  registerChangeRequestRoutes(app)
}
