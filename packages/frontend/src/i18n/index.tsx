/**
 * 轻量 i18n（一期只启用中文，预留 lang 状态，en 二期启用）。
 * t(key) 支持点分路径（如 'tier.smooth'）与 {var} 插值。
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import zh from './zh.json'

export type Dict = typeof zh
export type Lang = 'zh' | 'en'

interface I18nCtx {
  t: (key: string, vars?: Record<string, string | number>) => string
  lang: Lang
}

const I18nContext = createContext<I18nCtx>({
  t: (k) => k,
  lang: 'zh',
})

type JsonNode = Record<string, unknown> | string

function lookup(dict: JsonNode, key: string): string {
  const val = key.split('.').reduce<JsonNode | undefined>((node, k) => {
    if (node && typeof node === 'object') return (node as Record<string, JsonNode>)[k]
    return undefined
  }, dict as JsonNode)
  return typeof val === 'string' ? val : key
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // 一期只启用中文
  const [lang] = useState<Lang>('zh')

  const t = (key: string, vars?: Record<string, string | number>): string => {
    let s = lookup(zh, key)
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    }
    return s
  }

  return <I18nContext.Provider value={{ t, lang }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nCtx {
  return useContext(I18nContext)
}
