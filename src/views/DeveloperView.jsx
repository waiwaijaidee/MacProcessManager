import React from 'react'
import { api, bridgeAvailable } from '../api.js'
import { Panel } from '../components/ui.jsx'
import { IconExternal } from '../components/icons.jsx'

const FB_URL = 'https://fb.com/kroowaiwai'
const LOGO_URL = 'https://waiwai-it.com/images/waiaijaidee-logo2025.png'
const SITE_URL = 'https://waiwai-it.com'

export function DeveloperView() {
  const open = (url) => {
    if (bridgeAvailable) api.app.openExternal(url)
    else window.open(url, '_blank')
  }

  return (
    <div className="developer-view">
      <Panel title="Developer" hint="ผู้พัฒนาแอปพลิเคชันนี้">
        <div className="developer-card">
          <img
            className="developer-card__logo"
            src={LOGO_URL}
            alt="Waiwai Jaidee logo"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <div className="developer-card__info">
            <h2 style={{ margin: '0 0 4px' }}>Waiwai Jaidee</h2>
            <div className="field__hint" style={{ marginBottom: 14 }}>
              ครูไหวโอ๊ย... แอปนี้พัฒนาโดย Waiwai Jaidee 🎓💻
            </div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--primary" onClick={() => open(FB_URL)}>
                <IconExternal size={14} /> Facebook: Waiwai Jaidee
              </button>
              <code className="kbd">fb.com/kroowaiwai</code>
              <button type="button" className="btn" onClick={() => open(SITE_URL)}>
                <IconExternal size={14} /> waiwai-it.com
              </button>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
