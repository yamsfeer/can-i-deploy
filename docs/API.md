# Can I Deploy — 后端 API 文档（前端对接版）

> 本仓库后端与前端并行开发。本文档是**前端 Agent 的唯一接口契约**：
> 分级计算全部在后端完成，前端只负责把 `gpu_id / custom_vram / context` 等参数传上去，直接渲染返回的分级结果，**前端零计算逻辑**。

---

## 0. 快速开始

```bash
# 安装依赖（仓库根目录）
pnpm install

# 1. 初始化数据库 + 演示数据（22 张 GPU / 8 个模型）
pnpm --filter @can-i-deploy/backend seed

# 2. 启动后端（端口 3001）
pnpm --filter @can-i-deploy/backend dev

# 3. 启动前端（端口 5173）
pnpm --filter @can-i-deploy/frontend dev
```

- 前端 `vite.config.ts` 已配置 `/api` 代理到 `http://127.0.0.1:3001`，**前端直接请求相对路径 `/api/...` 即可，无需处理 CORS**。
- 共享类型从 `@can-i-deploy/shared` 导入（workspace 包，Vite alias 已配好指向源码）。
- i18n：`src/i18n/zh.json` + `useI18n().t(key)`。后端返回的 `noteKey` 就是 i18n key（见 §4.4），前端直接 `t(noteKey)` 渲染。

---

## 1. 通用约定

| 项 | 约定 |
|---|---|
| Base URL | `http://<host>:3001`（前端走 Vite 代理，用相对 `/api`） |
| 响应包裹 | 成功统一 `{ "data": ... }`；错误 `{ "error": "中文描述" }` + 非 200 状态码 |
| 认证 | 无（一期开放） |
| 数值单位 | 所有 VRAM / 权重 / KV / 开销字段均为 **GB（十进制，1 GB = 1e9 bytes）** |
| 内容协商 | 默认 JSON |

### 1.1 统一响应示例

```jsonc
// 成功（列表类）
{ "data": [ ... ], "total": 8, "context": 8192, "target": { ... } }

// 成功（详情类）
{ "data": { ... }, "context": 8192, "target": { ... } }

// 错误
{ "error": "模型不存在" }     // HTTP 404
```

---

## 2. 核心概念（前端必须先理解这三件事）

### 2.1 目标硬件：`gpu_id` vs `custom_vram`

所有分级计算都依赖「目标硬件」。解析优先级：

1. **`gpu_id=<id>`** —— 硬件库中的 GPU（列表来自 `GET /api/hardware`）。
   - 有带宽/算力 → 完整分级（VRAM 判断 + 速度分档）。
2. **`custom_vram=<number>`** —— 自定义显存（GB）。
   - 只能判断「放得下 / 放不下」，**速度无法预估**。
   - 放得下时返回 `tier: "ok"`、`noteKey: "tierRule.customVram"`（前端据此隐藏速度列）。
3. **都不传** —— 后端兜底用硬件库第一张卡（seed 后为 `RTX 4060`）。

> ⚠️ **前端状态管理建议**：把 `gpu_id` 或 `custom_vram` 放进 **URL query**（首页与详情页共用），刷新/分享链接可保留硬件选择，且首页 ↔ 详情页联动无需全局状态库。

### 2.2 4 档分级 `tier`

全站统一，后端算好，前端只做颜色渲染：

| tier | 含义 | 颜色 | LLM 速度 | 图像速度 |
|---|---|---|---|---|
| `smooth` | 流畅 | 🟢 `#16a34a` | > 20 tok/s | < 10 s/张 |
| `ok` | 可以 | 🔵 `#2563eb` | 5 ~ 20 | 10 ~ 30 |
| `tight` | 勉强 | 🟡 `#ca8a04` | 2 ~ 5 | 30 ~ 60 |
| `no` | 放不下/太慢 | 🔴 `#dc2626` | < 2 | > 60 |

附加规则（后端已处理，前端不用管）：显存余量 < 1GB 强制降为 `tight`；`no` 档可能因放不下（`noteKey: "tierRule.noVram"`）或因太慢（`tierRule.noSpeed`）。

颜色值也可由 `GET /api/tiers` 动态获取（`data[].color`），避免前端硬编码。

### 2.3 量化档位

- **LLM / VLM** 五档：`fp16` → `Q8_0` → `Q6_K` → `Q5_K_M` → `Q4_K_M`（由轻到重）
- **图像生成** 两档：`fp16` → `fp8`
- **列表页分级 badge** 固定用 `Q4_K_M`（图像用 `fp8`）档计算。若该档无官方量化，后端**自动降级**到最轻的可用官方档，并返回 `badgeQuant` 字段标明实际所用档位（前端据此显示"无官方量化，用原版 fp16 估算"之类提示）。
- 详情页 `quantizations[]` 覆盖全部档位；**官方未发布**的档位 `available: false`，前端显示"官方未发布该档位"。

