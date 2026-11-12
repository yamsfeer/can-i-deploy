/**
 * 4 档分级 badge（设计稿 badge 组件：色点 + 语义色）。
 * tier 为空（null / undefined）时渲染"待选择硬件"的 none 态。
 */
import type { TierKey } from '@can-i-deploy/shared'
import { useI18n } from '../i18n'

export interface TierBadgeProps {
  tier: TierKey | null | undefined
  /** 完整说明（悬浮 title）；默认取 tierRule.* 的 i18n 文案 */
  title?: string | null
}

export function TierBadge({ tier, title }: TierBadgeProps) {
  const { t } = useI18n()
  if (!tier) {
    return (
      <span className="badge none" title={t('home.tierPending')}>
        {t('home.tierPending')}
      </span>
    )
  }
  const text = t(`tier.${tier}`)
  const full = title || t(`tierRule.${tier}`)
  return (
    <span className={`badge ${tier}`} title={full}>
      {text}
    </span>
  )
}
