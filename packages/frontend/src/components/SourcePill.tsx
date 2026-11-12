/**
 * 数据来源 pill（Hugging Face 暖金 / ModelScope 蓝）。
 */
import type { Source } from '@can-i-deploy/shared'
import { useI18n } from '../i18n'

export interface SourcePillProps {
  source: Source | string
  /** 完整名称（如 "Hugging Face"）；默认取 i18n */
  label?: string
}

export function SourcePill({ source, label }: SourcePillProps) {
  const { t } = useI18n()
  const key = source === 'hf' ? 'srcHf' : 'srcMs'
  const cls = source === 'hf' ? 'src-hf' : 'src-ms'
  return (
    <span className={`pill ${cls}`} title={label ?? t(key)}>
      {source === 'hf' ? 'HF' : 'MS'}
    </span>
  )
}
