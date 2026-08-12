/**
 * 端到端测试：前端数据层 ↔ 真实后端进程 ↔ 真实 HTTP ↔ 内存 SQLite + seed 演示数据。
 *
 * 背景（2026-08-12，feat/backend + feat/frontend 合并后）：前端 UI 尚未实现，
 * 只有数据层（src/api client / filters / hooks / lib/format）。本测试验证两条分支
 * 合并后整体链路能真实跑通：
 *
 *   React 数据层 hooks → api client（fetch）→ 真实 HTTP → Fastify 路由
 *     → 预测引擎（VRAM / 速度 / 4 档分级 / 换卡建议）→ SQLite
 *
 * 做法：beforeAll 以子进程拉起真实后端（backend/e2e/server.ts，内存库 + seed，
 * 随机空闲端口），用 vi.stubEnv 让 client 的 apiBase() 指向它；afterAll 关闭进程。
 *
 * 刻意不触发 POST /api/sync（会打真实 HF / ModelScope 网络，测试保持离线），
 * 只验证管理类只读接口 GET /api/sync/logs。
 *
 * 位置说明：E2E 与单测分离——单测紧挨被测文件放 src/ 内，E2E 独立放本包
 * e2e/ 目录（与 src/ 平级），与 backend/test/ 的既有惯例一致。
 */
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { api, ApiError, apiBase } from '../src/api/client'
import { DEFAULT_FILTERS, parseFilters, toSearchParams } from '../src/api/filters'
import { useHardware } from '../src/hooks/useHardware'
import { useModels } from '../src/hooks/useModels'
import { useModelDetail } from '../src/hooks/useModelDetail'
import { formatCompact, formatGb, formatParams, formatTokPerSec } from '../src/lib/format'
import { startE2eBackend, type E2eBackend } from './helpers'

let backend: E2eBackend | undefined
let gpu4060: number
let gpu4090: number
let qwenId: number
let llamaId: number
let deepseekId: number

afterEach(() => cleanup())

beforeAll(async () => {
  backend = await startE2eBackend()
  vi.stubEnv('VITE_API_BASE', backend.baseUrl)
  // 确认 client 已指向真实后端进程
  expect(apiBase()).toBe(backend.baseUrl)

  // 预取：硬件库两张目标卡 + 三个模型的 id，供各用例复用
  const { data: gpus } = await api.hardware()
  gpu4060 = gpus.find((g) => g.name === 'RTX 4060')!.id
  gpu4090 = gpus.find((g) => g.name === 'RTX 4090')!.id
  const pick = async (q: string) => {
    const res = await api.models(new URLSearchParams(`q=${q}&type=llm`))
    return res.data[0].id
  }
  qwenId = await pick('Qwen2.5-7B')
  llamaId = await pick('Llama-3.1-8B')
  deepseekId = await pick('DeepSeek-V3')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await backend?.close()
})

describe('后端基础数据（真实 seed）', () => {
  it('GET /api/hardware：22 张 GPU，规格字段齐全', async () => {
    const { data } = await api.hardware()
    expect(data).toHaveLength(22)
    const names = data.map((g) => g.name)
    expect(names).toContain('RTX 4060')
    expect(names).toContain('RTX 4090')
    expect(names).toContain('H100 80GB (云)')
    expect(data.every((g) => g.vram_gb > 0 && g.memory_bandwidth_gbps > 0 && g.fp16_tflops > 0)).toBe(true)
  })

  it('GET /api/tiers：4 档定义 + 公式常量', async () => {
    const { data, constants } = await api.tiers()
    expect(data.map((t) => t.key)).toEqual(['smooth', 'ok', 'tight', 'no'])
    expect(data[0].color).toBe('#16a34a')
    expect(constants.defaultContext).toBe(8192)
  })

  it('GET /api/organizations：20 个白名单组织', async () => {
    const { data } = await api.organizations()
    expect(data).toHaveLength(20)
    expect(data.some((o) => o.name === 'Qwen')).toBe(true)
    expect(data.every((o) => o.hf_author && o.modelscope_org)).toBe(true)
  })
})

