/**
 * 首页硬件选择面板（设计稿 picker card）：
 * 目标硬件 select ↔ 自定义显存 switch（互斥）+ 配置摘要（带宽/FP16 或 显存/可用）。
 * 状态全部由父级从 URL query 解析并回写（filters 见 src/api/filters.ts）。
 */
import { useMemo, useState } from 'react'
import type { GpuSpec } from '@can-i-deploy/shared'
import { ENGINE_CONSTANTS } from '@can-i-deploy/shared'
import { useI18n } from '../i18n'
import { formatGb } from '../lib/format'

export interface GpuPickerProps {
  gpus: GpuSpec[]
  /** 硬件列表加载中（select 禁用 + 摘要待显示） */
  loading: boolean
  /** 当前 gpu_id（null = 后端兜底第一张卡） */
  gpuId: number | null
  /** 自定义显存模式开关 */
  customOn: boolean
  /** 自定义显存输入（GB，合法值） */
  customVram: number | null
  onGpuChange: (gpuId: number | null) => void
  onToggleCustom: (on: boolean) => void
  onVramChange: (v: number | null) => void
}

const VRAM_MIN = 1
const VRAM_MAX = 512

export function GpuPicker({
  gpus,
  loading,
  gpuId,
  customOn,
  customVram,
  onGpuChange,
  onToggleCustom,
  onVramChange,
}: GpuPickerProps) {
  const { t } = useI18n()
  // 输入框本地文本（提交合法值前保留用户输入，避免受 URL 回写打断）
  const [draft, setDraft] = useState<string>(customVram != null ? String(customVram) : '')

  const selectedGpu = useMemo(() => {
    if (gpuId != null) return gpus.find((g) => g.id === gpuId) ?? null
    return gpus[0] ?? null // 后端兜底第一张卡
  }, [gpus, gpuId])

  const onInput = (raw: string) => {
    setDraft(raw)
    if (raw === '') {
      onVramChange(null)
      return
    }
    const v = Number(raw)
    if (!Number.isFinite(v) || v < VRAM_MIN || v > VRAM_MAX) return // 非法：仅提示，不回写
    onVramChange(Math.floor(v * 10) / 10)
  }

  const showVramError = draft !== '' && customOn && (Number(draft) < VRAM_MIN || Number(draft) > VRAM_MAX)

  return (
    <div className="picker card">
      <div className="field">
        <label htmlFor="gpu-select">{t('home.hardwareLabel')}</label>
        <div className="select-wrap">
          <select
            id="gpu-select"
            value={customOn ? '' : (selectedGpu?.id ?? '')}
            disabled={loading || customOn}
            aria-describedby="picker-hint"
            onChange={(e) => {
              const id = Number(e.target.value)
              onGpuChange(Number.isFinite(id) && id > 0 ? id : null)
            }}
          >
            {gpus.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}（{g.vram_gb} GB）
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="or-sep">{t('home.orSeparator')}</div>
      <div className="field">
        <label className="switch" htmlFor="custom-toggle">
          <input
            type="checkbox"
            id="custom-toggle"
            checked={customOn}
            onChange={(e) => onToggleCustom(e.target.checked)}
          />
          <span className="track" aria-hidden="true" />
          <span className="switch-label">{t('home.customVram')}</span>
        </label>
        <input
          type="number"
          min={VRAM_MIN}
          max={VRAM_MAX}
          step="1"
          placeholder={t('home.customVramPlaceholder')}
          aria-label={t('home.customVramAria')}
          disabled={!customOn}
          value={draft}
          onChange={(e) => onInput(e.target.value)}
        />
        {showVramError && (
          <p role="alert" style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 6 }}>
            {t('home.vramRangeError', { min: VRAM_MIN, max: VRAM_MAX })}
          </p>
        )}
      </div>
      <div className="picker-summary" id="picker-summary" aria-live="polite">
        {customOn ? (
          customVram == null ? (
            <span>{t('home.summaryVramPending')}</span>
          ) : (
            <>
              <span className="stat">
                {t('home.summaryVram')} <span className="num">{formatGb(customVram)}</span> GB
              </span>
              <span className="stat">
                {t('home.summaryAvailable')} <span className="num">{formatGb(customVram - ENGINE_CONSTANTS.systemReserveGb)}</span> GB
                <span className="sub">{t('home.summaryReserve', { gb: ENGINE_CONSTANTS.systemReserveGb })}</span>
              </span>
            </>
          )
        ) : selectedGpu ? (
          <>
            <span className="stat">
              {t('home.summaryBandwidth')} <span className="num">{selectedGpu.memory_bandwidth_gbps}</span> GB/s
            </span>
            <span className="stat">
              FP16 <span className="num">{selectedGpu.fp16_tflops}</span> TFLOPS
            </span>
          </>
        ) : null}
      </div>
      <p id="picker-hint" hidden />
    </div>
  )
}
