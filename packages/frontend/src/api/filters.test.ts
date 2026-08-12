/**
 * filters 测试：URL query 与筛选状态的双向转换（默认值 / 容错 / 互斥 / key 稳定）。
 */
import { describe, it, expect } from 'vitest'
import { parseFilters, toSearchParams, filtersKey, DEFAULT_FILTERS } from './filters'

describe('parseFilters: 默认与解析', () => {
  it('空 query → 全默认', () => {
    const f = parseFilters(new URLSearchParams(''))
    expect(f.type).toBe('llm')
    expect(f.gpu_id).toBeNull()
    expect(f.custom_vram).toBeNull()
    expect(f.context).toBe(8192)
    expect(f.q).toBe('')
    expect(f.sort).toBe('downloads')
    expect(f.limit).toBe(200)
  })

  it('完整解析各字段', () => {
    const f = parseFilters(new URLSearchParams('type=image&gpu_id=3&context=4096&q=qwen&sort=name&limit=50'))
    expect(f.type).toBe('image')
    expect(f.gpu_id).toBe(3)
    expect(f.context).toBe(4096)
    expect(f.q).toBe('qwen')
    expect(f.sort).toBe('name')
    expect(f.limit).toBe(50)
  })

  it('custom_vram 解析为数字', () => {
    const f = parseFilters(new URLSearchParams('custom_vram=16.5'))
    expect(f.custom_vram).toBe(16.5)
    expect(f.gpu_id).toBeNull()
  })
})

describe('parseFilters: 互斥与容错', () => {
  it('gpu_id 与 custom_vram 同传时 gpu_id 优先', () => {
    const f = parseFilters(new URLSearchParams('gpu_id=2&custom_vram=16'))
    expect(f.gpu_id).toBe(2)
    expect(f.custom_vram).toBeNull()
  })

  it('非法值回落默认', () => {
    const f = parseFilters(new URLSearchParams('type=bad&context=abc&gpu_id=-1&sort=hack'))
    expect(f.type).toBe('llm')
    expect(f.context).toBe(8192)
    expect(f.gpu_id).toBeNull()
    expect(f.sort).toBe('downloads')
  })

  it('q 去除首尾空格', () => {
    const f = parseFilters(new URLSearchParams('q=  hello  '))
    expect(f.q).toBe('hello')
  })

  it('limit 超过 500 回落默认', () => {
    const f = parseFilters(new URLSearchParams('limit=9999'))
    expect(f.limit).toBe(200)
  })
})

describe('toSearchParams: 序列化', () => {
  it('默认值不写入（URL 保持简洁）', () => {
    expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe('')
  })

  it('非默认值写入', () => {
    const s = toSearchParams({ ...DEFAULT_FILTERS, type: 'image', gpu_id: 3, context: 4096, q: 'qwen' })
    expect(s.toString()).toBe('type=image&gpu_id=3&context=4096&q=qwen')
  })

  it('gpu_id 存在时忽略 custom_vram', () => {
    const s = toSearchParams({ ...DEFAULT_FILTERS, gpu_id: 1, custom_vram: 8 })
    expect(s.toString()).toBe('gpu_id=1')
  })

  it('仅 custom_vram', () => {
    const s = toSearchParams({ ...DEFAULT_FILTERS, custom_vram: 8 })
    expect(s.toString()).toBe('custom_vram=8')
  })
})

describe('filtersKey: 稳定序列化', () => {
  it('语义等价的状态得到相同 key', () => {
    const a = filtersKey(parseFilters(new URLSearchParams('gpu_id=1')))
    const b = filtersKey({ ...DEFAULT_FILTERS, gpu_id: 1 })
    expect(a).toBe(b)
  })

  it('不同状态得到不同 key', () => {
    const a = filtersKey({ ...DEFAULT_FILTERS, gpu_id: 1 })
    const b = filtersKey({ ...DEFAULT_FILTERS, gpu_id: 2 })
    expect(a).not.toBe(b)
  })
})