describe('首页：GET /api/models 列表', () => {
  it('默认：llm 4 个模型，目标硬件兜底 RTX 4060，按下载量降序', async () => {
    const res = await api.models(new URLSearchParams(''))
    expect(res.data).toHaveLength(4)
    expect(res.total).toBe(4)
    expect(res.context).toBe(8192)
    expect(res.target.label).toBe('RTX 4060')
    expect(res.target.estimateSpeed).toBe(true)
    expect(res.target.vramGb).toBe(8)
    expect(res.data[0].name).toBe('Llama-3.1-8B-Instruct') // 下载量最高
  })

  it('badge：Qwen2.5-7B 用 Q4_K_M 档，在 4060 上放得下且流畅', async () => {
    const res = await api.models(new URLSearchParams('q=Qwen2.5-7B&type=llm'))
    const m = res.data[0]
    expect(m.name).toBe('Qwen2.5-7B-Instruct')
    expect(m.badgeQuant).toBe('Q4_K_M')
    expect(m.badge).not.toBeNull()
    expect(m.badge!.tier).toBe('smooth')
    expect(m.badge!.weightGb).toBeCloseTo(3.81, 2)
    expect(m.badge!.vramGb).toBeLessThan(7.5) // 4060 可用显存（8 - 0.5 预留）
    expect(m.badge!.tokPerSec!).toBeGreaterThan(20)
    expect(m.badge!.noteKey).toBeNull()
  })

  it('类型 tab：image 2 个模型、badge 用 fp8；FLUX 放不下而 SDXL 处于 ok 档', async () => {
    const res = await api.models(new URLSearchParams('type=image'))
    expect(res.data).toHaveLength(2)
    const flux = res.data.find((m) => m.name === 'FLUX.1-schnell')!
    expect(flux.badgeQuant).toBe('fp8')
    expect(flux.badge!.tier).toBe('no')
    expect(flux.badge!.noteKey).toBe('tierRule.noVram')
    const sdxl = res.data.find((m) => m.name === 'Stable Diffusion XL')!
    expect(sdxl.badgeQuant).toBe('fp8')
    expect(sdxl.badge!.tier).toBe('ok')
    expect(sdxl.badge!.secondsPerImage!).toBeGreaterThanOrEqual(10)
    expect(sdxl.badge!.secondsPerImage!).toBeLessThan(30)
  })

  it('gpu_id 联动：RTX 4090 + DeepSeek-V3（仅官方 fp16）→ 降级 fp16、放不下', async () => {
    const res = await api.models(new URLSearchParams(`gpu_id=${gpu4090}&q=DeepSeek-V3&type=llm`))
    expect(res.target.label).toBe('RTX 4090')
    const m = res.data[0]
    expect(m.badgeQuant).toBe('fp16') // 无 Q4 官方 → 自动降级到最轻可用档
    expect(m.badge!.tier).toBe('no')
    expect(m.badge!.noteKey).toBe('tierRule.noVram')
  })

  it('排序：sort=name 按名称升序', async () => {
    const res = await api.models(new URLSearchParams('type=llm&sort=name'))
    expect(res.data.map((m) => m.name)).toEqual([
      'DeepSeek-V3',
      'GLM-4-9B-Chat',
      'Llama-3.1-8B-Instruct',
      'Qwen2.5-7B-Instruct',
    ])
  })

  it('custom_vram=8：估速关闭，badge 无速度、noteKey=customVram', async () => {
    const res = await api.models(new URLSearchParams('custom_vram=8&q=Qwen2.5-7B&type=llm'))
    expect(res.target.estimateSpeed).toBe(false)
    expect(res.target.label).toBe('8GB')
    expect(res.target.vramGb).toBe(8)
    expect(res.target.gpu).toBeUndefined()
    const m = res.data[0]
    expect(m.badge!.tokPerSec).toBeNull()
    expect(m.badge!.noteKey).toBe('tierRule.customVram')
    expect(m.badge!.tier).toBe('ok')
  })

  it('URL query 往返（parseFilters → toSearchParams）打到真实后端', async () => {
    const filters = parseFilters(new URLSearchParams('gpu_id=2&context=4096&q=qwen'))
    expect(toSearchParams(filters).toString()).toBe('gpu_id=2&context=4096&q=qwen')
    const res = await api.models(toSearchParams(filters))
    expect(res.context).toBe(4096)
    expect(res.target.label).toBe('RTX 3060 12GB') // id 2
    expect(res.data[0].name).toBe('Qwen2.5-7B-Instruct')
  })
})

