import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { initUiTheme } from './lib/uiTheme'

initUiTheme()
createApp(App).mount('#app')
