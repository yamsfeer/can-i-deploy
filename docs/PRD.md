# Can I Deploy — 产品需求文档（PRD）

> 版本：v1.0 ｜ 状态：已与需求方确认
> 本文档面向开发 Agent，目标是让接手者无需额外访谈即可按本文档实现。需求访谈的问答回顾见 `Docs/decision-review.md`。

---

## 1. 项目概述

### 1.1 背景与问题
用户（开发者/小团队）经常需要在不同硬件上部署开源模型：云服务器租的 GPU、本地显卡、甚至纯 CPU 机器。开源模型数量巨大且每天都在增长（Hugging Face、ModelScope 双平台），而硬件资源有限。部署前需要快速回答两个问题：

1. **能不能跑**？——该模型（在某个量化和推理方式下）能否装进我的显存？
2. **跑得多好**？——速度大致是什么水平（流畅对话 / 勉强能用 / 太慢）？

如果跑不了，还希望能得到建议：**至少需要什么硬件**。

### 1.2 一句话定位
> 选硬件 → 看模型目录 → 用 4 档分级判断"能不能跑、跑得多好"的 Web 工具，一期覆盖 **LLM / VLM / 图像生成** 三类模型，数据来自 **Hugging Face + ModelScope** 双平台的白名单大厂官方模型。

### 1.3 产品名
- 仓库/品牌名：**Can I Deploy**
- 域名：待定（用户后续决定）
- 界面：**中文一期**，预留 i18n（英文待启用）

### 1.4 差异化（相对现有工具）
- 现有工具（llmrun.dev、canirunthisllm、FitLLM 等）几乎只做 LLM，且**速度预测列为空**
- 本工具：**多模态覆盖（含图像生成）** + **ModelScope 国产模型覆盖** + **给出速度分档预测**

---

## 2. 目标用户与使用场景

| 场景 | 用户动作 | 期望输出 |
|---|---|---|
| 本地有张 4090，想跑个新出的模型 | 选 4090 → 看模型列表 | 该卡上每个模型的等级 badge、VRAM 需求 |
| 云上租了 A100，犹豫租多大 | 选 A100/自定义 VRAM → 看模型 | 能否放下、速度档位、需要的显存 |
| 想跑某模型但不知道行不行 | 搜模型名 → 进详情页 | 各量化档位的 VRAM + 分级 + 换卡建议 |
| 只有 8GB 卡，想找能跑的模型 | 选 VRAM 档位 → 浏览 | 所有"流畅/可以"的模型 |

---

## 3. 核心功能流程

```
选硬件（下拉 GPU / 自定义 VRAM）
   ↓
切换类型 tab（LLM / VLM / 图像生成）
   ↓
模型列表：每行 = 模型名 + 参数量 + Q4_K_M 分级 badge(颜色) + VRAM + 下载量
   ↓
点进模型详情页：
  - 模型信息（参数/上下文/许可/来源/官方链接）
  - 量化档位表（fp16 + Q8/Q6/Q5/Q4_K_M，图像为 fp16/fp8）
  - 上下文滑块（默认 8K，可调，实时重算 KV cache 与 VRAM）
  - 放不下 → 提示"至少需要 X GB 显存 / 建议换 Y 卡"
```

**分级颜色约定**（全站统一）：
- 🟢 绿 = 流畅 ｜ 🔵 蓝 = 可以 ｜ 🟡 黄 = 勉强 ｜ 🔴 红 = 放不下/太慢

**分档说明区**：首页角落 + 独立说明页，展示 4 档量化定义（如"流畅 = tok/s > 20"）与颜色图例，点击可展开看完整定义。

---

## 4. 模型范围

### 4.1 一期（本期实现）
| 类型 | API 类型标签 | 架构 | 预测引擎 |
|---|---|---|---|
| LLM（文本） | `text-generation` | Transformer 自回归 | LLM 引擎（带宽主导） |
| VLM（多模态理解） | `image-text-to-text` | 视觉编码器 + LLM 骨干 | 复用 LLM 引擎 + 视觉编码器固定开销 |
| 图像生成 | `text-to-image` | 扩散（UNet/DiT + VAE + 文本编码器） | 扩散引擎（算力主导） |

