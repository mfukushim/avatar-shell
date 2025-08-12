<script setup lang="ts" xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
import {computed, defineAsyncComponent, nextTick, onMounted, ref} from 'vue';
import HeadPanel from './components/HeadPanel.vue';
import InputPanel from './components/InputPanel.vue';
import {
  addExtTalkContext, answerMainAlert,
  getAvatarConfigList,
  getCurrentAvatarList, getMcpServerInfos,
  getMediaUrl, getUserName,
  onInitAvatar, onMainAlert,
  onTestIdle,
  onUpdateLlm,
  sendSocket,
} from '@app/preload';
import {type AlertTask, type AsMessage, type McpInfo} from '../../common/Def.ts';
import TalkPanel from './components/TalkPanel.vue';
// const TalkPanel = defineAsyncComponent(() =>
//   import('./components/TalkPanel.vue')
// )
import type {QDrawer} from 'quasar';
// import Wizard from './components/Wizard.vue';
const Wizard = defineAsyncComponent(() =>
  import('./components/Wizard.vue'),
);
import MenuPanel from './components/MenuPanel.vue';
// const MenuPanel = defineAsyncComponent(() =>
//   import('./components/MenuPanel.vue')
// )
const showWizaed = ref(false);
const leftDrawerOpen = ref(false);
const toggleLeftDrawer = () => {
  leftDrawerOpen.value = !leftDrawerOpen.value;
};
const rightDrawerOpen = ref(true); //  TODO 仮
const rightDrawerWidth = ref(400);
const drawerPos = ref(0);
const cyclicDrawerWidth = [0.5, 0.9, 0, 0.1];

const toggleRightDrawer = () => {
  drawerPos.value = (drawerPos.value + 1) % cyclicDrawerWidth.length;
  const widthPos = cyclicDrawerWidth[drawerPos.value];
  if (widthPos === 0) {
    rightDrawerOpen.value = false;
    return;
  }
  rightDrawerWidth.value = layoutWidth.value * widthPos;
  rightDrawerOpen.value = true;
};

// const slide = ref('style');
const avatarTemplateList = ref<{label: string, value: string}[]>([]);
const currentAvatarList = ref<{label: string, value: string}[]>([]);
const mcpServers = ref<McpInfo[]>([]);

const disableInput = ref(true);
const avatarName = ref('');
const userName = ref('');
const rDrawerRef = ref<QDrawer | null>(null);
const rDrawerHeight = ref<number>(500);
const layoutWidth = ref(0);


onMounted(async () => {
  onUpdateLlm(async (bag: AsMessage[]) => {
    return await mergeTimeline(bag);
  });
  onInitAvatar(async (name, needWizard) => {
    //  クライアントの初期化完了
    console.log('renderer init avatar', name);
    avatarName.value = name;
    userName.value = getUserName();
    disableInput.value = false;
    showWizaed.value = needWizard;
    await resetAvatarList();
    mcpServers.value = await getMcpServerInfos()
  },
    async (bag: AsMessage[]) => {
    //  外部からのsocket AsMessage受信
    await mergeTimeline(bag);
    await addExtTalkContext(bag);
  });
  onMainAlert((alert: AlertTask) => {
    alertTasks.value.push(alert);
    showAsAlert.value = alertTasks.value.length > 0;
  });
  onTestIdle((mes) => {
    console.log('renderer onTestIdle', mes);
  });

  const list2 = await getCurrentAvatarList();
  currentAvatarList.value = list2.map(value => ({value: value.id, label: value.name, templateId: value.templateId}));

  await nextTick();
  if (rDrawerRef.value) {
    console.log('mounted: box height =', (rDrawerRef.value.$refs.content as HTMLElement).getBoundingClientRect().height);
    rDrawerHeight.value = (rDrawerRef.value.$refs.content as HTMLElement).getBoundingClientRect().height || 500;
  }
  // カスタムイベントの購読は addEventListener を推奨
  // （HTML テンプレート上の @onUIAction は属性名が小文字化されて取りにくいため）
  rendererRef.value?.addEventListener('onUIAction', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    console.log('UI Action:', detail);
    // ここでツール呼び出し等の処理を行う
  });

});

