import {createApp} from 'vue';
import {Quasar} from 'quasar';
import quasarLang from 'quasar/lang/ja';
// Import icon libraries
import '@quasar/extras/material-icons/material-icons.css';
// Import Quasar css
import 'quasar/src/css/index.sass';
//@ts-expect-error
import Plugin from '@quasar/quasar-ui-qmarkdown/src/QMarkdown.js'
import '@quasar/quasar-ui-qmarkdown/src/QMarkdown.sass'
// Assumes your root component is App.vue
// and placed in same folder as main.js
import App from './App.vue';

import {createI18n} from 'vue-i18n';
import {getLocale} from '@app/preload';
// TypeScript
// import '@mcp-ui/client/ui-resource-renderer.wc.js';
// 以降、<ui-resource-renderer> が使えるようになります

const i18n = createI18n({
  locale: 'ja',
  fallbackLocale: 'en',
  messages: {}
})

const myApp = createApp(App).use(i18n);

myApp.use(Quasar, {
  plugins: {}, // import Quasar plugins and add here
  lang: quasarLang,
}).use(Plugin)//.component('QMarkdown',QMarkdown.QMarkdown)

console.log('getLocale',getLocale);
const loadLocaleMessages = async () => {
  const locale = await getLocale() || 'en'
  // const locale = 'en-US'
  const messages = await import(`./locales/${locale.split('-')[0]}.ts`)
  i18n.global.setLocaleMessage(locale, messages.default)
  i18n.global.locale = locale
}

loadLocaleMessages()
// Assumes you have a <div id="app"></div> in your index.html
myApp.mount('#app');