### 4.2 二期 / 后续（todo，本期不做）
- 视频生成（`text-to-video` / `image-to-video`）——二期
- 纯 CPU 场景——todo
- 完整反向推荐（输入模型 → 推荐硬件/云实例）——todo（详情页"换卡建议"是它的轻量版，一期做）
- TTS / ASR / Embedding / RAG 模型——todo
- AMD / Apple Silicon 硬件——todo
- vLLM 服务端吞吐预测——todo
- 价格数据——todo

---

## 5. 数据管道（订阅制）

### 5.1 白名单组织清单（订阅对象，HF + ModelScope 双源）

**国产**：Qwen（阿里）、DeepSeek、GLM（智谱）、MiniMax、Moonshot（Kimi）、01.AI（Yi）、BAAI、InternLM（上海AI Lab）、StepFun（阶跃）、Tencent（混元）

**国际**：Meta（Llama）、Google（Gemma）、Mistral、Microsoft（Phi）、xAI（Grok）、Cohere、NVIDIA（Nemotron）、Amazon（Nova）

> 实现时需维护 `组织名 → HF author ID → ModelScope 组织 ID` 的映射表（两侧 ID 可能不同，需逐一确认）。

### 5.2 订阅机制
- **每日一次**（建议凌晨执行，避开高峰），增量拉取
- 对每个白名单组织：拉取其模型列表 → 与库中已有记录比对 → **新增入库 + 更新下载量/参数/文件信息**
- 只收：**官方发布的模型** + **官方发布的量化仓库**（作者 = 官方组织）
- 第三方/个人开发者发布的模型、量化，**一律不收**
- 官方没发量化 → 该模型量化档位留空（显示为空白，不补社区量化）

### 5.3 数据源 API（已实测验证）

**ModelScope**（新 OpenAPI，snake_case）：
```
GET https://modelscope.cn/openapi/v1/models?page_number=1&page_size=100
```
返回字段（直接可用）：`id`、`display_name`、`downloads`、`likes`、`license`、`tasks`（如 `text-generation`）、`created_at`、`last_modified`、**`file_size`（总文件大小）**、**`params`（参数量，直接给！）**、`tags`（含 `model_type:*`、`library:safetensors` 等）
- 分页限制：`page_number × page_size ≤ 3000`
- 按组织过滤：确认列表接口是否支持 `author/org` 参数；若不支持则拉全量分页后按组织过滤（23.8 万总量，需评估耗时/限流，必要时用搜索接口按组织名查）

**Hugging Face**：
```
GET https://huggingface.co/api/models?author={org}&sort=downloads&direction=-1&limit=100
```
返回字段：`id`、`downloads`、`likes`、`pipeline_tag`（`text-generation` / `image-text-to-text` / `text-to-image`）、`tags`（含架构、`base_model:*`、`quantized:*`）、`library_name`、`createdAt`
- **无参数字段**：需从 `config.json`（`GET https://huggingface.co/{model}/raw/main/config.json`）读取 `hidden_size`、`num_hidden_layers`、`intermediate_size`、`num_key_value_heads`、`num_experts` 等字段估算参数量；或读 `model.safetensors.index.json` 的元数据
- 需处理限流（加间隔、重试、缓存）

### 5.4 格式与精度规则（简单规则 + 兜底）
| 规则 | 判定 |
|---|---|
| Safetensors = 原版 | 官方发布默认 fp16/bf16 |
| GGUF = 量化 | 从 GGUF 仓库名/文件名提取档位（Q8_0/Q6_K/Q5_K_M/Q4_K_M） |
| 兜底纠偏 | `实际字节/参数 = file_size ÷ params`：≈2→fp16、≈1→fp8/int8、≈0.5→int4。偏差 > 某阈值（如 0.3）时按实际精度修正，防止 FP8 safetensors 被误当 fp16 |