const resetAvatarList = async () => {
  const list = await getAvatarConfigList();
  avatarTemplateList.value = list.map(e => ({value: e.templateId, label: e.name}));
}


const timeline = ref<AsMessage[]>([]);
const oneMes = ref<string | undefined>(undefined);
const forceUpdate = ref(false); //  TODO timelineの更新をうまく検出出来ないの暫定対策。。
const alertTasks = ref<AlertTask[]>([]);
const showAsAlert = ref(false);

const recentSoundId = ref('');

const clickAlert = async (task: AlertTask, btn: string) => {
  console.log('clickAlert:', task, btn);
  alertTasks.value = alertTasks.value.filter(t => t.id !== task.id);
  if (alertTasks.value.length === 0) {
    showAsAlert.value = false;
  }
  await answerMainAlert(task.id, task.replyTo, btn);
};

const setTimeline = async (tl0: AsMessage[]) => {
  const tl = tl0.sort((a, b) => a.tick - b.tick);
  const oneImage = tl.filter((t: AsMessage) =>
    (t.content?.mediaUrl) && t.content?.mimeType && t.content?.mimeType?.startsWith('image/')).slice(-1);
/*
  const oneVoice = tl.filter((t: AsMessage) =>
    (t.content?.mediaUrl) && t.content?.mimeType && t.content?.mimeType?.startsWith('audio/')).slice(-1);
  if (!excludeSound && oneVoice && oneVoice.length > 0 && oneVoice[0].content?.mediaUrl) {
    await playVoice(oneVoice[0]);
  }
*/
  if (oneImage.length > 0) {
    await setAsMessageImage(oneImage[0]);
  } else {
    mainImage.value = '';
  }
  timeline.value = tl;
  forceUpdate.value = !forceUpdate.value;
};

const setImage = async (url: string, mime: string) => {
  mainImage.value = await getMediaUrl(mime, url);
};
const setSound = async (url: string, mime: string) => {
  const voice = await getMediaUrl(mime, url);
  // console.log('setSound:', voice.slice(0, 200));
  await playSound(voice);
};

const volumeVal = ref(1.0);

const setVolume = async (volume: number) => {
  const soundPlayer = document.getElementById("audioPlayer") as HTMLAudioElement;
  volumeVal.value = volume;
  if(soundPlayer) {
    soundPlayer.volume = volumeVal.value;
  }
}

const runningMarks = ref<string[][]>([]);

const mergeTimeline = async (add: AsMessage[]) => {
  const tl = timeline.value;
  add.forEach(m => {
    if (m.content?.subCommand === 'deleteTextParts') {
      oneMes.value = undefined;
    } else if (m.content?.subCommand === 'addTextParts') {
      // console.log('addTextParts:', m.content);
      oneMes.value = (oneMes.value || '') + m.content?.textParts?.join('');
    } else if (m.content?.subCommand === 'addRunning' && m.content?.innerId) {
      console.log('addRunning:', m.content);
      runningMarks.value.push([m.content?.innerId,m.content.text || '']);
    } else if (m.content?.subCommand === 'delRunning' && m.content?.innerId) {
      console.log('delRunning:', m.content);
      runningMarks.value = runningMarks.value.filter(value => value[0] !== m.content.innerId);
    } else {
      const index = tl.findIndex(t => t && m && t.id === m.id);
      if (index === -1) {
        tl.push(m);
      }
    }
  });
  const oneVoice = add.filter((t: AsMessage) =>
    (t.content?.mediaUrl) && t.content?.mimeType && t.content?.mimeType?.startsWith('audio/')).slice(-1);
  if (oneVoice && oneVoice.length > 0 && oneVoice[0].content?.mediaUrl) {
    await playVoice(oneVoice[0]);
  }

  await setTimeline(tl);
};

const sendMessageIn = async (mes: AsMessage[]) => {
  await mergeTimeline(mes);
  await sendSocket(mes);
};


const mainImage = ref('blank2.png');

