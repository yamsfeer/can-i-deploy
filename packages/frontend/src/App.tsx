import { Routes, Route } from 'react-router-dom'
import { TopNav } from './components/TopNav'
import { Footer } from './components/Footer'
import HomePage from './pages/HomePage'
import ModelDetailPage from './pages/ModelDetailPage'
import HardwarePage from './pages/HardwarePage'
import TiersPage from './pages/TiersPage'

/**
 * 路由骨架（PRD §8.1 四页）+ 全站布局（顶部导航 + 页脚）。
 * 视觉风格与交互完全对齐设计稿 packages/frontend/design/can-i-deploy-claude-v2.html。
 */
export default function App() {
  return (
    <>
      <TopNav />
      <main className="wrap">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/model/:id" element={<ModelDetailPage />} />
          <Route path="/hardware" element={<HardwarePage />} />
          <Route path="/tiers" element={<TiersPage />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
