/**
 * 首页 · 模型目录（设计稿 ① page-models）：
 * Hero 标题 + 硬件选择面板（GpuPicker）+ 工具条（类型 tab / 搜索 / 排序）
 * + 模型表（分级 badge 由后端计算）+ 骨架 / 空 / 错误三态 + 四档图例。
 *
 * 筛选状态全部承载在 URL query（type / gpu_id / custom_vram / q / sort），
 * 由 parseFilters / toSearchParams 双向转换（见 src/api/filters.ts）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { GpuSpec, ModelSummary, ModelType, TierDef } from '@can-i-deploy/shared'
import type { TiersResponse } from '../api/client'
import { parseFilters, toSearchParams, type ModelFilters } from '../api/filters'
import { useHardware } from '../hooks/useHardware'
import { useModels } from '../hooks/useModels'
import { useTiers } from '../hooks/useTiers'
import { useI18n } from '../i18n'
import { formatCompact, formatGb, formatParams, formatSecondsPerImage, formatTokPerSec } from '../lib/format'
import { GpuPicker } from '../components/GpuPicker'
import { Icon } from '../components/Icon'
import { SourcePill } from '../components/SourcePill'
import { TierBadge } from '../components/TierBadge'

const TABS: readonly ModelType[] = ['llm', 'vlm', 'image']
const TYPE_KEY: Record<ModelType, string> = {
  llm: 'home.typeLlm',
  vlm: 'home.typeVlm',
  image: 'home.typeImage',
}
const SORTS = [
  { value: 'downloads', key: 'home.sortDownloads' },
  { value: 'params', key: 'home.sortParams' },
  { value: 'name', key: 'home.sortName' },
] as const

/** noteKey → 分级列下方短标签（完整文案在 badge title） */
const NOTE_SHORT: Record<string, string> = {
  'tierRule.noVram': 'home.noteNoVram',
  'tierRule.noSpeed': 'home.noteNoSpeed',
  'tierRule.lowMargin': 'home.noteLowMargin',
  'tierRule.customVram': 'home.noteCustomVram',
}

