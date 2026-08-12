/**
 * 纯数据格式化工具 —— 只做"数值 → 可读文本"的转换，不含任何视觉/布局逻辑。
 * UI 设计完成后直接复用；返回 null 的字段由 UI 自行决定占位展示。
 */

/** 缺失/非法数值的统一语义值（数据层约定，UI 可据类型判断） */
const NA: string | null = null

function valid(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n)
}

/** 保留最多 1 位小数，去掉末尾 0（如 1.8、2.0 → '2'、0.5 → '0.5'） */
function trimOne(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/**
 * 紧凑数字（下载量等）：12345 → '12.3K'，1.8e6 → '1.8M'，2.4e9 → '2.4B'。
 * 千以内返回整数。
 */
export function formatCompact(n: number | null | undefined): string | null {
  if (!valid(n)) return NA
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${trimOne(n! / 1e9)}B`
  if (abs >= 1e6) return `${trimOne(n! / 1e6)}M`
  if (abs >= 1e3) return `${trimOne(n! / 1e3)}K`
  return String(Math.round(n!))
}

/**
 * 参数量（后端已是十亿单位）：7.62 → '7.6B'，671 → '671B'，3.4 → '3.4B'。
 */
export function formatParams(params: number | null | undefined): string | null {
  if (!valid(params)) return NA
  return params! >= 100 ? `${Math.round(params!)}B` : `${trimOne(params!)}B`
}

/** 显存 / VRAM（GB）：1.43 → '1.4'，24 → '24'，128.5 → '128.5'。 */
export function formatGb(gb: number | null | undefined): string | null {
  if (!valid(gb)) return NA
  return gb! >= 100 ? String(Math.round(gb!)) : trimOne(gb!)
}

/** LLM 解码速度（tok/s）：1128.8 → '1129'，7.5 → '7.5'。null 表示不可计算。 */
export function formatTokPerSec(tok: number | null | undefined): string | null {
  if (!valid(tok)) return NA
  return tok! >= 100 ? String(Math.round(tok!)) : trimOne(tok!)
}

/** 图像生成速度（s/张）：2.3 → '2.3'，45 → '45'。null 表示不可计算。 */
export function formatSecondsPerImage(sec: number | null | undefined): string | null {
  if (!valid(sec)) return NA
  return sec! >= 100 ? String(Math.round(sec!)) : trimOne(sec!)
}
