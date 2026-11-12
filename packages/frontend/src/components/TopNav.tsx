/**
 * 顶部导航（设计稿 topnav：sticky + 磨砂背景 + Terracotta 品牌 mark）。
 */
import { NavLink } from 'react-router-dom'
import { useI18n } from '../i18n'
import { Icon } from './Icon'

export function TopNav() {
  const { t } = useI18n()
  return (
    <header className="topnav">
      <div className="wrap topnav-inner">
        <NavLink to="/" className="brand" aria-label={t('site.name')}>
          <span className="mark" aria-hidden="true">
            <Icon name="wave" />
          </span>
          {t('site.name')}
        </NavLink>
        <nav className="nav" aria-label={t('nav.label')}>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/hardware" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('nav.hardware')}
          </NavLink>
          <NavLink to="/tiers" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('nav.tiers')}
          </NavLink>
        </nav>
        <div className="topnav-meta">
          <span className="dot" aria-hidden="true" />
          <span>{t('nav.meta')}</span>
        </div>
      </div>
    </header>
  )
}