describe('详情页：GET /api/models/:id', () => {
  it('Qwen2.5-7B 在 RTX 4090：5 档量化、全档官方、无换卡建议', async () => {
    const res = await api.modelDetail(qwenId, new URLSearchParams(`gpu_id=${gpu4090}`))
    expect(res.target.label).toBe('RTX 4090')
    const d = res.data
    expect(d.architecture).toBe('qwen2')
    expect(d.kv_cache_type).toBe('gqa')
    expect(d.quantizations).toHaveLength(5)
    expect(d.quantizations.every((q) => q.available)).toBe(true) // Qwen 全档官方
    const fp16 = d.quantizations.find((q) => q.quantName === 'fp16')!
    expect(fp16.tier).toBe('smooth')
    const q4 = d.quantizations.find((q) => q.quantName === 'Q4_K_M')!
    expect(q4.weightGb).toBeCloseTo(3.81, 2)
    expect(q4.tokPerSec!).toBeGreaterThan(20)
    expect(d.minVramGb).toBeCloseTo(q4.vramGb, 2) // 最轻档 = 最小需求
    expect(d.suggestedGpu).toBeNull()
    expect(d.suggestedFits).toBeNull()
  })

  it('上下文滑块：kv/vram 随 context 增大；超原生上限被 clamp', async () => {
    const kv = async (ctx: number) =>
      (await api.modelDetail(qwenId, new URLSearchParams(`gpu_id=${gpu4090}&context=${ctx}`)))
        .data.quantizations.find((q) => q.quantName === 'fp16')!
    const [a, b] = [await kv(8192), await kv(32768)]
    expect(b.kvGb).toBeGreaterThan(a.kvGb)
    expect(b.vramGb).toBeGreaterThan(a.vramGb)
    const clamped = await api.modelDetail(qwenId, new URLSearchParams(`gpu_id=${gpu4090}&context=999999`))
    expect(clamped.context).toBe(32768) // Qwen 原生上下文
  })

  it('放不下 → 换卡建议：Llama-3.1-8B（仅 fp16）在 4060 上建议 RTX 3090', async () => {
    const d = (await api.modelDetail(llamaId, new URLSearchParams(`gpu_id=${gpu4060}`))).data
    const fp16 = d.quantizations.find((q) => q.quantName === 'fp16')!
    expect(fp16.tier).toBe('no')
    expect(d.suggestedGpu).not.toBeNull()
    expect(d.suggestedGpu!.name).toBe('RTX 3090')
    expect(d.suggestedFits).toBe(true)
  })

  it('库里最大卡仍不足 → 建议 80GB 顶配卡、fits=false', async () => {
    const d = (await api.modelDetail(deepseekId, new URLSearchParams(`gpu_id=${gpu4060}`))).data
    expect(d.minVramGb!).toBeGreaterThan(1000) // 671B fp16 ≈ 1342GB
    // 库里最大的两张卡同为 80GB（A100 / H100），按 vram_gb,id 稳定排序取到 A100
    expect(d.suggestedGpu!.name).toBe('A100 80GB (云)')
    expect(d.suggestedFits).toBe(false)
  })

  it('custom_vram 详情：速度字段为 null、noteKey=customVram', async () => {
    const res = await api.modelDetail(qwenId, new URLSearchParams('custom_vram=8'))
    expect(res.target.estimateSpeed).toBe(false)
    const q4 = res.data.quantizations.find((q) => q.quantName === 'Q4_K_M')!
    expect(q4.tokPerSec).toBeNull()
    expect(q4.secondsPerImage).toBeNull()
    expect(q4.noteKey).toBe('tierRule.customVram')
    expect(q4.tier).toBe('ok')
  })

  it('不存在的模型 → 404 ApiError（message 取后端 error 字段）', async () => {
    const err = await api.modelDetail(999999, new URLSearchParams('')).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
    expect((err as ApiError).message).toBe('模型不存在')
  })
})

describe('前端数据层 hooks 全链路（React → 真实 HTTP）', () => {
  it('useHardware：真实请求加载 22 张 GPU', async () => {
    const { result } = renderHook(() => useHardware())
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })
    expect(result.current.error).toBeNull()
    expect(result.current.data!.data).toHaveLength(22)
  })

  it('useModels：搜索 qwen 命中 Qwen2.5-7B', async () => {
    const { result } = renderHook(() => useModels({ ...DEFAULT_FILTERS, q: 'qwen' }))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })
    expect(result.current.error).toBeNull()
    expect(result.current.data!.data[0].name).toBe('Qwen2.5-7B-Instruct')
  })

  it('useModelDetail：按 gpu_id 加载详情量化表', async () => {
    const { result } = renderHook(() =>
      useModelDetail(qwenId, { ...DEFAULT_FILTERS, gpu_id: gpu4090 }),
    )
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })
    expect(result.current.error).toBeNull()
    expect(result.current.data!.data.quantizations).toHaveLength(5)
  })
})

describe('数据层格式化（真实后端数值 → 展示文本）', () => {
  it('Qwen2.5-7B 的参数量 / VRAM / 速度 / 下载量格式化', async () => {
    const m = (await api.models(new URLSearchParams('q=Qwen2.5-7B&type=llm'))).data[0]
    expect(formatParams(m.params)).toBe('7.6B')
    expect(formatGb(m.badge!.vramGb)).toBe('5')
    expect(formatTokPerSec(m.badge!.tokPerSec)).toBe('57.1')
    expect(formatCompact(m.downloads)).toBe('1.8M')
  })
})

describe('管理接口（只读）', () => {
  it('GET /api/sync/logs：空库返回空数组（不触发 POST 同步，避免真实网络）', async () => {
    const res = await api.syncLogs()
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.data).toHaveLength(0)
  })
})
