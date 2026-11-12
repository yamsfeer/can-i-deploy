/**
 * 模型详情页（设计稿 ② page-detail）：
 * 返回链接 + 详情头（kicker / 标题 / 事实行 / 操作）+ 左侧（模型信息 + 量化档位表）
 * + 右侧 sticky（硬件选择 + 上下文滑块实时重算 KV + 换卡建议）。
 *
 * gpu_id / custom_vram / context 承载在 URL query，与首页共享；
 * 分级与 KV 重算全部由后端完成（/api/models/:id），前端零公式。
 */
import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { CSSProperties } from 'react'
import type { GpuSpec, ModelDetail, QuantRow } from '@can-i-deploy/shared'
import { ApiError } from '../api/client'
import { parseFilters, toSearchParams, type ModelFilters } from '../api/filters'
import { useHardware } from '../hooks/useHardware'
import { useModelDetail } from '../hooks/useModelDetail'
import { useI18n } from '../i18n'
import { formatCompact, formatGb, formatParams, formatSecondsPerImage, formatTokPerSec } from '../lib/format'
import { Icon } from '../components/Icon'
import { SourcePill } from '../components/SourcePill'
import { TierBadge } from '../components/TierBadge'

const TYPE_KEY = { llm: 'detail.typeLlm', vlm: 'detail.typeVlm', image: 'detail.typeImage' } as const

export default function ModelDetailPage() {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseFilters(searchParams), [searchParams])

  const hardware = useHardware()
  const detail = useModelDetail(id ?? '', filters)

  const gpus = hardware.data?.data ?? []
  const data = detail.data?.data ?? null
  const notFound =
    detail.error != null && detail.errorRaw instanceof ApiError && detail.errorRaw.status === 404

  const setFilters = (patch: Partial<ModelFilters>) => {
    setSearchParams(toSearchParams({ ...filters, ...patch }), { replace: true })
  }

  /* ── 未找到（404） ── */
  if (notFound) {
    return (
      <div className="not-found">
        <div className="big" aria-hidden="true">
          404
        </div>
        <h1>{t('detail.notFound')}</h1>
        <p>{t('detail.notFoundDesc')}</p>
        <Link className="btn btn-dark" to="/">
          <Icon name="back" />
          {t('detail.backToHome')}
        </Link>
      </div>
    )
  }

  /* ── 加载中 ── */
  if (detail.loading && !data) {
    return (
      <section>
        <div className="card" style={{ marginTop: 30 }}>
          <div className="skel name" style={{ width: '40%' }} />
          <div style={{ marginTop: 14 }}>
            <div className="skel w" />
          </div>
          <div style={{ marginTop: 8 }}>
            <div className="skel sm" />
          </div>
        </div>
        <div className="card">
          <div className="skel name" style={{ width: '24%' }} />
          <div style={{ marginTop: 14 }}>
            <div className="skel w" />
          </div>
          <div style={{ marginTop: 8 }}>
            <div className="skel sm" />
          </div>
        </div>
      </section>
    )
  }

  /* ── 其他错误 ── */
  if (detail.error || !data) {
    return (
      <section>
        <div className="error-card card" style={{ marginTop: 30 }}>
          <div className="err-title">
            <Icon name="alert" style={{ color: 'var(--danger)' }} />
            {t('detail.errorTitle')}
          </div>
          <p>{detail.error ?? t('detail.errorUnknown')}</p>
          <button className="btn btn-sand" onClick={detail.refresh}>
            <Icon name="retry" />
            {t('home.retry')}
          </button>
        </div>
      </section>
    )
  }

  return <DetailBody data={data} gpus={gpus} filters={filters} setFilters={setFilters} />
}