---

## 3. 接口清单

| 方法 | 路径 | 说明 | 前端页面 |
|---|---|---|---|
| GET | `/api/hardware` | GPU 规格列表（含云实例） | 硬件页 / 首页选择器 |
| GET | `/api/models` | 模型列表 + 每模型分级 badge | 首页 |
| GET | `/api/models/:id` | 模型详情：量化表 + 换卡建议 | 详情页 |
| GET | `/api/tiers` | 4 档定义 + 公式常量 | 分档说明页 |
| GET | `/api/organizations` | 白名单组织列表 | （可选）关于/说明 |
| POST | `/api/sync` | 手动触发数据拉取（占位） | 管理 |
| GET | `/api/sync/logs` | 同步日志 | 管理 |

---

## 4. 接口详情

### 4.1 `GET /api/hardware`

请求：无参数。

响应 `{ data: GpuSpec[] }`：

```jsonc
{
  "data": [
    {
      "id": 1,
      "name": "RTX 4060",
      "category": "consumer",      // consumer | pro | cloud
      "vram_gb": 8,
      "memory_bandwidth_gbps": 272,
      "fp16_tflops": 30.2,
      "tier": 8,                   // VRAM 档位（8/12/16/24/32/48/64/80）
      "note": null                 // 云实例映射备注，可为 null
    }
  ]
}
```

### 4.2 `GET /api/models`

模型列表 + 每模型分级 badge。

**Query 参数**

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `type` | `llm`\|`vlm`\|`image` | `llm` | 模型类型 tab |
| `gpu_id` | number | — | 硬件库 GPU id（与 `custom_vram` 互斥，优先） |
| `custom_vram` | number | — | 自定义显存 GB |
| `context` | number | `8192` | 上下文长度（KV cache 计算用；超出模型原生上下文自动截断） |
| `q` | string | 空 | 模糊搜索 name / source_id / org |
| `sort` | `downloads`\|`params`\|`name` | `downloads` | 排序（除 name 外均为降序） |
| `limit` | number | `200` | 最大 500 |

**响应** `{ data: ModelSummary[], total, context, target }`

- `total`：返回条数
- `context`：实际生效的上下文长度（被 clamp 后的值）
- `target`：目标硬件信息 `{ label: string, vramGb: number, estimateSpeed: boolean }`，`estimateSpeed=false` 即自定义显存模式

`ModelSummary`：

```jsonc
{
  "id": 1,
  "source": "hf",                // hf | modelscope
  "source_id": "Qwen/Qwen2.5-7B-Instruct",
  "org": "Qwen",
  "name": "Qwen2.5-7B-Instruct",
  "model_type": "llm",           // llm | vlm | image
  "params": 7.62,                // 参数量（十亿）；null 表示未知
  "context_length": 32768,       // 模型原生上下文；null 表示未知（图像模型通常为 null）
  "downloads": 1800000,
  "likes": 12000,
  "license": "apache-2.0",
  "url": "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct",

  "badge": { /* QuantRow，见 4.3 */ },
  "badgeQuant": "Q4_K_M"         // badge 实际所用档位；无官方量化时为 null
}
```

### 4.3 `GET /api/models/:id`

模型详情。**Query 参数**同 `GET /api/models`（`gpu_id` / `custom_vram` / `context`）。

响应 `{ data: ModelDetail, context, target }`。

`ModelDetail` = `ModelSummary` 全部字段 + 以下：

```jsonc
{
  "architecture": "qwen2",           // 架构名，用于 KV/步数推断
  "kv_cache_type": "gqa",            // mha | gqa | mla
  "quantizations": [ /* QuantRow[]，按档位表顺序，覆盖全部档位 */ ],
  "minVramGb": 1.7,                  // 最轻可用官方档的 VRAM 需求（含框架开销）
  "suggestedGpu": null,              // 换卡建议；放得下为 null
  "suggestedFits": null              // true=建议卡够用；false=库里最大卡仍不足；null=无需换卡
}
```

**`QuantRow`（详情页每档一行；也是列表页 badge 的结构）**：

