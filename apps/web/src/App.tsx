import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ModelDetailPage from './pages/ModelDetailPage'
import HardwarePage from './pages/HardwarePage'
import TiersPage from './pages/TiersPage'

/**
 * 路由骨架（PRD §8.1 四页）。
 * 各页面目前为占位，由前端 Agent 基于 docs/API.md 填充实现。
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/model/:id" element={<ModelDetailPage />} />
      <Route path="/hardware" element={<HardwarePage />} />
      <Route path="/tiers" element={<TiersPage />} />
    </Routes>
  )
}