export default function HomePage() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseFilters(searchParams), [searchParams])

  // 自定义显存开关：URL 有 custom_vram 且无 gpu_id 即为开启
  const [customOn, setCustomOn] = useState(() => filters.gpu_id == null && filters.custom_vram != null)
  const lastGpuId = useRef<number | null>(filters.gpu_id)
  // 搜索框本地草稿（URL 回写不打断输入）
  const [searchDraft, setSearchDraft] = useState(filters.q)

  const hardware = useHardware()
  const models = useModels(filters)
  const tiers = useTiers()

  const gpus = hardware.data?.data ?? []
  const list = models.data?.data ?? []
  const total = models.data?.total ?? list.length
  const typeLabel = t(TYPE_KEY[filters.type])

  // 与外部变化（清除按钮等）同步搜索草稿
  useEffect(() => {
    setSearchDraft((d) => (d === filters.q ? d : filters.q))
  }, [filters.q])

  const setFilters = useCallback(
    (patch: Partial<ModelFilters>) => {
      setSearchParams(toSearchParams({ ...filters, ...patch }), { replace: true })
    },
    [filters, setSearchParams],
  )

  /* ── 空状态 / 换卡助手 ── */
  const currentGpu = useMemo(
    () => (filters.gpu_id != null ? gpus.find((g) => g.id === filters.gpu_id) : gpus[0]) ?? null,
    [gpus, filters.gpu_id],
  )
  const biggerGpu = useMemo(() => {
    const sorted = [...gpus].sort((a, b) => a.vram_gb - b.vram_gb)
    const base = currentGpu?.vram_gb ?? 0
    return sorted.find((g) => g.vram_gb > base) ?? null
  }, [gpus, currentGpu])

  const emptyDesc = useMemo(() => {
    if (filters.q) return t('home.emptySearch', { q: filters.q, type: typeLabel })
    if (customOn) return t('home.emptyCustom', { type: typeLabel })
    const gpuText = currentGpu ? `${currentGpu.name} ${currentGpu.vram_gb} GB` : ''
    return t('home.emptyNoGpu', { type: typeLabel, gpu: gpuText })
  }, [filters.q, customOn, typeLabel, currentGpu, t])

  /* ── 键盘快捷键：/ 聚焦搜索 · 1/2/3 切类型 · Esc 清搜索 ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === '/') {
        e.preventDefault()
        document.getElementById('search-input')?.focus()
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        setFilters({ type: TABS[Number(e.key) - 1] })
      } else if (e.key === 'Escape' && filters.q) {
        setFilters({ q: '' })
        setSearchDraft('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setFilters, filters.q])

  /* ── 工具条 tab 键盘导航（ARIA APG tabs 模式） ── */
  const onTabsKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const btns = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
    const idx = btns.indexOf(document.activeElement as HTMLButtonElement)
    if (idx < 0) return
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (idx + 1) % btns.length
    if (e.key === 'ArrowLeft') next = (idx - 1 + btns.length) % btns.length
    if (next !== null) {
      e.preventDefault()
      btns[next].focus()
      btns[next].click()
    }
  }

  return (
    <section>
      <div className="hero">
        <h1>{t('home.heroTitle')}</h1>
        <p className="sub">
          {t('home.heroLead')}
          <b>{t('home.heroLeadB')}</b>
          {t('home.heroCover')}
        </p>

        <GpuPicker
          gpus={gpus}
          loading={hardware.loading && gpus.length === 0}
          gpuId={filters.gpu_id}
          customOn={customOn}
          customVram={filters.custom_vram}
          onGpuChange={(gpuId) => {
            lastGpuId.current = gpuId
            setCustomOn(false)
            setFilters({ gpu_id: gpuId, custom_vram: null })
          }}
          onToggleCustom={(on) => {
            if (on) lastGpuId.current = filters.gpu_id
            setCustomOn(on)
            if (on) setFilters({ gpu_id: null })
            else setFilters({ gpu_id: lastGpuId.current, custom_vram: null })
          }}
          onVramChange={(v) => setFilters({ custom_vram: v })}
        />
      </div>

      {/* 工具条 */}
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label={t('home.tabsLabel')} onKeyDown={onTabsKeyDown}>
          {TABS.map((type, i) => (
            <button
              key={type}
              role="tab"
              aria-selected={filters.type === type}
              className={filters.type === type ? 'active' : ''}
              title={t('home.tabShortcut', { n: i + 1 })}
              onClick={() => setFilters({ type })}
            >
              {t(TYPE_KEY[type])}
            </button>
          ))}
        </div>
        <div className={`search${searchDraft ? ' has-value' : ''}`} id="search-box">
          <Icon name="search" />
          <input
            id="search-input"
            type="search"
            placeholder={t('home.searchPlaceholder')}
            title={t('home.searchTitle')}
            aria-label={t('home.searchAria')}
            value={searchDraft}
            onChange={(e) => {
              setSearchDraft(e.target.value)
              setFilters({ q: e.target.value })
            }}
          />
          <button
            className="clear"
            id="search-clear"
            aria-label={t('home.clearSearch')}
            onClick={() => {
              setSearchDraft('')
              setFilters({ q: '' })
              document.getElementById('search-input')?.focus()
            }}
          >
            <Icon name="close" style={{ width: 14, height: 14 }} />
          </button>
        </div>
        <div className="sort">
          <span>{t('home.sortLabel')}</span>
          <div className="sort-wrap">
            <select
              aria-label={t('home.sortAria')}
              value={filters.sort}
              onChange={(e) => setFilters({ sort: e.target.value as ModelFilters['sort'] })}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.key)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <span className="count" aria-live="polite">
          {total} {t('home.countUnit')}
        </span>
      </div>

      {/* 模型列表 / 三态 */}
      <div className="card table-card">
        {models.error ? (
          <div className="error-card card">
            <div className="err-title">
              <Icon name="alert" style={{ color: 'var(--danger)' }} />
              {t('home.errorTitle')}
            </div>
            <p>
              {t('home.errorDesc')}
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{t('home.errorCmd')}</code>
              {t('home.errorRetryHint')}
            </p>
            <button className="btn btn-sand" onClick={models.refresh}>
              <Icon name="retry" />
              {t('home.retry')}
            </button>
          </div>
        ) : models.loading && (models.stale || list.length === 0) ? (
          <table className="grid">
            <tbody>
              {[0, 1, 2, 3].map((i) => (
                <tr className="skeleton-row" key={i}>
                  <td>
                    <div className="skel name" />
                  </td>
                  <td>
                    <div className="skel w" />
                  </td>
                  <td>
                    <div className="skel sm" />
                  </td>
                  <td>
                    <div className="skel w" />
                  </td>
                  <td>
                    <div className="skel sm" />
                  </td>
                  <td>
                    <div className="skel sm" />
                  </td>
                  <td>
                    <div className="skel sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : list.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <Icon name="search" style={{ width: 22, height: 22 }} />
            </div>
            <h2>{t('home.emptyTitle')}</h2>
            <p>{emptyDesc}</p>
            <div className="actions">
              {filters.q && (
                <button
                  className="btn btn-sand"
                  onClick={() => {
                    setSearchDraft('')
                    setFilters({ q: '' })
                  }}
                >
                  {t('home.clearSearch')}
                </button>
              )}
              {biggerGpu && !customOn && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    lastGpuId.current = biggerGpu.id
                    setCustomOn(false)
                    setFilters({ gpu_id: biggerGpu.id, custom_vram: null })
                  }}
                >
                  {t('home.pickBiggerGpu', { gpu: biggerGpu.name })}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>{t('home.colModel')}</th>
                  <th>{t('home.colParams')}</th>
                  <th>{t('home.colQuant')}</th>
                  <th>{t('home.colTier')}</th>
                  <th>{t('home.colVram')}</th>
                  <th>{t('home.colSpeed')}</th>
                  <th>{t('home.colDownloads')}</th>
                </tr>
              </thead>
              <tbody>{list.map((m) => <ModelRow key={m.id} model={m} />)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* 四档图例 */}
      <div className="legend">
        <details>
          <summary>
            <Icon name="info" style={{ color: 'var(--accent)' }} />
            {t('home.legendTitle')}
            <Icon name="chevron" className="chev" />
          </summary>
          <div className="legend-body">
            <div className="legend-grid">
              {(tiers.data?.data ?? []).map((tier) => (
                <LegendItem key={tier.key} tier={tier} thresholds={tiers.data!.constants} />
              ))}
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}

/* ── 模型行 ── */
function ModelRow({ model }: { model: ModelSummary }) {
  const { t } = useI18n()
  const badge = model.badge
  const badgeTitle = badge?.noteKey ? t(badge.noteKey) : badge ? t(`tierRule.${badge.tier}`) : t('home.tierPending')
  const shortKey = badge?.noteKey ? NOTE_SHORT[badge.noteKey] : null

  const speed =
    badge && model.model_type === 'image'
      ? formatSecondsPerImage(badge.secondsPerImage)
      : badge
        ? formatTokPerSec(badge.tokPerSec)
        : null

  return (
    <tr>
      <td className="cell-model">
        <div>
          <Link className="name" to={`/model/${model.id}`}>
            <span className="monogram" aria-hidden="true">
              {model.org.slice(0, 2)}
            </span>
            {model.name}
          </Link>
        </div>
        <div className="meta">
          <span className="org">{model.org}</span>
          <SourcePill source={model.source} />
        </div>
      </td>
      <td>
        <span className="num">{formatParams(model.params) ?? '—'}</span>
      </td>
      <td>
        {model.badgeQuant ? (
          <span className="quant-tag">{model.badgeQuant}</span>
        ) : (
          <span className="no-quant">{t('home.noQuant')}</span>
        )}
      </td>
      <td>
        <TierBadge tier={badge?.tier} title={badgeTitle} />
        {shortKey && (
          <span className="cell-note">
            <Icon name="alert" style={{ width: 11, height: 11 }} />
            {t(shortKey)}
          </span>
        )}
      </td>
      <td>
        {badge ? (
          <>
            <span className="num">{formatGb(badge.vramGb) ?? '—'}</span>{' '}
            <span style={{ color: 'var(--faint)', fontSize: 12 }}>GB</span>
          </>
        ) : (
          <span className="td-muted">—</span>
        )}
      </td>
      <td>
        {speed ? (
          <span className="num">
            {speed}
            {model.model_type === 'image' ? ` ${t('detail.secPerImage')}` : ` ${t('detail.tokensPerSec')}`}
          </span>
        ) : (
          <span className="td-muted">—</span>
        )}
      </td>
      <td>
        <span className="num">{formatCompact(model.downloads) ?? '—'}</span>
      </td>
    </tr>
  )
}

/* ── 图例项 ── */
function LegendItem({
  tier,
  thresholds,
}: {
  tier: TierDef
  thresholds: TiersResponse['constants']
}) {
  const { t } = useI18n()
  const { llmThresholds, imageThresholds } = thresholds
  const llm =
    tier.llmMinToks == null
      ? `< ${llmThresholds.tightMin} tok/s`
      : tier.llmMinToks >= llmThresholds.smoothMin
        ? `> ${llmThresholds.smoothMin} tok/s`
        : `${llmThresholds.tightMin} ~ ${llmThresholds.okMin} tok/s`
  const img =
    tier.imageMaxSeconds == null
      ? `> ${imageThresholds.tightMax} s/张`
      : tier.imageMaxSeconds <= imageThresholds.smoothMax
        ? `< ${imageThresholds.smoothMax} s/张`
        : `${imageThresholds.smoothMax} ~ ${imageThresholds.okMax} s/张`
  return (
    <div className="legend-item">
      <span className="sw" style={{ background: tier.color }} aria-hidden="true" />
      <div>
        <b>{t(`tier.${tier.key}`)}</b>
        <span>
          LLM {llm} · 图像 {img}
        </span>
      </div>
    </div>
  )
}
