# Can I Deploy — Roadmap（未来功能规划）

> 本文档记录一期明确不做、但**计划以后做**的功能，时刻提醒我们产品还有哪些扩展空间。
> 一期范围与产品设计见 `Docs/PRD.md`；非目标清单见 PRD §10。
> 状态说明：`二期` = 一期完成后的下一阶段；`backlog` = 有想法但未排期。

---

## 二期（一期完成后的优先项）

- [ ] **视频生成模型**（`text-to-video` / `image-to-video`，如 Wan、HunyuanVideo、LTX-Video）
  - 与图像扩散架构相近，可复用扩散引擎；难点：显存随帧数/分辨率暴涨、ComfyUI offload 优化、社区数据稀薄
- [ ] **反向推荐完整版**：输入模型 → 推荐最低硬件 / 最合适云实例
  - 详情页"建议换卡"已是一期轻量版，二期做成独立入口

## 模型范围扩展（backlog）

- [ ] TTS / ASR（CosyVoice、F5-TTS、Whisper 等）
- [ ] Embedding / RAG 模型（BGE、Qwen-Embedding 等）
- [ ] 其他模态（随 HF / ModelScope 生态演进再评估）

## 硬件扩展（backlog）

- [ ] AMD GPU（ROCm 生态，用户量小一档）
- [ ] Apple Silicon（M 系列统一内存，显存/带宽模型与独显不同，公式需另写）
- [ ] **纯 CPU / 无独显场景**（llama.cpp CPU 推理，受内存带宽约束）
- [ ] 价格数据（云实例按小时计费，供"最划算"建议）——用户此前表示价格浮动大、参考价值有限，作为低优先 backlog

## 部署 / 引擎侧（backlog）

- [ ] **vLLM 服务端吞吐 / 并发预测**（连续批处理、PagedAttention，与单流是不同模型）
- [ ] 社区量化收录（bartowski / unsloth 等）——一期定调"只收官方量化"，此条仅在以后想放开时启用
- [ ] 全量模型搜索（当前只做白名单 curated 目录，不搞全量检索）
- [ ] 多 GPU / 多卡并行判断

## 数据 / 校准（backlog）

- [ ] 用户提交实测数据（数据飞轮）——一期明确不采实测，此条为以后提升精度的选项
- [ ] 用实测数据校准公式系数（带宽利用率、架构效率等）
- [ ] 基准数据源接入（llm-speed.com、gotcontext.ai 等社区公开数据集）

## 产品功能（backlog）

- [ ] 中英文双语界面（i18n 已预留 `en.json`，一期只启用中文）
- [ ] 模型对比（并排比较两个模型的 VRAM / 分级 / 硬件支持）
- [ ] 账号 / 收藏 / 我的硬件配置持久化（取决于以后是否做用户体系）

## 工程 / 运维（backlog）

- [ ] SQLite → Postgres 迁移（访问量起来后，ORM 层已预留）
- [ ] 部署方案落地（Docker Compose / pm2 + nginx，M5 前决定）
- [ ] 监控 / 数据管道执行日志告警