const resize = async (size: {width: number, height: number}) => {
  await nextTick();
  if (rDrawerRef.value) {
    console.log('resizedrawer: box height =', (rDrawerRef.value.$refs.content as HTMLElement).getBoundingClientRect().height);
    rDrawerHeight.value = (rDrawerRef.value.$refs.content as HTMLElement).getBoundingClientRect().height || 500;
  }
  layoutWidth.value = size.width;
};

const setAsMessageImage = async (mes: AsMessage) => {
  if (mes.content.mediaUrl && mes.content.mimeType) {
    mainImage.value = await getMediaUrl(mes.content.mimeType, mes.content.mediaUrl);
  }
};

const playVoice = async (mes: AsMessage) => {
  // console.log('playVoice:', mes);
  if (mes.content.mediaUrl && mes.content.mimeType) {
    //  データ更新は逐次起きるので、直近の再生idと同じなら抑止する
    if (recentSoundId.value === mes.id) {
      return;
    }
    recentSoundId.value = mes.id;
    // console.log('sound id:', mes.id);
    const sound = await getMediaUrl(mes.content.mimeType, mes.content.mediaUrl);
    // console.log('play voice:', sound.slice(0, 200));
    await playSound(sound);
  }
};

const playSound = async (sound: string) => {
  const soundPlayer = document.getElementById("audioPlayer") as HTMLAudioElement;
  if (soundPlayer) {
    soundPlayer.pause();
    soundPlayer.currentTime = 0;
  }
  soundPlayer.volume = volumeVal.value;
  soundPlayer.src = sound;
  soundPlayer.play().then(value => {
    console.log('play voice end:', value);
  }).catch(reason => {
      console.log('play voice error:', reason);
    },
  ).finally(() => {
    recentSoundId.value = ''
  });
}

const saveImage = async () => {
  const blob = await (await fetch(mainImage.value)).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'avatar.png';
  a.click();
  URL.revokeObjectURL(url);
};

const rendererRef = ref<HTMLElement | null>(null);

// Web Component は props を「文字列」で受け取るため、JSON.stringify した文字列を用意
const htmlResourceJson = computed(() =>
  JSON.stringify({
    uri: 'ui://example/hello',
    mimeType: 'text/html',
    text: '<h2>Hello from Vue + Web Component!</h2>',
  }),
);


</script>

<template>
  <q-layout view="hHh lpr fFf " @resize="resize">

    <HeadPanel @toggle-drawer="toggleLeftDrawer"
               @change-doc="mes =>setTimeline(mes)"
               @change-image="setImage"
               @select-sound="setSound"
               @set-volume="setVolume"
               :volume="volumeVal"
               :name="avatarName" />
    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      :width="50"
      :breakpoint="700"
      elevated
      overlay
      mini-to-overlay
      :class="disableInput ? 'bg-blue-2 text-grey' :'bg-blue-2'"
    >
      <MenuPanel :disable-input="disableInput"
                 :avatar-template-list="avatarTemplateList"
                 :avatar-name="avatarName"
                 :user-name="userName"
                 @reset-avatar-list="resetAvatarList"
      />
    </q-drawer>
    <!--    show-if-above overlay :mini="!rightDrawerOpen || miniState"               overlay
    -->
    <q-drawer
      ref="rDrawerRef"

      v-model="rightDrawerOpen"
      :breakpoint="0"
      side="right"
      :width="rightDrawerWidth"
      style="display: flex;flex-direction: column-reverse;overflow-y: auto;"
      class="bg-grey-2 no-scroll">
      <TalkPanel :timeline="timeline"
                 :one-mes="oneMes"
                 :area-height="rDrawerHeight"
                 @select="setAsMessageImage"
                 @play-voice="playVoice"
                 :force-update="forceUpdate"
                 :avatarName="avatarName"
                 :user-name="userName"
                 :running-marks="runningMarks"
                 :hide-control="cyclicDrawerWidth[drawerPos] < 0.3"></TalkPanel>
    </q-drawer>

    <q-page-container class="wave-background ">
<!--
      <div>
