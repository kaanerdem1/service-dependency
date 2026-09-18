/**
 * Express uygulaması — middleware ve route kayıtları.
 * Katalog route'ları: `routes/registerCatalogRoutes.ts` · dinleme: `startServer.ts`.
 */
import cors from 'cors'
import express from 'express'
import { dwhRouter } from './dwh/routes.js'
import { registerCatalogRoutes } from './routes/registerCatalogRoutes.js'

export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '15mb' }))
  app.use('/api/dwh', dwhRouter)

  registerCatalogRoutes(app)

  return app
}