```jsonc
{
  "quantName": "Q4_K_M",             // fp16 | fp8 | Q8_0 | Q6_K | Q5_K_M | Q4_K_M
  "format": "gguf",                  // safetensors | gguf
  "available": true,                 // 是否有官方文件；false → 前端显示"官方未发布该档位"
  "tier": "smooth",                  // 4 档分级
  "weightGb": 0.48,                  // 权重字节（GB）
  "kvGb": 0.2,                       // KV cache（GB）；图像恒 0；VLM 含视觉开销
  "overheadGb": 0.75,                // 框架开销（GB，常量）
  "vramGb": 1.43,                    // 总 VRAM 需求 = weight + kv + overhead
  "tokPerSec": 1128.8,               // LLM/VLM 速度；图像模型或自定义显存时为 null
  "secondsPerImage": null,           // 图像 s/张；LLM 或自定义显存时为 null
  "noteKey": null,                   // 附加说明的 i18n key（见 §4.4）；正常分级为 null
  "url": "https://huggingface.co/...",
  "downloads": 180000
}
```

> 说明：`available: false` 的档位，除 `quantName` / `format` 外其余字段为 `null`（0.0 / null），前端按"官方未发布"处理，不渲染计算值。

### 4.4 分级附加说明 `noteKey`（i18n key）

| key | 触发场景 |
|---|---|
| `tierRule.noVram` | 放不下（VRAM 需求超可用显存） |
| `tierRule.noSpeed` | 放得下但速度太慢 |
| `tierRule.lowMargin` | 显存余量 < 1GB，强制降档 |
| `tierRule.customVram` | 自定义显存模式，速度无法预估 |

前端：`t(noteKey)` 直接渲染（`zh.json` 已内置这些文案）。`null` 表示正常无附加说明。

### 4.5 `GET /api/tiers`

分档说明页数据源。

响应：

```jsonc
{
  "data": [
    { "key": "smooth", "nameKey": "tier.smooth", "color": "#16a34a",
      "llmMinToks": 20, "imageMaxSeconds": 10, "ruleKey": "tierRule.smooth" },
    { "key": "ok",   "nameKey": "tier.ok",   "color": "#2563eb", "llmMinToks": 5,  "imageMaxSeconds": 30, "ruleKey": "tierRule.ok" },
    { "key": "tight","nameKey": "tier.tight","color": "#ca8a04", "llmMinToks": 2,  "imageMaxSeconds": 60, "ruleKey": "tierRule.tight" },
    { "key": "no",   "nameKey": "tier.no",   "color": "#dc2626", "llmMinToks": null, "imageMaxSeconds": null, "ruleKey": "tierRule.no" }
  ],
  "constants": {
    "llmThresholds": { "smoothMin": 20, "okMin": 5, "tightMin": 2 },
    "imageThresholds": { "smoothMax": 10, "okMax": 30, "tightMax": 60 },
    "baseResolution": "1048576px",
    "defaultContext": 8192,
    "bandwidthUtilization": 0.8,
    "systemReserveGb": 0.5,
    "minFreeMarginGb": 1.0
  }
}
```

`nameKey` / `ruleKey` 均可用 `t()` 渲染（`zh.json` 已内置 `tier.smooth` 等与 `tierRule.smooth` 等）。

### 4.6 `GET /api/organizations`

```jsonc
{ "data": [ { "id": 1, "name": "Qwen", "hf_author": "Qwen", "modelscope_org": "Qwen", "note": null } ] }
```

### 4.7 `POST /api/sync` / `GET /api/sync/logs`（管理，占位）

```jsonc
POST → { "ok": true, "message": "M2 数据管道未实现（占位响应），同步日志已记录" }
GET /api/sync/logs → { "data": [ { "id": 1, "started_at": "...", "finished_at": "...", "status": "skipped", "message": "..." } ] }
```

---

## 5. 完整 TypeScript 类型（与 `@can-i-deploy/shared` 一致）

前端直接 `import type { ... } from '@can-i-deploy/shared'`，无需重复定义。以下为全量参考：

```ts
type ModelType = 'llm' | 'vlm' | 'image'
type Source = 'hf' | 'modelscope'
type TierKey = 'smooth' | 'ok' | 'tight' | 'no'
type GpuCategory = 'consumer' | 'pro' | 'cloud'
type QuantName = 'fp16' | 'fp8' | 'Q8_0' | 'Q6_K' | 'Q5_K_M' | 'Q4_K_M'
type QuantFormat = 'safetensors' | 'gguf'
type KvCacheType = 'mha' | 'gqa' | 'mla'

interface GpuSpec {
  id: number
  name: string
  category: GpuCategory
  vram_gb: number
  memory_bandwidth_gbps: number
  fp16_tflops: number
  tier: number
  note: string | null
}

interface TierDef {
  key: TierKey
  nameKey: string       // i18n key，t() 渲染
  color: string         // 展示颜色，前端 badge 直接用
  llmMinToks: number | null
  imageMaxSeconds: number | null
  ruleKey: string | null
}

interface QuantRow {
  quantName: QuantName
  format: QuantFormat
  available: boolean
  tier: TierKey
  weightGb: number
  kvGb: number
  overheadGb: number
  vramGb: number
  tokPerSec: number | null
  secondsPerImage: number | null
  noteKey: string | null
  url: string | null
  downloads: number | null
}

interface ModelSummary {
  id: number
  source: Source
  source_id: string
  org: string
  name: string
  model_type: ModelType
  params: number | null
  context_length: number | null
  downloads: number
  likes: number | null
  license: string | null
  url: string
  badge: QuantRow | null
  badgeQuant: QuantName | null
}

interface ModelDetail extends ModelSummary {
  architecture: string | null
  kv_cache_type: KvCacheType | null
  quantizations: QuantRow[]
  minVramGb: number | null
  suggestedGpu: GpuSpec | null
  suggestedFits: boolean | null
}

interface Organization {
  id: number
  name: string
  hf_author: string
  modelscope_org: string
  note: string | null
}
```

