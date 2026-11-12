/**
 * 硬件页（设计稿 ③ page-hardware）：
 * 按类别（消费级 / 专业级 / 云实例）分组的 GPU 规格表，数据来自 GET /api/hardware。
 */
import { useMemo } from 'react'
import type { GpuCategory } from '@can-i-deploy/shared'
import { useHardware } from '../hooks/useHardware'
import { useI18n } from '../i18n'
import { Icon } from '../components/Icon'

const CATS: readonly GpuCategory[] = ['consumer', 'pro', 'cloud']
const CAT_KEY: Record<GpuCategory, string> = {
  consumer: 'hardware.catConsumer',
  pro: 'hardware.catPro',
  cloud: 'hardware.catCloud',
}

export default function HardwarePage() {
  const { t } = useI18n()
  const hardware = useHardware()
  const groups = useMemo(
    () =>
      CATS.map((cat) => ({
        cat,
        gpus: (hardware.data?.data ?? []).filter((g) => g.category === cat),
      })),
    [hardware.data],
  )

  return (
    <section>
      <div className="page-head">
        <div className="eyebrow">Hardware</div>
        <h1>{t('hardware.title')}</h1>
        <p className="sub">
          {t('hardware.subtitleLead')}
          <b>{t('hardware.subtitleB')}</b>
          {t('hardware.subtitleTail')}
        </p>
      </div>

      {hardware.loading && !hardware.data ? (
        <div className="card" style={{ marginTop: 26 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ marginBottom: i === 4 ? 0 : 10 }}>
              <div className="skel w" />
            </div>
          ))}
        </div>
      ) : hardware.error ? (
        <div className="error-card card" style={{ marginTop: 26 }}>
          <div className="err-title">
            <Icon name="alert" style={{ color: 'var(--danger)' }} />
            {t('hardware.errorTitle')}
          </div>
          <p>{hardware.error}</p>
          <button className="btn btn-sand" onClick={hardware.refresh}>
            {t('home.retry')}
          </button>
        </div>
      ) : (
        groups.map(({ cat, gpus }) => (
          <div className="cat-section" key={cat}>
            <h2>
              {t(CAT_KEY[cat])}
              <span className="n">{gpus.length} 款</span>
            </h2>
            <div className="card" style={{ padding: '6px 0 10px' }}>
              <div className="table-scroll">
                <table className="hw-table">
                  <thead>
                    <tr>
                      <th>{t('hardware.colName')}</th>
                      <th>{t('hardware.colVram')}</th>
                      <th>{t('hardware.colBandwidth')}</th>
                      <th>{t('hardware.colFp16')}</th>
                      <th>{t('hardware.colNote')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gpus.map((g) => (
                      <tr key={g.id}>
                        <td className="hw-name">{g.name}</td>
                        <td>
                          <span className="num">{g.vram_gb}</span> GB
                        </td>
                        <td>
                          <span className="num">{g.memory_bandwidth_gbps}</span>
                        </td>
                        <td>
                          <span className="num">{g.fp16_tflops}</span>
                        </td>
                        <td className="hw-note">
                          {g.note ?? <span style={{ color: 'var(--faint)', opacity: 0.55 }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