### 5.5 数据库 Schema（SQLite，初稿）

```sql
-- 白名单组织
organizations(id, name, hf_author, modelscope_org, note)

-- 模型主表
models(
  id,                -- 自增或 source+source_id 复合
  source,            -- 'hf' | 'modelscope'
  source_id,         -- 平台侧模型 ID（如 Qwen/Qwen2.5-7B-Instruct）
  org,               -- 所属白名单组织
  name,              -- 展示名
  model_type,        -- 'llm' | 'vlm' | 'image'
  params,            -- 参数量（ModelScope 直给 / HF 估算）
  context_length,    -- 上下文长度（config.json，缺失可空）
  architecture,      -- 架构（llama/qwen2/mla 等，用于 KV cache 计算）
  kv_cache_type,     -- 'gqa' | 'mha' | 'mla'（影响 KV cache 计算）
  license,
  downloads, likes,
  file_size,         -- 权重文件总大小（兜底纠偏用）
  precision,         -- 实际精度（fp16/fp8/...，兜底纠偏结果）
  url,               -- 平台链接
  created_at, updated_at,
  UNIQUE(source, source_id)
)

-- 量化/格式条目（一个模型多行：fp16 原版 + 各 GGUF 档）
quantizations(
  id,
  model_id FK,
  format,            -- 'safetensors' | 'gguf'
  quant_name,        -- 'fp16' | 'Q8_0' | 'Q6_K' | 'Q5_K_M' | 'Q4_K_M'
  bits_per_param,    -- 2.0 / 1.0 / 0.75 / 0.625 / 0.5
  weight_bytes,      -- 该档位权重大小
  official,          -- 恒为 true（只收官方）
  url,               -- 仓库链接
  downloads,
  UNIQUE(model_id, quant_name)
)

-- 硬件（手工维护的 curated 清单）
gpus(
  id, name,          -- 如 'RTX 4090'、'A100 80GB'
  category,          -- 'consumer' | 'pro' | 'cloud'
  vram_gb,
  memory_bandwidth_gbps,  -- 公式核心
  fp16_tflops,             -- 算力（图像/计算受限场景）
  tier,              -- 8 / 12 / 16 / 24 / 48 GB 档位
  note               -- 云实例映射说明（如 A10 → RTX 2080Ti 级带宽）
)
```

### 5.6 定时任务
- node-cron，每日一次（可配置时刻）
- 任务：拉取白名单组织 → upsert 模型/量化 → 记录执行日志
- 支持手动触发（脚本/API）

---

## 6. 硬件数据库

- 一期：**NVIDIA 物理卡（消费级 + 专业级）+ 常见云实例映射**，约 30~50 个型号，手工维护
- 字段：`VRAM(GB)`、`显存带宽(GB/s)`（速度公式核心）、`FP16 算力(TFLOPS)`、`VRAM 档位`、`云实例映射备注`
- 建议覆盖：3060/4060/4070/4080/4090/5090、3090、A10/A16、A100 40/80、H100、L40S、RTX 6000 Ada、A6000、V100 等
- 云实例（如 A10、A100、H100 云）映射到物理卡规格
- 规格来源：厂商官方规格页 / TechPowerUp（实现时核对）

---

## 7. 预测引擎（纯解析公式，不采实测数据）

> 目标：给出"大概的估量值"，输出 4 档分级，不追求精确数字。所有系数为工程常量，集中配置、上线后按反馈微调。

### 7.1 VRAM 需求计算

```
VRAM = 权重字节 + KV cache + 框架开销

权重字节 = params × bits_per_param / 8        （fp16=2.0、Q8=1.0、Q6=0.75、Q5=0.625、Q4=0.5）
KV cache（LLM/VLM）：
  - MHA：2 × layers × heads × head_dim × seq_len × 2 bytes
  - GQA：同上但 kv_heads（< heads）
  - MLA（DeepSeek 系）：按压缩后的 KV 维度计算（实现时按架构取近似，如 1/8 系数）
  - 上下文长度：默认 8192，用户可调（滑块 1K~模型原生上下文）
KV cache（VLM 额外）：视觉编码器固定开销 + 图像 token 数 × 每 token KV
框架开销：固定 ~0.5~1GB（CUDA context + 引擎常驻），取常量
图像生成：权重(UNet/DiT + text encoder + VAE) + 中间激活（按分辨率档位估算）+ 框架开销
```