---

## 6. 前端实现建议

### 6.1 页面 → 接口映射

| 页面 | 主要接口 | 要点 |
|---|---|---|
| 首页 | `/api/models` + `/api/hardware` + `/api/tiers` | 硬件选择器（下拉 GPU + 自定义显存切换）→ 写 URL query；类型 tab → `type`；搜索框 → `q`（建议 400ms debounce）；列表每行渲染 `badge` 的颜色徽章 + VRAM + 速度；角落放可展开的 4 档图例 |
| 详情页 `/model/:id` | `/api/models/:id` | 硬件选择器（与首页同一组件）；上下文滑块 1K~`context_length`（默认 8192，实时重算建议 debounce 300ms）；量化表渲染 `quantizations`（`available=false` 显示"官方未发布"）；放不下时展示 `minVramGb` + `suggestedGpu` |
| 硬件页 | `/api/hardware` | 规格表，按 `category` 分组 |
| 分档说明页 | `/api/tiers` | 4 档颜色图例 + 阈值表 + 公式说明 |

### 6.2 分级 badge 的渲染规则

- **颜色**：`tier` → 色值。可硬编码 `{ smooth:'#16a34a', ok:'#2563eb', tight:'#ca8a04', no:'#dc2626' }` 或从 `/api/tiers` 动态取。
- **tooltip**：`noteKey` 存在时 `t(noteKey)` 作为说明。
- **速度列**：LLM/VLM 显示 `tokPerSec + ' tok/s'`；图像显示 `secondsPerImage + ' s/张'`；两者皆 null（自定义显存模式）显示 `—`。
- **无量化**：`badgeQuant === null` → 该行分级徽章显示"无官方量化"占位。

### 6.3 上下文滑块语义

- 范围：1K ~ `min(context_length ?? 131072, 131072)`，步进 1K。
- 每次变更 → 重新请求详情接口（带 `context` 参数）→ 后端实时重算 KV cache / VRAM / 分级。
- 图像模型 `context_length` 为 null：隐藏滑块（不适用）。

### 6.4 URL query 状态管理

推荐首页与详情页都从 `useSearchParams` 读取 `type / gpu_id / custom_vram / context / q`，变更时写回（`replace: true` 避免历史堆积）。这样：
- 首页 → 详情页跳转时把 query 透传，硬件/上下文选择无缝衔接；
- 刷新 / 分享链接保留状态。

---

## 7. 数据说明（演示 seed）

当前库为演示数据（`pnpm seed` 生成），M2 数据管道接入后自动扩充为真实白名单模型：

| 类型 | 模型 |
|---|---|
| LLM | Qwen2.5-7B-Instruct（5 档官方量化）、DeepSeek-V3（671B MoE，MLA）、Llama-3.1-8B（仅 fp16）、GLM-4-9B-Chat |
| VLM | Qwen2.5-VL-7B-Instruct、InternVL3-8B |
| 图像 | Stable Diffusion XL、FLUX.1-schnell（4 步蒸馏） |

注意：**`source_id` 即为平台侧完整 ID**（如 `Qwen/Qwen2.5-7B-Instruct`），`url` 为官方仓库链接，前端可直接做跳转。

---

## 8. 后端开发备注（前端一般不需要关心）

- 预测引擎：纯解析公式（PRD §7），常量集中在 `packages/shared/src/constants.ts`（带宽利用率、框架开销、图像 FLOPs 校准系数等）。
- 数据库：Node 内置 `node:sqlite`（SQLite 单文件，`packages/backend/data/`）。
- `badge` 档位选择逻辑（前端只消费结果）：LLM/VLM 用 `Q4_K_M`、图像用 `fp8`；无该档官方量化时降级到最轻可用官方档。
