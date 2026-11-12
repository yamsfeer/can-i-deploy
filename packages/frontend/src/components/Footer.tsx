/**
 * 页脚（设计稿 foot-inner：三列信息）。
 */
import { useI18n } from '../i18n'

export function Footer() {
  const { t } = useI18n()
  return (
    <footer>
      <div className="wrap foot-inner">
        <div>
          <b>{t('site.name')}</b>
          {' · '}
          {t('footer.design')}
        </div>
        <div className="foot-note">
          <span className="demo-tag">{t('footer.demoTag')}</span>
          <span>{t('footer.seedNote')}</span>
        </div>
        <div>{t('footer.sources')}</div>
      </div>
    </footer>
  )
}
