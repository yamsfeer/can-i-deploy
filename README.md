# Can I Deploy

> 选硬件 → 看模型目录 → 用 4 档分级判断「能不能跑、跑得多好」的 Web 工具。
> 一期覆盖 **LLM / VLM / 图像生成**，数据来自 **Hugging Face + ModelScope** 双平台白名单大厂官方模型。

需求与决策背景见 [`docs/PRD.md`](docs/PRD.md) 与 [`docs/decision-review.md`](docs/decision-review.md)。

## Monorepo 结构

```
├── apps/
│   ├── web/        # React + Vite + TS 前端 SPA（当前为骨架空壳，前端 Agent 实现中）
│   └── api/        # Node + TS + Fastify 后端（已完成：SQLite + 预测引擎 + 5 REST 接口）
│       └── src/
│           ├── routes/     # REST 路由
│           ├── services/   # 预测引擎（VRAM / 速度 / 4 档分级 / 换卡建议）
│           ├── sync/       # node-cron 每日定时任务框架
│           └── db/         # node:sqlite（内置，零原生依赖）+ schema + seed
└── packages/
    └── shared/     # 前后端共享：DTO 类型、公式常量、量化档位、i18n key
```

## 快速开始

```bash
pnpm install                 # 安装全部依赖
pnpm --filter @can-i-deploy/api seed   # 初始化数据库 + 演示数据（22 GPU / 8 模型）
pnpm --filter @can-i-deploy/api dev    # 后端 → http://127.0.0.1:3001
pnpm --filter @can-i-deploy/web dev    # 前端 → http://127.0.0.1:5173（/api 已代理到 3001）
```

## 前端对接

**前端 Agent 请先阅读 [`docs/API.md`](docs/API.md)** —— 它是前后端接口的唯一契约，包含全部接口、字段、类型与交互建议。

- 分级计算全在后端，前端零逻辑，只传 `gpu_id / custom_vram / context` 参数并渲染结果。
- 共享类型从 `@can-i-deploy/shared` 导入（Vite alias 已配置）。
- 前端当前为骨架空壳（路由 + i18n 机制 + API client + 占位页面），四页 UI 待实现。

## 当前进度

| 里程碑 | 状态 |
|---|---|
| M1 monorepo 骨架 + SQLite schema + 白名单 + i18n 框架 | ✅ |
| M3 预测引擎（硬件库 / VRAM / 速度 / 分级 / 换卡建议） | ✅ |
| 后端 API（hardware / models / models/:id / tiers / organizations） | ✅ |
| M2 数据管道（HF + ModelScope 抓取、每日定时任务） | ⏳ 占位待实现 |
| M4 前端四页 | ⏳ 前端 Agent 并行开发中 |
| M5 部署 | ⏳ |

## 常用命令

```bash
pnpm --filter @can-i-deploy/api typecheck   # 后端类型检查
pnpm --filter @can-i-deploy/web typecheck   # 前端类型检查
pnpm -r run typecheck                       # 全部
pnpm --filter @can-i-deploy/api seed        # 重建演示数据（可重复执行，幂等）
```
