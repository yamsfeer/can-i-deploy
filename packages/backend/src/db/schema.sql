-- Can I Deploy 数据库 Schema（SQLite）
-- 基于 PRD §5.5，补充 KV cache 计算所需的模型结构字段。

-- 白名单组织（订阅对象，HF + ModelScope 双源）
CREATE TABLE IF NOT EXISTS organizations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  hf_author     TEXT NOT NULL,
  modelscope_org TEXT NOT NULL,
  note          TEXT
);

-- 模型主表
CREATE TABLE IF NOT EXISTS models (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source              TEXT NOT NULL CHECK (source IN ('hf','modelscope')),
  source_id           TEXT NOT NULL,            -- 平台侧模型 ID，如 Qwen/Qwen2.5-7B-Instruct
  org                 TEXT NOT NULL,            -- 所属白名单组织
  name                TEXT NOT NULL,            -- 展示名
  model_type          TEXT NOT NULL CHECK (model_type IN ('llm','vlm','image')),
  params              REAL,                     -- 总参数量（十亿）
  active_params       REAL,                     -- 激活参数量（十亿）；MoE 用，非 MoE = params
  context_length      INTEGER,                  -- 原生上下文长度（缺失可空）
  architecture        TEXT,                     -- 架构（llama/qwen2/mla/flux…）
  kv_cache_type       TEXT CHECK (kv_cache_type IN ('mha','gqa','mla')),
  num_layers          INTEGER,                  -- config num_hidden_layers（KV cache 计算）
  num_heads           INTEGER,                  -- config num_attention_heads
  head_dim            INTEGER,                  -- config head_dim（缺失 = hidden_size/num_heads）
  kv_heads            INTEGER,                  -- config num_key_value_heads（MHA 时 = num_heads）
  vision_overhead_bytes INTEGER,                -- VLM 视觉编码器固定开销（字节）
  activation_gb       REAL,                     -- 图像生成中间激活基准（1024²，GB）
  image_steps         INTEGER,                  -- 图像生成采样步数（缺省按架构推断）
  license             TEXT,
  downloads           INTEGER DEFAULT 0,
  likes               INTEGER,
  file_size           INTEGER,                  -- 权重文件总大小（兜底纠偏用）
  precision           TEXT,                     -- 实际精度（fp16/fp8…，兜底纠偏结果）
  url                 TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now')),
  UNIQUE(source, source_id)
);

-- 量化/格式条目（一个模型多行：fp16 原版 + 各 GGUF 档）
CREATE TABLE IF NOT EXISTS quantizations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id        INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  format          TEXT NOT NULL CHECK (format IN ('safetensors','gguf')),
  quant_name      TEXT NOT NULL,                -- 'fp16' | 'fp8' | 'Q8_0' | 'Q6_K' | 'Q5_K_M' | 'Q4_K_M'
  bits_per_param  REAL NOT NULL,                -- 每参数字节数：fp16=2.0 / Q8=1.0 / Q6=0.75 / Q5=0.625 / Q4=0.5
  weight_bytes    INTEGER,                      -- 该档位权重大小
  official        INTEGER DEFAULT 1,            -- 恒为 1（只收官方量化）
  url             TEXT,
  downloads       INTEGER,
  UNIQUE(model_id, quant_name)
);

-- 硬件（手工维护的 curated 清单）
CREATE TABLE IF NOT EXISTS gpus (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL UNIQUE,
  category             TEXT NOT NULL CHECK (category IN ('consumer','pro','cloud')),
  vram_gb              REAL NOT NULL,
  memory_bandwidth_gbps REAL NOT NULL,          -- 公式核心
  fp16_tflops          REAL NOT NULL,           -- FP16 算力（图像/计算受限场景）
  tier                 REAL,                    -- VRAM 档位（8/12/16/24/48/80…）
  note                 TEXT                     -- 云实例映射说明
);

-- 同步执行日志（node-cron 每日任务）
CREATE TABLE IF NOT EXISTS sync_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT,
  finished_at TEXT,
  status      TEXT,
  message     TEXT
);
