/**
 * GET /api/tiers — 4 档分级定义 + 公式说明（说明页数据）
 */
import type { FastifyInstance } from 'fastify'
import { ENGINE_CONSTANTS, TIER_DEFS, IMAGE_BASE_RESOLUTION } from '@can-i-deploy/shared'
import type { TierDef } from '@can-i-deploy/shared'

export function tiersRoutes(app: FastifyInstance) {
  app.get('/api/tiers', async () => {
    const tiers = TIER_DEFS as TierDef[]
    return {
      data: tiers,
      constants: {
        llmThresholds: {
          smoothMin: 20,
          okMin: 5,
          tightMin: 2,
        },
        imageThresholds: {
          smoothMax: 10,
          okMax: 30,
          tightMax: 60,
        },
        baseResolution: `${IMAGE_BASE_RESOLUTION}px`,
        defaultContext: ENGINE_CONSTANTS.defaultContextLength,
        bandwidthUtilization: ENGINE_CONSTANTS.bandwidthUtilization,
        systemReserveGb: ENGINE_CONSTANTS.systemReserveGb,
        minFreeMarginGb: ENGINE_CONSTANTS.minFreeMarginGb,
      },
    }
  })
}
