import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { initUiTheme } from './lib/uiTheme'
import { initNavPrefs } from './lib/navPrefs'
import { initI18n } from './i18n'

initI18n()
initUiTheme()
initNavPrefs()
createApp(App).mount('#app')
