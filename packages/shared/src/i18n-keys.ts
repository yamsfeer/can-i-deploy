/**
 * i18n key 常量。
 * 前端字典（packages/frontend/src/i18n/zh.json）以后端错误消息共用同一套 key。
 * 一期只启用中文（zh），en 预留在二期。
 */

export const I18N_KEYS = {
  // 档位名称
  tier: {
    smooth: 'tier.smooth',
    ok: 'tier.ok',
    tight: 'tier.tight',
    no: 'tier.no',
  },
  // 档位规则说明
  tierRule: {
    smooth: 'tierRule.smooth',
    ok: 'tierRule.ok',
    tight: 'tierRule.tight',
    noVram: 'tierRule.noVram',
    noSpeed: 'tierRule.noSpeed',
    lowMargin: 'tierRule.lowMargin',
    customVram: 'tierRule.customVram',
  },
  // 后端错误
  error: {
    invalidGpu: 'error.invalidGpu',
    invalidModelType: 'error.invalidModelType',
    modelNotFound: 'error.modelNotFound',
    invalidParams: 'error.invalidParams',
  },
} as const
