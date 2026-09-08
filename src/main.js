import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { initUiTheme } from './lib/uiTheme'
import { initNavPrefs } from './lib/navPrefs'

initUiTheme()
initNavPrefs()
createApp(App).mount('#app')