### 7.2 速度预测

**LLM/VLM（decode 单流，内存带宽主导）**：
```
tok/s ≈ min( 带宽约束, 算力约束 )
  带宽约束 = 显存带宽(GB/s) × 带宽利用率 ÷ 权重字节(GB)
  算力约束 = fp16_TFLOPS × 1e12 ÷ (2 × params)      # 每 token 约 2×params FLOPs
带宽利用率：工程常量，默认 0.8（llama.cpp 实测 70~90%，可按 GPU 归档微调）
```

**图像生成（diffusion，算力主导）**：
```
秒/张 ≈ 步数 × 单步前向时间
单步前向时间 ≈ (2 × active_params × 分辨率因子) ÷ (fp16_TFLOPS × 利用率)
步数：按模型惯例（SD/SDXL≈30、Flux≈20~50、蒸馏模型 1~4），实现时按模型/架构给默认值
分辨率因子：以 1024×1024 为基准，按分辨率缩放
```

### 7.3 4 档分级（全站统一）

**第 1 步：VRAM 硬约束**
- `VRAM 需求 > 可用显存（显存 − 0.5GB 系统预留）` → **🔴 放不下**（页面同时给出"至少需要 X GB / 建议换 Y 卡"）

**第 2 步：速度分档**（放得下的情况）

| 档位 | LLM（tok/s） | 图像（秒/张，SDXL 30 步 1024² 基准） |
|---|---|---|
| 🟢 流畅 | > 20 | < 10s |
| 🔵 可以 | 5 ~ 20 | 10 ~ 30s |
| 🟡 勉强 | 2 ~ 5 | 30 ~ 60s |
| 🔴 太慢 | < 2 | > 60s |

**附加规则**：放得下但显存余量 < 1GB → 强制 **🟡 勉强**（防 OOM 抖动）。

**列表页展示**：用 **Q4_K_M 档**（图像用 fp8 档）在该硬件下的分级；详情页每个量化档位各显示一个分级。

---

## 8. 页面与 API 设计

### 8.1 页面（4 页，样式风格由设计软件另行设计，本文只定结构与交互）

**① 首页**
- 硬件选择器：下拉选 GPU（硬件库）+ "自定义 VRAM"输入兜底
- 类型 tab：LLM / VLM / 图像生成
- 模型列表（默认按下载量排序）：模型名、参数量、类型标签、**分级 badge（颜色）**、VRAM、下载量、来源平台标识（HF/ModelScope）
- 分档说明区（角落，可展开）：4 档颜色图例 + 量化定义

**② 模型详情页** `/model/:id`
- 模型信息：参数量、上下文长度、许可、来源平台、官方仓库链接
- 硬件选择（与首页联动，可改）
- 量化档位表：每档一行 = 档位名 + VRAM 需求 + 分级 badge + 官方仓库链接；无官方量化的档位留空显示
- 上下文滑块：1K ~ 模型原生上下文，实时重算 KV cache / VRAM / 分级
- 放不下时：显示"至少需要 X GB 显存"，并给出"建议换 Y 卡"（从硬件库找 VRAM 刚够的最小卡）
- 支持该模型的 GPU 列表（可选，二期可增强）

**③ 硬件页** `/hardware`
- GPU 规格表：型号、类别（消费/专业/云）、VRAM、显存带宽、FP16 算力、档位、云实例映射备注

**④ 分档说明页** `/tiers`
- 4 档完整量化定义（LLM tok/s 与图像 s/张的阈值表）+ 颜色图例 + 公式说明（简）