-->
        <div class="wave"></div>
        <div class="q-pa-sm">
          <ui-resource-renderer
            ref="rendererRef"
            :resource="htmlResourceJson"
            style="display:block;width:100%;height:400px;border:2px solid green;background-color: white;"
          ></ui-resource-renderer>

          <q-img
            :src="mainImage"
            error-src="./assets/blank.png"
          >
            <q-popup-proxy>
              <q-banner @click="saveImage" dense>
                <template v-slot:avatar>
                  <q-icon name="save" color="primary" />
                </template>
                Save image
              </q-banner>
            </q-popup-proxy>
            <template v-slot:loading>
              <div class="text-subtitle1 text-white">
                Loading...
              </div>
            </template>
            <template v-slot:error>
              <div class="absolute-full flex">
                Error encountered
              </div>
            </template>
          </q-img>
          <!--
                  <q-carousel
                    v-model="slide"
                    transition-prev="jump-right"
                    transition-next="jump-left"
                    swipeable
                    animated
                    control-color="white"
                    prev-icon="arrow_left"
                    next-icon="arrow_right"
                    navigation-icon="radio_button_unchecked"
                    navigation
                    arrows
                    height="1200px"
                    vertical
                    class="bg-transparent"
                  >
                    <q-carousel-slide name="style" class="column no-wrap ">
                      <q-img
                        :src="mainImage"
                        error-src="./assets/blank.png"
                      >
                        <q-popup-proxy>
                          <q-banner @click="saveImage" dense>
                            <template v-slot:avatar>
                              <q-icon name="save" color="primary" />
                            </template>
                            Save image
                          </q-banner>
                        </q-popup-proxy>
                        <template v-slot:loading>
                          <div class="text-subtitle1 text-white">
                            Loading...
                          </div>
                        </template>
                        <template v-slot:error>
                          <div class="absolute-full flex">
                            Error encountered
                          </div>
                        </template>
                      </q-img>
                    </q-carousel-slide>
                    <q-carousel-slide name="tv" class="column no-wrap  bg-white">
                      <q-icon name="live_tv" size="56px" color="blue" />
                      <div class="q-mt-md text-center text-white">
                      </div>
                    </q-carousel-slide>
                  </q-carousel>
          -->
        </div>
<!--
      </div>
-->
      <audio id="audioPlayer" src="" hidden></audio>
    </q-page-container>

    <q-footer elevated>
      <div class="row ">
        <q-btn dense class="bg-blue-grey-9 q-pa-md" @click="toggleLeftDrawer" icon="menu" />
        <InputPanel class="col-grow"
                    @open-menu="toggleLeftDrawer"
                    @sent="mes => sendMessageIn(mes)"
                    :mcp-servers="mcpServers"
                    :disable-input="disableInput" />
        <q-btn dense class="bg-blue-grey-9 q-pa-md" @click="toggleRightDrawer" icon="chat" />
      </div>
    </q-footer>
    <q-dialog v-model="showAsAlert" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Alert</div>
        </q-card-section>
        <div v-for="ask in alertTasks" :key="ask.message">
          <q-card-section class="q-pt-none">
            {{ ask.message }}
          </q-card-section>
          <q-card-actions align="right">
            <q-btn flat
                   v-for="btn in ask.select"
                   :key="btn"
                   :label="btn"
                   color="primary"
                   @click="clickAlert(ask,btn)" />
          </q-card-actions>
        </div>
      </q-card>
    </q-dialog>
    <wizard :show="showWizaed" />
  </q-layout>

</template>

<style scoped>
body, html {
  height: 100%;
  margin: 0;
  overflow: hidden;
  background-color: black; /* 背景色を黒に設定 */
}

.wave-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: black; /* 背景色を黒に設定 */
  overflow: hidden;
}

/* 灰色のグラデーション帯 */
.wave {
  position: absolute;
  width: 100%;
  height: 30px; /* グラデーション帯の高さ */
  background: linear-gradient(to left, #111, #444, #111); /* 灰色のグラデーション */
  background-size: 100% 100%; /* グラデーションの繰り返しを滑らかに */
  animation: waveMove 30s linear infinite; /* アニメーションを設定 */
}

/* グラデーション帯が下から上に動く */
@keyframes waveMove {
  0% {
    bottom: -100px; /* 最初は画面の下に */
  }
  100% {
    bottom: 100%; /* 最後は画面の上に移動 */
  }
}
</style>
