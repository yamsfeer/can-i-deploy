/**
 * 内联 SVG 图标（设计稿统一 stroke 风格：stroke-width 1.7，圆头圆角）。
 * 所有 path 提取自 packages/frontend/design/can-i-deploy-claude-v2.html。
 */
import type { CSSProperties, SVGProps } from 'react'

const PATHS: Record<string, string> = {
  /** 品牌波形 mark（加粗 2） */
  wave: 'M5 12h4l2-6 3 12 2-6h3',
  /** 搜索放大镜 */
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  /** 清除 × */
  close: 'M6 6l12 12M18 6L6 18',
  /** 警告三角（错误 / 空态 / 建议） */
  alert: '<path d="M12 3.5L22 20H2L12 3.5z"/><path d="M12 10v5"/><path d="M12 17.6v.1"/>',
  /** 重试 */
  retry: '<path d="M3.5 8a9 9 0 1 1 2.2 9.8"/><path d="M3.5 3.5V8H8"/>',
  /** 信息圆（图例 summary） */
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.4v.1"/>',
  /** 折叠箭头 */
  chevron: 'M6 9l6 6 6-6',
  /** 返回箭头 */
  back: '<path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/>',
  /** 外链 */
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
  /** 勾选 ✓ */
  tick: 'M4.5 12.5l5 5 10-11',
}

export interface IconProps extends SVGProps<SVGSVGElement> {
  /** 图标名（见 PATHS） */
  name: keyof typeof PATHS | string
  /** 覆盖 stroke-width（默认 1.7） */
  strokeWidth?: number
  style?: CSSProperties
}

export function Icon({ name, strokeWidth, className, style, ...rest }: IconProps) {
  const d = PATHS[name]
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={style}
      strokeWidth={strokeWidth ?? (name === 'wave' ? 2 : 1.7)}
      {...rest}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  )
}
