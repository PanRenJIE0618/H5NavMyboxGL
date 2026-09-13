import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { initUiTheme } from './lib/uiTheme'
import { initNavPrefs } from './lib/navPrefs'
import { initI18n } from './i18n'
import { initAuth } from './lib/auth'
import { initBootSplash, setBootProgress } from './lib/bootSplash'
import { t } from './i18n'
import { startVersionWatcher } from './lib/appVersion'

initBootSplash()
initI18n()
initAuth()
initUiTheme()
initNavPrefs()
setBootProgress(18, t('boot.starting'))
createApp(App).mount('#app')
startVersionWatcher()
setBootProgress(52, t('boot.map'))

try {
  const brand = document.querySelector('.boot-splash__brand')
  const sub = document.querySelector('.boot-splash__sub')
  if (brand) brand.textContent = t('boot.brand')
  if (sub) sub.textContent = t('boot.sub')
} catch {
  // ignore
}