/* ── 详情主体（数据就绪后渲染；gpu 联动与上下文滑块状态放这里） ── */
function DetailBody({
  data,
  gpus,
  filters,
  setFilters,
}: {
  data: ModelDetail
  gpus: GpuSpec[]
  filters: ModelFilters
  setFilters: (patch: Partial<ModelFilters>) => void
}) {
  const { t } = useI18n()
  const target = filters.gpu_id != null ? gpus.find((g) => g.id === filters.gpu_id) : gpus[0]

  // 上下文滑块：K tokens 整数，上限 = 原生上下文（clamp 至少 1K）
  const maxK = Math.max(1, Math.floor((data.context_length ?? 32768) / 1000))
  const ctxK = Math.min(Math.max(1, Math.round(filters.context / 1000)), maxK)

  // 自定义显存模式（无具体 GPU，速度不可预估）
  const customMode = filters.gpu_id == null && filters.custom_vram != null

  const firstQuant = data.quantizations.find((q) => q.available)
  const kvGb = firstQuant?.kvGb ?? null

  const advice = buildAdvice(data, customMode, target, t)

  const onCtxChange = (k: number) => {
    setFilters({ context: Math.min(Math.max(k, 1), maxK) * 1000 })
  }

  return (
    <section>
      <Link className="back-link" to="/">
        <Icon name="back" />
        {t('detail.back')}
      </Link>

      {/* 详情头 */}
      <div className="detail-head">
        <div className="title-block">
          <div className="kicker">
            <SourcePill source={data.source} label={t(`detail.source${data.source === 'hf' ? 'Hf' : 'Modelscope'}`)} />
            <span className="pill">{data.org}</span>
            <span className="pill">{t(TYPE_KEY[data.model_type])}</span>
          </div>
          <h1>{data.name}</h1>
          <div className="facts">
            <span>
              {t('detail.params')} <span className="num">{formatParams(data.params) ?? '—'}</span>
            </span>
            <span>
              {t('detail.context')}{' '}
              <span className="num">
                {data.context_length ? formatCompact(data.context_length) : '—'}
              </span>
            </span>
            {data.license && (
              <span>
                {t('detail.license')} <span className="num">{data.license}</span>
              </span>
            )}
            <span>
              {t('detail.downloads')} <span className="num">{formatCompact(data.downloads) ?? '—'}</span>
            </span>
          </div>
        </div>
        <div className="head-actions">
          <a
            className="btn btn-dark"
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="external" />
            {t('detail.officialLink')}
          </a>
          <Link className="btn btn-ghost" to="/">
            {t('detail.otherModels')}
          </Link>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          {/* 模型信息 */}
          <div className="card">
            <h2>{t('detail.infoTitle')}</h2>
            <dl className="def-list">
              <dt>{t('detail.params')}</dt>
              <dd>
                <span className="num">{formatParams(data.params) ?? '—'}</span>
                {data.params != null && data.params >= 100 && (
                  <span style={{ color: 'var(--faint)', fontSize: 12.5, marginLeft: 8 }}>
                    {t('detail.moeNote')}
                  </span>
                )}
              </dd>
              <dt>{t('detail.context')}</dt>
              <dd>
                {data.context_length ? (
                  <span className="num">
                    {formatCompact(data.context_length)} tokens
                  </span>
                ) : (
                  t('detail.noContext')
                )}
              </dd>
              <dt>{t('detail.architecture')}</dt>
              <dd>
                <span className="num" style={{ fontSize: 14 }}>
                  {data.architecture ?? '—'}
                </span>
              </dd>
              <dt>{t('detail.kvType')}</dt>
              <dd>
                {data.kv_cache_type ?? '—'}
                {data.kv_cache_type === 'mla' && (
                  <span style={{ color: 'var(--faint)', fontSize: 12.5, marginLeft: 8 }}>
                    {t('detail.mlaNote')}
                  </span>
                )}
              </dd>
              {data.license && (
                <>
                  <dt>{t('detail.license')}</dt>
                  <dd>{data.license}</dd>
                </>
              )}
              <dt>{t('detail.source')}</dt>
              <dd>
                {t(`detail.source${data.source === 'hf' ? 'Hf' : 'Modelscope'}`)}
                <span className="src-id">{data.source_id}</span>
              </dd>
              <dt>
                {t('detail.downloads')} / {t('detail.likes')}
              </dt>
              <dd>
                <span className="num">{formatCompact(data.downloads) ?? '—'}</span> /{' '}
                <span className="num">{formatCompact(data.likes) ?? '—'}</span>
              </dd>
            </dl>
          </div>

          {/* 量化档位分级 */}
          <div className="card">
            <h2>{t('detail.quantTitle')}</h2>
            <div className="table-scroll">
              <table className="quant-table">
                <thead>
                  <tr>
                    <th>{t('detail.quantCol')}</th>
                    <th>{t('detail.weight')}</th>
                    <th>KV</th>
                    <th>{t('detail.vram')}</th>
                    <th>{t('detail.speed')}</th>
                    <th>{t('detail.tierCol')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.quantizations.map((q) => (
                    <QuantRowView key={q.quantName} row={q} modelType={data.model_type} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 右侧：硬件与上下文 */}
        <aside>
          <div className="card" style={{ position: 'sticky', top: 84 }}>
            <h2>{t('detail.hwCtxTitle')}</h2>
            <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label
                htmlFor="gpu-select-detail"
                style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--faint)', letterSpacing: '0.04em' }}
              >
                {t('home.hardwareLabel')}
              </label>
              <div className="select-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
                <select
                  id="gpu-select-detail"
                  disabled={customMode}
                  value={customMode ? '' : (target?.id ?? '')}
                  onChange={(e) => {
                    const gpuId = Number(e.target.value)
                    setFilters({ gpu_id: Number.isFinite(gpuId) && gpuId > 0 ? gpuId : null, custom_vram: null })
                  }}
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    height: 40,
                    padding: '0 36px 0 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border-2)',
                    background: customMode ? 'var(--bg)' : 'var(--surface-2)',
                    color: customMode ? 'var(--faint)' : 'var(--ink)',
                    fontSize: 14,
                    minWidth: '100%',
                    cursor: customMode ? 'not-allowed' : 'pointer',
                  }}
                >
                  {gpus.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}（{g.vram_gb} GB）
                    </option>
                  ))}
                </select>
                {!customMode && (
                  <span
                    style={{
                      position: 'absolute',
                      right: 13,
                      top: '50%',
                      width: 8,
                      height: 8,
                      borderRight: '1.7px solid var(--muted)',
                      borderBottom: '1.7px solid var(--muted)',
                      transform: 'translateY(-70%) rotate(45deg)',
                      pointerEvents: 'none',
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>
              {customMode && (
                <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>
                  {t('detail.customModeNote', { vram: formatGb(filters.custom_vram) ?? '—' })}
                </p>
              )}
            </div>

            <div style={{ marginTop: 20 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  fontSize: 13,
                  color: 'var(--muted)',
                }}
              >
                <span>{t('detail.contextLabel')}</span>
                <span className="ctx-readout">
                  <span className="val">{ctxK}</span>
                  <span className="unit">{t('detail.contextUnit')}</span>
                </span>
              </div>
              <input
                className="ctx-slider"
                type="range"
                min={1}
                max={maxK}
                step={1}
                value={ctxK}
                aria-label={t('detail.contextAria')}
                style={{ '--fill': `${Math.round((ctxK / maxK) * 100)}%` } as CSSProperties}
                onChange={(e) => onCtxChange(Number(e.target.value))}
              />
              <div className="ctx-labels">
                <span>1K</span>
                <span>
                  {t('detail.nativeCtx', { ctx: formatCompact(data.context_length) ?? '—' })}
                </span>
              </div>
              <div className="kv-est">
                {t('detail.kvEst', { k: ctxK })}{' '}
                {kvGb != null ? (
                  <>
                    ≈ <span className="num">{formatGb(kvGb)}</span> GB
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>

            <div className={`advice ${advice.kind}`} style={{ marginTop: 20 }}>
              <div className="advice-title">
                <Icon name="alert" />
                {advice.title}
              </div>
              <p>{advice.body}</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

/* ── 建议卡：由后端 suggestedGpu / suggestedFits / minVramGb 驱动 ── */
function buildAdvice(
  data: ModelDetail,
  customMode: boolean,
  target: GpuSpec | undefined,
  t: (k: string, vars?: Record<string, string | number>) => string,
): { kind: 'ok' | 'warn' | 'bad'; title: string; body: string } {
  const min = formatGb(data.minVramGb)
  const gpuName = target?.name
  if (data.suggestedGpu) {
    const sg = data.suggestedGpu
    if (data.suggestedFits) {
      return {
        kind: 'bad',
        title: t('detail.adviceChangeTitle'),
        body: t('detail.adviceChangeBody', { gpu: sg.name, vram: formatGb(sg.vram_gb) ?? '—', min: min ?? '—' }),
      }
    }
    return {
      kind: 'bad',
      title: t('detail.adviceTooBigTitle'),
      body: t('detail.adviceTooBigBody', { gpu: sg.name, vram: formatGb(sg.vram_gb) ?? '—' }),
    }
  }
  if (customMode) {
    return {
      kind: 'ok',
      title: t('detail.adviceCustomTitle'),
      body: t('detail.adviceCustomBody', { min: min ?? '—' }),
    }
  }
  return {
    kind: 'ok',
    title: t('detail.adviceFitsTitle', { gpu: gpuName ?? '' }),
    body: t('detail.adviceFitsBody', { min: min ?? '—' }),
  }
}

/* ── 量化档位行 ── */
function QuantRowView({ row, modelType }: { row: QuantRow; modelType: ModelDetail['model_type'] }) {
  const { t } = useI18n()
  if (!row.available) {
    return (
      <tr className="unavailable">
        <td>
          <span className="quant-name">
            {row.quantName}
            <span className="fmt">{row.format}</span>
          </span>
        </td>
        <td colSpan={5} style={{ color: 'var(--faint)' }}>
          {t('detail.noOfficialQuant')}
        </td>
        <td></td>
      </tr>
    )
  }
  const speed =
    modelType === 'image'
      ? formatSecondsPerImage(row.secondsPerImage)
      : formatTokPerSec(row.tokPerSec)
  const speedUnit =
    modelType === 'image' ? t('detail.secPerImage') : t('detail.tokensPerSec')
  return (
    <tr>
      <td>
        <span className="quant-name">
          {row.quantName}
          <span className="fmt">{row.format}</span>
        </span>
      </td>
      <td>
        <span className="num">{formatGb(row.weightGb)}</span> GB
      </td>
      <td>
        <span className="num">{formatGb(row.kvGb)}</span> GB
      </td>
      <td>
        <span className="num">{formatGb(row.vramGb)}</span> GB
      </td>
      <td>
        {speed ? (
          <span className="num">
            {speed} {speedUnit}
          </span>
        ) : (
          <span className="td-muted">—</span>
        )}
      </td>
      <td>
        <TierBadge tier={row.tier} title={row.noteKey ? t(row.noteKey) : null} />
      </td>
      <td>
        {row.url && (
          <a
            className="icon-link"
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('detail.officialLink')}
          >
            <Icon name="external" style={{ color: 'var(--faint)' }} />
          </a>
        )}
      </td>
    </tr>
  )
}