### 8.2 后端 API（REST，前后端分离）

```
GET /api/hardware                 → GPU 列表（含云实例）
GET /api/models?type=llm|vlm|image&gpu_id=&custom_vram=&context=&q=&sort=
                                 → 模型列表 + 每模型 Q4_K_M 档分级结果（后端算好，前端直接渲染）
GET /api/models/:id?gpu_id=&context=
                                 → 详情：模型信息 + 量化表（各档 VRAM + 分级）+ 换卡建议
GET /api/tiers                    → 分档定义（说明页数据）
GET /api/organizations            → 白名单组织列表（关于页展示）
POST /api/sync                    → 手动触发数据拉取（可选，限管理）
```

> 分级计算放后端：前端只传 `gpu_id/custom_vram/context`，后端返回每档分级结果，保证公式单一实现、前端零逻辑。

### 8.3 i18n
- 一期：`zh.json` 文案，全部 UI 文案走 key（不硬编码）
- 预留 `en.json`，二期启用
- 实现：前端轻量 i18n 方案（如 i18next 或自研简单字典），后端错误消息同样走字典

---

## 9. 技术栈与工程结构

```
pnpm monorepo（pnpm-workspace.yaml）
├── apps/
│   ├── web/        # React + Vite + TS 前端 SPA
│   └── api/        # Node + TS + Fastify 后端
│       ├── src/routes/     # REST 路由
│       ├── src/services/   # 业务逻辑（预测引擎、数据管道）
│       ├── src/sync/       # 每日定时任务（node-cron）
│       └── data/           # SQLite 文件（gitignore）
└── packages/
    └── shared/     # 共享类型定义（模型/量化/硬件/分级 DTO）、i18n key 常量
```

- 数据库：**SQLite**（better-sqlite3 或 drizzle-orm），单文件、零运维；访问量起来后迁 Postgres（ORM 抽象预留）
- 预测公式常量（带宽利用率、框架开销、步数表）：集中在 `packages/shared` 的配置文件，便于调参
- 部署：**开发完成后就地部署到用户服务器**（方式待定：Docker Compose / pm2 + nginx，开发后期决策）

---

## 10. 明确的非目标（一期不做）

1. 视频生成模型
2. 纯 CPU / 无独显场景
3. 完整反向推荐（模型 → 最优硬件/云实例选择）
4. AMD、Apple Silicon 硬件
5. TTS / ASR / Embedding / RAG 模型
6. vLLM 类服务端吞吐/并发预测
7. 价格数据（云实例计费）
8. 社区/第三方量化模型
9. 全量模型搜索（只做 curated 目录内过滤）
10. 实测数据采集、用户提交基准

---

## 11. 路线图

| 里程碑 | 内容 | 产出 |
|---|---|---|
| **M1** | monorepo 骨架、SQLite schema、白名单配置、i18n 框架 | 前后端可跑通空壳 |
| **M2** | 数据管道：HF + ModelScope 抓取、参数量获取/估算、精度兜底、每日定时任务 | 数据库有真实模型数据 |
| **M3** | 预测引擎：硬件库、VRAM/速度公式、4 档分级、换卡建议 | 分级结果正确 |
| **M4** | 前端四页 + 交互 + 后端 API 联调 | 完整可用网站 |
| **M5** | 部署到用户服务器（方式后定）、HTTPS、定时任务上线 | 线上可访问 |
| 二期 | 视频生成、反向推荐、CPU 场景、AMD/Apple | — |

---

## 12. 关键待办（开放问题，不阻塞开发）

- [ ] 域名选择与购买（用户决定）
- [ ] 部署方式（Docker Compose vs pm2 + nginx）——M5 前决定
- [ ] 白名单组织的 HF/ModelScope 两侧 ID 映射表（实现时逐一确认）
- [ ] ModelScope 列表接口按组织过滤的能力确认（5.3 节备选方案）
- [ ] HF 参数量估算公式校准（config.json → params）
- [ ] 图像生成模型各架构的步数/分辨率因子表
