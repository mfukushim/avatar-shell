<script setup lang="ts" xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
import {defineAsyncComponent, nextTick, onMounted, ref} from 'vue';
import HeadPanel from './components/HeadPanel.vue';
import InputPanel from './components/InputPanel.vue';
import {
  addExtTalkContext, answerMainAlert, callMcpTool, doAskAi,
  getAvatarConfigList,
  getCurrentAvatarList, getMcpServerInfos,
  getMediaUrl, getSysConfig, getUserName,
  onInitAvatar, onMainAlert,
  onTestIdle,
  onUpdateLlm, readDocMedia,
  sendSocket,
} from '@app/preload';
import {type AlertTask, AsMessage, type McpInfo} from '../../common/Def.ts';
import TalkPanel from './components/TalkPanel.vue';
import type {QDrawer} from 'quasar';
// @ts-ignore
import expand_template from 'expand-template';

const expand = expand_template();
const Wizard = defineAsyncComponent(() =>
  import('./components/Wizard.vue'),
);
import MenuPanel from './components/MenuPanel.vue';
import McpUiWapper from './components/McpUiWapper.vue';
import short from 'short-uuid';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {McpUiMessageRequest} from '@modelcontextprotocol/ext-apps/app-bridge';

const showWizard = ref(false);
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
      // console.log('renderer init avatar', name);
      avatarName.value = name;
      userName.value = getUserName();
      disableInput.value = false;
      showWizard.value = needWizard;
      await resetAvatarList();
      mcpServers.value = await getMcpServerInfos();
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
    rDrawerHeight.value = (rDrawerRef.value.$refs.content as HTMLElement).getBoundingClientRect().height || 500;
  }
});

const resetAvatarList = async () => {
  const list = await getAvatarConfigList();
  avatarTemplateList.value = list.map(e => ({value: e.templateId, label: e.name}));
};


const timeline = ref<AsMessage[]>([]);
const oneMes = ref<string | undefined>(undefined);
const forceUpdate = ref(false); //  TODO timelineの更新をうまく検出出来ないの暫定対策。。
const alertTasks = ref<AlertTask[]>([]);
const showAsAlert = ref(false);

const recentSoundId = ref('');

const calledMcpUiGenerator = ref<string>('');
const calledMcpUiName = ref('');
const calledMcpUiCallId = ref('');
// const htmlResourceJson = ref<string | undefined>(undefined);
const toolResourceUri = ref<string | undefined>(undefined);
const toolResourceHtml = ref<string>('');
const toolName = ref<string>('');
const toolInput = ref<any>({});
const toolResult = ref<CallToolResult>({content:[]});

const clickAlert = async (task: AlertTask, btn: string) => {
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
  const mcpUiResource = tl.filter((t: AsMessage) =>
    (t.content?.mediaUrl) && t.content?.mediaUrl.startsWith('ui:')).slice(-1); //  todo 現状は最後の一つのui: グループ化は必要?
  //  今のところmcpUiを優先
  const sysConfig = await getSysConfig();
  if (mcpUiResource && mcpUiResource.length > 0 && sysConfig.experimental.mcpUi) {
    // console.log('setTimeline mcpUiResource',mcpUiResource);
    const ui = mcpUiResource[0];
    const url = ui.content?.mediaUrl;
    if (url) {
      toolName.value = ui.content?.toolReq?.name || '';
      toolResourceUri.value = url;
      toolInput.value = ui.content?.toolReq || {};
      toolResult.value = ui.content?.toolRes || {};
      const text = await readDocMedia(url);
      toolResourceHtml.value = text;
/*
      calledMcpUiName.value = ui.content?.toolName || ''
      htmlResourceJson.value = JSON.stringify({
        uri: url,
        mimeType: 'text/html',
        text: text,
      });
*/
      // console.log('mcpUiResource:',ui.content);
      if(ui.content?.generator && ui.content?.nextGeneratorId && ui.content.generator === 'mcp'){
        calledMcpUiGenerator.value = ui.content.nextGeneratorId;
        calledMcpUiCallId.value = ui.content.innerId || ''
      }
    }
  } else {
    calledMcpUiName.value = ''
    toolResourceUri.value = undefined;
    toolResourceHtml.value = ''
    // htmlResourceJson.value = undefined;
    if (oneImage.length > 0) {
      await setAsMessageImage(oneImage[0]);
    } else {
      mainImage.value = '';
    }
  }
  timeline.value = tl;
  forceUpdate.value = !forceUpdate.value;
};

const setImage = async (url: string, mime: string) => {
  mainImage.value = await getMediaUrl(mime, url);
};
const setSound = async (url: string, mime: string) => {
  const voice = await getMediaUrl(mime, url);
  await playSound(voice);
};

const volumeVal = ref(1.0);
const showImageSelect = ref(false);

const setVolume = async (volume: number) => {
  const soundPlayer = document.getElementById('audioPlayer') as HTMLAudioElement;
  volumeVal.value = volume;
  if (soundPlayer) {
    soundPlayer.volume = volumeVal.value;
  }
};

const runningMarks = ref<string[][]>([]);

