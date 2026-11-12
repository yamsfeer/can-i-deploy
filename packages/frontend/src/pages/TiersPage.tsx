/**
 * 分档说明页（设计稿 ④ page-tiers）：
 * 4 档定义卡 + 阈值速查表 + 计算公式（简）+ 附加规则 + 白名单组织。
 * 档位定义 / 阈值 / 公式常量来自 GET /api/tiers，组织列表来自 GET /api/organizations。
 */
import { useMemo } from 'react'
import type { TierDef } from '@can-i-deploy/shared'
import type { TiersResponse } from '../api/client'
import { useOrganizations } from '../hooks/useOrganizations'
import { useTiers } from '../hooks/useTiers'
import { useI18n } from '../i18n'
import { Icon } from '../components/Icon'

/** 白名单组织按地域/用途分组（设计稿固定分组，顺序即展示顺序） */
const ORG_GROUPS: ReadonlyArray<{ titleKey: string; names: readonly string[] }> = [
  { titleKey: 'tiers.orgDomestic', names: ['Qwen', 'DeepSeek', 'GLM', 'MiniMax', 'Moonshot', '01.AI', 'BAAI', 'InternLM', 'StepFun', 'Tencent'] },
  { titleKey: 'tiers.orgGlobal', names: ['Meta', 'Google', 'Mistral', 'Microsoft', 'xAI', 'Cohere', 'NVIDIA', 'Amazon'] },
  { titleKey: 'tiers.orgImage', names: ['Stability AI', 'Black Forest Labs'] },
]

export default function TiersPage() {
  const { t } = useI18n()
  const tiers = useTiers()
  const orgs = useOrganizations()
  const orgNames = useMemo(() => new Set((orgs.data?.data ?? []).map((o) => o.name)), [orgs.data])

  const llmRange = (tier: TierDef, c: TiersResponse['constants']) => {
    if (tier.llmMinToks == null) return `< ${c.llmThresholds.tightMin} tok/s`
    if (tier.llmMinToks >= c.llmThresholds.smoothMin) return `> ${c.llmThresholds.smoothMin} tok/s`
    return `${c.llmThresholds.tightMin} ~ ${c.llmThresholds.okMin} tok/s`
  }
  const imgRange = (tier: TierDef, c: TiersResponse['constants']) => {
    if (tier.imageMaxSeconds == null) return `> ${c.imageThresholds.tightMax} s/张`
    if (tier.imageMaxSeconds <= c.imageThresholds.smoothMax) return `< ${c.imageThresholds.smoothMax} s/张`
    return `${c.imageThresholds.smoothMax} ~ ${c.imageThresholds.okMax} s/张`
  }

  const constants = tiers.data?.constants
  const list = tiers.data?.data ?? []

  return (
    <section>
      <div className="page-head">
        <div className="eyebrow">Tiers</div>
        <h1>{t('tiers.title')}</h1>
        <p className="sub">
          {t('tiers.subtitleLead')}
          <b>{t('tiers.subtitleB')}</b>
          {t('tiers.subtitleTail')}
        </p>
      </div>

      {/* 四档卡片 */}
      <div className="tier-cards">
        {list.map((tier) => (
          <div className="tier-card" key={tier.key}>
            <div className="head">
              <span className="sw" style={{ background: tier.color }} aria-hidden="true" />
              <span className="name">{t(`tier.${tier.key}`)}</span>
            </div>
            <p className="rule">
              <b>{constants ? llmRange(tier, constants) : '—'}</b>
              （LLM / VLM）
              <br />
              <b>{constants ? imgRange(tier, constants) : '—'}</b>
              （图像生成）
            </p>
            <span className={`badge ${tier.key}`}>{t(`tier.${tier.key}`)}</span>
          </div>
        ))}
      </div>

      {/* 阈值速查 */}
      <div className="card" style={{ marginTop: 26 }}>
        <h2>{t('tiers.thresholdTitle')}</h2>
        <div className="table-scroll">
          <table className="threshold-table">
            <thead>
              <tr>
                <th>{t('tiers.thresholdColTier')}</th>
                <th>{t('tiers.llmTitle')}</th>
                <th>{t('tiers.imageTitle')}</th>
                <th>{t('tiers.thresholdColMeaning')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((tier) => (
                <tr key={tier.key}>
                  <td>
                    <span className="sw" style={{ background: tier.color }} aria-hidden="true" />
                    {t(`tier.${tier.key}`)}
                  </td>
                  <td>
                    <span className="num">{constants ? llmRange(tier, constants) : '—'}</span>
                  </td>
                  <td>
                    <span className="num">{constants ? imgRange(tier, constants) : '—'}</span>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 13.5 }}>
                    {tier.ruleKey ? t(tier.ruleKey) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 计算公式（简） */}
      <div className="card">
        <h2>{t('tiers.formulaTitle')}</h2>
        <div className="formula-grid">
          <div className="formula-box">
            <div className="f-title">{t('tiers.formulaVramTitle')}</div>
            <code>{t('tiers.vramFormula')}</code>
            <p style={{ marginTop: 8 }}>{t('tiers.vramFormulaDesc')}</p>
          </div>
          <div className="formula-box">
            <div className="f-title">{t('tiers.formulaSpeedTitle')}</div>
            <code>{t('tiers.speedFormula')}</code>
            <p style={{ marginTop: 8 }}>{t('tiers.speedFormulaDesc')}</p>
          </div>
          <div className="formula-box">
            <div className="f-title">{t('tiers.formulaConstantsTitle')}</div>
            <div className="const-chips">
              <span className="pill">{t('tiers.constBandwidth')}</span>
              <span className="pill">{t('tiers.constReserve')}</span>
              <span className="pill">{t('tiers.constMargin')}</span>
              <span className="pill">{t('tiers.constContext')}</span>
              <span className="pill">{t('tiers.constImageFlops')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 附加规则 */}
      <div className="card">
        <h2>{t('tiers.noteTitle')}</h2>
        <ul className="rules-list">
          <li>
            <Icon name="tick" className="tick" />
            <span>{t('tiers.marginRule')}</span>
          </li>
          <li>
            <Icon name="tick" className="tick" />
            <span>{t('tiers.reserveRule', { gb: constants?.systemReserveGb ?? 0.5 })}</span>
          </li>
          <li>
            <Icon name="tick" className="tick" />
            <span>{t('tiers.quantRule')}</span>
          </li>
          <li>
            <Icon name="tick" className="tick" />
            <span>{t('tiers.defaultContextRule')}</span>
          </li>
        </ul>
      </div>

      {/* 白名单组织 */}
      <div className="card">
        <h2>{t('tiers.orgTitle')}</h2>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '-8px 0 18px' }}>{t('tiers.orgDesc')}</p>
        <div className="org-groups">
          {ORG_GROUPS.map((g) => {
            const present = g.names.filter((n) => orgNames.has(n))
            if (present.length === 0) return null
            return (
              <div className="org-group" key={g.titleKey}>
                <div className="g-title">{t(g.titleKey)}</div>
                <div className="org-chips">
                  {present.map((n) => (
                    <span className="org-chip" key={n}>
                      {n}
                      <span className="mono">HF + MS</span>
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
