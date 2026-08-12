/**
 * Fastify 应用装配：CORS + 各路由注册。
 */
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { hardwareRoutes } from './routes/hardware.js'
import { modelsRoutes } from './routes/models.js'
import { tiersRoutes } from './routes/tiers.js'
import { organizationsRoutes } from './routes/organizations.js'
import { syncRoutes } from './routes/sync.js'

export function buildApp() {
  const app = Fastify({ logger: true })

  app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, name: 'can-i-deploy-api' }))

  app.register(hardwareRoutes)
  app.register(modelsRoutes)
  app.register(tiersRoutes)
  app.register(organizationsRoutes)
  app.register(syncRoutes)

  return app
}