const mergeTimeline = async (add: AsMessage[]) => {
  const tl = timeline.value;
  add.forEach(m => {
    if (m.content?.subCommand === 'deleteTextParts') {
      oneMes.value = undefined;
    } else if (m.content?.subCommand === 'addTextParts') {
      oneMes.value = (oneMes.value || '') + m.content?.textParts?.join('');
    } else if (m.content?.subCommand === 'addRunning' && m.content?.innerId) {
      runningMarks.value.push([m.content?.innerId, m.content.text || '']);
    } else if (m.content?.subCommand === 'delRunning' && m.content?.innerId) {
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
  if (mes.content.mediaUrl && mes.content.mimeType) {
    //  データ更新は逐次起きるので、直近の再生idと同じなら抑止する
    if (recentSoundId.value === mes.id) {
      return;
    }
    recentSoundId.value = mes.id;
    const sound = await getMediaUrl(mes.content.mimeType, mes.content.mediaUrl);
    await playSound(sound);
  }
};

const playSound = async (sound: string) => {
  const soundPlayer = document.getElementById('audioPlayer') as HTMLAudioElement;
  if (soundPlayer) {
    soundPlayer.pause();
    soundPlayer.currentTime = 0;
  }
  soundPlayer.volume = volumeVal.value;
  soundPlayer.src = sound;
  soundPlayer.play().then(() => {
    console.log('play voice end:');
  }).catch(() => {
      console.log('play voice error:');
    },
  ).finally(() => {
    recentSoundId.value = '';
  });
};

const saveImage = async () => {
  const blob = await (await fetch(mainImage.value)).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'avatar.png';
  a.click();
  URL.revokeObjectURL(url);
};

const handleUIAction = async (event: CustomEvent) => {
  console.log('Action2:', event.detail);
  const sysConfig = await getSysConfig();
  if (!sysConfig.experimental.mcpUi) {
    return
  }
  if (event.detail.type === 'tool') {
    console.log('tool:',event.detail.payload);
    //  TODO toolを直起動にする
    const names = calledMcpUiName.value.split('_')
    const toolName = names.length > 0 && event.detail?.payload?.toolName ? names[0] +'_'+event.detail.payload.toolName : ''
    console.log('toolName',calledMcpUiName.value,names,event.detail?.payload?.params, toolName,calledMcpUiGenerator.value);
    const id = short.generate()
    try {
      await callMcpTool({
        callId: id,
        // callId: calledMcpUiCallId.value, //  TODO この扱いでよいか確認要
        name: toolName,
        input: event.detail?.payload?.params || {},
      },calledMcpUiGenerator.value)
    } catch (e) {
      console.log('callMcpTool error',e);
    }
    //  TODO ユーザがツールを使ったことを通知する必要はあるか?
    //  TODO ツールがMCP-UIで直起動されるときは、それをfunc callをAIはしていないのだがから、func call のレスポンスもAIは知らない。
    //  TODO つまりツールを起動はしているがこれの結果はuserのテキスト入力として扱われなければならない。。。
    //   TODO つまりselect-userはAIにとっては発行されたことがないのだから、そのツールの実行結果はuserのテキスト入力のように扱わなければならない。。
    // const mes = AsMessage.makeMessage({from: getUserName(), text: 'user selected'}, 'talk', 'human', 'surface')
    // await doAskAi([mes])
    // await sendMessageIn([mes]);
  } else if(event.detail.type === 'intent') {
    console.log('intent:',event.detail.payload);
    let inText = JSON.stringify(event.detail.payload);
    if (sysConfig.experimental.mcpUiTemplate) {
      inText = expand(sysConfig.experimental.mcpUiTemplate, {
        body: inText,
      });
    }
    console.log('inText', inText);
    const mes = AsMessage.makeMessage({from: getUserName(), text: inText,toolRes:event.detail.payload}, 'talk', 'human', 'inner')
    await doAskAi([mes])
    await sendMessageIn([mes]);
  } else if(event.detail.type === 'notify') {
    console.log('notify:',event.detail.payload);
    let inText = event.detail?.payload?.message
    const mes = AsMessage.makeMessage({from: getUserName(), text: inText}, 'talk', 'human', 'inner')
    await doAskAi([mes])
    await sendMessageIn([mes]);
  }
};

const appendText = ref('');
const handleAppendInput = async (mes: McpUiMessageRequest["params"]) => {
  const s: string = mes.content.filter((item) => item.type === 'text').map((item) => item.text).join('').trim();
  if (s.length > 0) {
    appendText.value = s;
  }
}

</script>

<template>
  <q-layout view="hHh lpr fFf " @resize="resize">

    <HeadPanel @toggle-drawer="toggleLeftDrawer"
               @change-doc="mes =>setTimeline(mes)"
               @change-image="setImage"
               @select-sound="setSound"
               @set-volume="setVolume"
               @toggle-image-select="showImageSelect=!showImageSelect"
               :show-image-select="showImageSelect"
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
                 @toggle-image-select="showImageSelect=!showImageSelect"
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
                 @clear-running-marks="runningMarks=[]"
                 :force-update="forceUpdate"
                 :avatarName="avatarName"
                 :user-name="userName"
                 :running-marks="runningMarks"
                 :hide-control="cyclicDrawerWidth[drawerPos] < 0.3"></TalkPanel>
    </q-drawer>

    <q-page-container class="wave-background ">
      <mcp-ui-wapper v-if="toolResourceUri"
                     :tool-resource-uri="toolResourceUri"
                     :tool-name="toolName"
                     :tool-input="toolInput"
                     :tool-result="toolResult"
                     :html="toolResourceHtml"
                     :gen-id="calledMcpUiGenerator"
                     @append-input="handleAppendInput"
                     @on-ui-action="handleUIAction" />
      <div>
        <div class="wave" v-if="!toolResourceUri"></div>
        <div class="q-pa-sm">

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
        </div>
      </div>
      <audio id="audioPlayer" src="" hidden></audio>
    </q-page-container>

    <q-footer elevated>
      <div class="row ">
        <q-btn dense class="bg-blue-grey-9 q-pa-md" @click="toggleLeftDrawer" icon="menu" />
        <InputPanel class="col-grow"
                    @open-menu="toggleLeftDrawer"
                    @sent="mes => sendMessageIn(mes)"
                    :mcp-servers="mcpServers"
                    :append-text="appendText"
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
    <wizard :show="showWizard" />
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
