<script setup lang="ts">

import {onBeforeUnmount, onMounted, ref} from 'vue';
import {getAvatarConfig, getLocale, getSysConfig, openBrowser, setAvatarConfig, setSysConfig} from '@app/preload';
import {useI18n} from 'vue-i18n';
import {tutorialAvatarSetting} from '../../../common/DefaultSetting.ts';
import {type AvatarSettingMutable} from '../../../common/Def.ts';
import short from 'short-uuid';


const props = defineProps<{
  show: boolean,
}>();

const {t} = useI18n();

const show = ref(true)
// const carousel = ref(false)
const slide = ref(1)

const geminiApiKey = ref('')
const error = ref('')
const serverOn = ref(true)

const wizardScript = [
  '/wiz1.md',
  '/wiz2.md',
  '/wiz31.md',
  '/wiz4.md',
  '/wiz5.md',
]
const tpl = ref<string[]>([])

const registPage = 4
const pageNum = 5

const next = () => {
  switch (slide.value) {
    case 1:
      break
    case 2:
      //  gemini入力ベリファイ
      if (geminiApiKey.value.length === 0) {
        error.value = t('wizard.gemini.required')
        return
      }
      break
    case 5:
      //  推奨設定保存
      saveConfig()
      break
  }
  error.value = ''
  if (slide.value < pageNum) {
    slide.value += 1
  } else {
    show.value = false
  }
}
const exit = () => {
  show.value = false
}
const prev = () => {
  if (slide.value > 1) {
    slide.value -= 1
  }
}

const showWizard = () => {
  return props.show && show.value
}

const saveConfig = async () => {
  const sys = await getSysConfig()
  await setSysConfig({
    ...sys,
    generators:{
      ...sys.generators,
      gemini:{
        ...sys.generators.gemini,
        apiKey: geminiApiKey.value,
        model: 'gemini-2.5-flash',
      }
    },
    websocket:{
      ...sys.websocket,
      useServer: serverOn.value,
    },
  })
  const config:AvatarSettingMutable ={
    ...tutorialAvatarSetting
  };
  //  temp avatarがいて、isTemporallyなら設定を上書きする。isTemporallyはオフにする
  //  相当するものがない場合は新規追加にする
  const currentAvatar = await getAvatarConfig(tutorialAvatarSetting.templateId)
  if (currentAvatar && currentAvatar.isTemporally) {
    //  上書き
    config.templateId = currentAvatar.templateId;
    config.isTemporally = false
  } else {
    //  新規追加
    config.templateId = short.generate();
  }
  try {
    await setAvatarConfig(config.templateId,config)
  } catch (e) {
    console.log(e);
  }
  console.log('saveConfig', config);
  exit();

}


const handleClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  const anchor = target.closest('a') as HTMLAnchorElement | null;

  if (anchor && anchor.href) {
    const href = anchor.href;

    // 外部リンクなら制御
    if (href.startsWith('http')) {
      event.preventDefault();
      console.log('openBrowser', href);
      openBrowser(
        href,
      )
    }
  }
}

const loadLocaleMessages = async () => {
  console.log('start');
  const locale = await getLocale() || 'en'
  // const locale = 'en-US'
  const loc = locale.split('-')[0]
  console.log('loadLocaleMessages', locale, loc);

  tpl.value = await Promise.all(wizardScript.map(async (script) => {
    const f = await fetch(`wiz/${loc}${script}`)
    return await f.text()
  }))
}

onMounted(async () => {
  console.log('wizard');
  document.addEventListener('click', handleClick);
  await loadLocaleMessages();

})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClick);
});

</script>

<template>
  <q-dialog :model-value="showWizard()" >
    <q-card class="q-pa-md bg-amber-4" style="min-width: 900px">
      <q-carousel
        transition-prev="slide-right"
        transition-next="slide-left"
        animated
        v-model="slide"
        control-color="primary"
        height="600px"
        class="shadow-1 rounded-borders bg-black"
      >
      <q-carousel-slide :name="1" class="column no-wrap flex-center">
        <q-card class="text-white bg-black" style="min-width: 800px">
          <q-card-section>
            <div class="text-h3">Avatar Shell</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-markdown :no-blockquote="false">
              {{tpl[0]}}
            </q-markdown>
          </q-card-section>
        </q-card>
      </q-carousel-slide>

      <q-carousel-slide :name="2" class="column no-wrap flex-center">
        <q-card class="text-white bg-black" style="min-width: 800px">
          <q-card-section>
            <div class="text-h6">{{ t('wizard.title2') }}</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-markdown :no-blockquote="false" >
              {{tpl[1]}}
            </q-markdown>
          </q-card-section>
          <q-card-section class="q-mx-lg bg-white text-black shadow-1 rounded-borders">
            {{ t('wizard.gemini.keyLabel') }}
            <q-input v-model="geminiApiKey" :label="t('wizard.gemini.keyLabel')" outlined dense class="q-mb-md" />
            <div class="text-red">{{ error }}</div>
          </q-card-section>
        </q-card>
      </q-carousel-slide>

      <q-carousel-slide :name="3" class="column no-wrap flex-center">
        <q-card class="text-white bg-black" style="min-width: 800px">
          <q-card-section>
            <div class="text-h6">{{ t('wizard.title3') }}</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-markdown :no-blockquote="false" >
              {{tpl[2]}}
            </q-markdown>
          </q-card-section>
          <q-card-section class="q-mx-lg bg-white text-black shadow-1 rounded-borders">
            <q-toggle v-model="serverOn" :label="t('wizard.avatar.serverLabel')" />
          </q-card-section>
        </q-card>
      </q-carousel-slide>
      <q-carousel-slide :name="4" class="column no-wrap flex-center">
        <q-icon name="terrain" color="primary" size="56px" />
        <q-card
          class="text-white bg-black"
          style="min-width: 800px"
        >
          <q-card-section>
            <div class="text-h6">{{ t('wizard.title4') }}</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-markdown :no-blockquote="false" >
              {{tpl[3]}}
            </q-markdown>
          </q-card-section>
        </q-card>
      </q-carousel-slide>
      <q-carousel-slide :name="5" class="column no-wrap flex-center">
        <q-card
          class="text-white bg-black"
          style="min-width: 800px"
        >
          <q-card-section>
            <div class="text-h6">{{ t('wizard.title5') }}</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-markdown :no-blockquote="false" >
              {{tpl[4]}}
            </q-markdown>
          </q-card-section>
        </q-card>
      </q-carousel-slide>
    </q-carousel>
      <div class="row">
        <q-btn class="col-1 q-ma-lg bg-white" @click="exit">{{ t('wizard.buttons.exit') }}</q-btn>
        <q-btn class="col-1 q-ma-lg bg-white" v-if="slide>1 && slide !== 5" @click="prev">{{ t('wizard.buttons.prev') }}</q-btn>
        <q-space/>
        <q-btn class="col-1 q-ma-lg bg-white" @click="next">
          {{ slide == registPage ? t('wizard.buttons.save') :
             slide >= pageNum ? t('wizard.buttons.done') :
             t('wizard.buttons.next') }}
        </q-btn>
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped>

</style>
