<script setup lang="ts">

import {onBeforeUnmount, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {getAvatarConfigList, getSysConfig, getVersion, openBrowser, setSysConfig} from '@app/preload';
import {type McpServerDef, type SysConfigMutable, SysConfigSchema} from '../../../common/Def.ts';
import {Either, ParseResult, Schema} from 'effect';

import tpl from '../assets/licenseInfo.md?raw';
import {defaultSysSetting} from '../../../common/DefaultSetting.ts';

const show = ref(false);

const tabSelect = ref('general');
const tabGen = ref('openAi');
const tabMcp = ref('');

const splitterModel = ref(17);

const avatarList = ref<{label: string, value: string}[]>([]);


const edit = ref<SysConfigMutable>(defaultSysSetting);
const mcpConfig = ref<{id: string, body: string}[]>([]);

const websocketPort = ref<string | undefined>(undefined);
const saving = ref(false);

const {t} = useI18n();

const errorMes = ref('');
const version = ref('');


const doOpen = async () => {
  errorMes.value = '';
  const config = await getSysConfig();
  console.log(config);
  edit.value = {...config} as SysConfigMutable;  //  TODO
  mcpConfig.value = getMcpServerList();
  const list = await getAvatarConfigList();
  avatarList.value = list.map(e => ({value: e.templateId, label: e.name}));
  //  websocket
  websocketPort.value = edit.value.websocket.serverPort ? edit.value.websocket.serverPort.toString() : undefined;

  version.value = await getVersion();
  //  TODO
  // defaultAvatar.value =list.find(value => value.id === config.defaultAvatar.id)

  show.value = true;
};

const saveAndClose = async () => {
  saving.value = true;
  try {
    //  書式以外のバリデーション
    //  一般 デフォルトアバターが選ばれていること 選ばれていなければ最初を強制選択
    if (edit.value.defaultAvatarId === undefined && avatarList.value.length > 0) {
      edit.value.defaultAvatarId = avatarList.value[0].value;
    }
    //  コンテキストジェネレーター
    //    個々のジェネレータ/LLMについて 部分記述があれば api tokenとかの必須設定がすべて設定されていること、すべて空欄なら展開しないこと
    let cnt = 0;
    if (edit.value.generators.openAiText.apiKey) cnt++;
    if (edit.value.generators.openAiText.model) cnt++;
    if (cnt === 1) {
      errorMes.value = 'GPT Text setting is not valid';
      return;
    }
    cnt = 0;
    if (edit.value.generators.openAiImage.model) cnt++;
    if (!edit.value.generators.openAiText.apiKey) {
      if (cnt !== 0) {
        errorMes.value = 'GPT image setting is not valid';
        return;
      }
    }
    cnt = 0;
    if (edit.value.generators.openAiVoice.model) cnt++;
    if (edit.value.generators.openAiVoice.voice) cnt++;
    if (edit.value.generators.openAiText.apiKey) {
      if (cnt === 1) {
        errorMes.value = 'GPT voice setting is not valid';
        return;
      }
    } else {
      if (cnt !== 0) {
        errorMes.value = 'GPT voice setting is not valid';
        return;
      }
    }
    cnt = 0;
    if (edit.value.generators.anthropic.apiKey) cnt++;
    if (edit.value.generators.anthropic.model) cnt++;
    if (cnt === 1) {
      errorMes.value = 'Claude setting is not valid';
      return;
    }
    cnt = 0;
    if (edit.value.generators.gemini.apiKey) cnt++;
    if (edit.value.generators.gemini.model) cnt++;
    if (cnt === 1) {
      errorMes.value = 'Gemini setting is not valid';
      return;
    }
    cnt = 0;
    if (edit.value.generators.geminiImage.model) cnt++;
    if (!edit.value.generators.gemini.apiKey) {
      if (cnt !== 0) {
        errorMes.value = 'Gemini Image setting is not valid';
        return;
      }
    }
    cnt = 0;
    if (edit.value.generators.geminiVoice.model) cnt++;
    if (edit.value.generators.geminiVoice.voice) cnt++;
    if (edit.value.generators.gemini.apiKey) {
      if (cnt === 1) {
        errorMes.value = 'Gemini Voice setting is not valid';
        return;
      }
    } else {
      if (cnt !== 0) {
        errorMes.value = 'Gemini Voice setting is not valid';
        return;
      }
    }

    //  mcp
    //    mcp idが重複しないこと、設定記述があればjson書式であること、一部設定値があれば両方の値があること、すべて空欄なら展開しないこと
    //  mcp設定バリデート/設定
    const idList = mcpConfig.value.map(v => v.id);
    const idSet = new Set(idList);
    if (idSet.size !== idList.length) {
      errorMes.value = 'mcp id is not unique';
      return;
    }
    const mcpOut: Record<string, McpServerDef> = {};
    mcpConfig.value.forEach(mcp => {
      if (mcp.id && mcp.id.length > 0 && mcp.body && mcp.body.length > 0) {
        try {
          mcpOut[mcp.id] = JSON.parse(mcp.body);
        } catch (e) {
          errorMes.value = 'mcp setting is not valid';
          return;
        }
      }
    });
    // console.log('mcp:', mcpOut);
    edit.value.mcpServers = mcpOut;
    //  websocket

    try {
      edit.value.websocket.serverPort = websocketPort.value ? Number.parseInt(websocketPort.value) : undefined;
    } catch (e) {
      edit.value.websocket.serverPort = undefined;
    }
    console.log(
      'edit:',
      JSON.stringify(edit.value),
    );
    const setting = Schema.decodeUnknownEither(SysConfigSchema)(edit.value);
    if (Either.isRight(setting)) {
      console.log('edit:', JSON.stringify(setting.right));
      await setSysConfig(setting.right);
      show.value = false;
      return;
    }
    const e = ParseResult.ArrayFormatter.formatErrorSync(setting.left);
    errorMes.value = e.map(e => `${e.path.join(' > ')} : ${e.message}`).join(', ');
    //  TODO エラー時にLLMと音声読み上げが有効ならローカル言語化と音声読み上げを行う
    console.log(e);
  } finally {
    saving.value = false;
  }
};

const getMcpServerList = () => {
  return (Object.entries(edit.value.mcpServers) as [string, McpServerDef][])
    .map(v => {
        return {id: v[0], body: JSON.stringify(v[1], null, 2)};
      },
    );
};

const addMcp = () => {
  let count = 1;
  let id = `mcp${mcpConfig.value.length + count}`;
  while (mcpConfig.value.find(v => v.id === id)) {
    count++;
    id = `mcp${mcpConfig.value.length + count}`;
  }
  const items = {id: id, body: '{}'};
  mcpConfig.value.push(items);
  tabMcp.value = id;
  // tabMcp.value = id
};
const deleteMcp = (id: string) => {
  mcpConfig.value = mcpConfig.value.filter(v => v.id !== id);
};

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
      );
    }
  }
};

onMounted(async () => {
  document.addEventListener('click', handleClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClick);
});


</script>

<template>
  <q-icon name="settings" size="30px" class="q-pa-sm" @click="doOpen">
    <q-dialog v-model="show" full-width persistent>
      <q-card style="width: 1000px;min-height: 600px;">
        <q-card-section>
          <div class="text-h6">{{ t('systemSetting') }}</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <div>
            <q-splitter
              v-model="splitterModel"
              style="height: 500px;"
            >

              <template v-slot:before>
                <q-tabs
                  v-model="tabSelect"
                  vertical
                  dense
                >
                  <q-tab name="general" icon="face" :label="t('general')" />
                  <q-tab name="ai"  icon="smart_toy" :label="t('contextGenerator')" />
                  <q-tab name="mcp" icon="extension" :label="t('mcpSettings')" />
                  <q-tab name="websocket" icon="rss_feed" :label="t('avatarCommunication')" />
                  <q-tab name="license" icon="info_outline" :label="t('license')" />
                </q-tabs>
              </template>

              <template v-slot:after>
                <q-tab-panels
                  v-model="tabSelect"
                  animated
                  swipeable
                  vertical
                  transition-prev="jump-up"
                  transition-next="jump-up"
                >
                  <q-tab-panel name="general">
                    <div class="text-h6 q-mb-md">{{ t('generalSettings') }}</div>
                    <q-card>
                      <q-card-section>
                        <q-select v-model="edit.defaultAvatarId"
                                  :options="avatarList"
                                  :label="t('defaultAvatar')"
                                  emit-value
                                  map-options />
                      </q-card-section>
                    </q-card>
                  </q-tab-panel>

                  <q-tab-panel name="ai">
                    <div class="text-h6 q-mb-md">{{ t('contextGeneratorCommonSettings') }}</div>
                    <div class="text-body2 q-ma-md">{{ t('generatorCommonSettingsDescription') }}</div>
                    <q-tabs
                      v-model="tabGen"
                      no-caps
                      class="bg-orange text-white shadow-2"
                    >
                      <q-tab name="openAi" label="GPT">
                      </q-tab>
                      <q-tab name="anthropic" label="Claude">
                      </q-tab>
                      <q-tab name="google" label="Gemini">
                      </q-tab>
<!--
                      <q-tab name="voiceVox" label="VoiceVox">
                      </q-tab>
-->
                    </q-tabs>
                    <q-separator />

                    <q-tab-panels v-model="tabGen" animated>
                      <q-tab-panel name="openAi">
                        <q-card>
                          <q-card-section>
                            <q-input v-model="edit.generators.openAiText.apiKey"
                                     type="text"
                                     placeholder="sk-"
                                     :label="t('apiKey')" />
                            <q-input v-model="edit.generators.openAiText.model"
                                     type="text"
                                     placeholder="gpt-4.1-mini"
                                     :label="t('textModel')" />
                          </q-card-section>
                          <q-card-section>
                            <q-input v-model="edit.generators.openAiImage.model"
                                     type="text"
                                     placeholder="gpt-4.1-mini"
                                     :label="t('imageModel')" />
                            <div class="q-px-md text-caption">{{t('openaiImageNotice')}}</div>
                          </q-card-section>
                          <q-card-section>
                            <q-input v-model="edit.generators.openAiVoice.model"
                                     type="text"
                                     placeholder="gpt-4o-audio-preview"
                                     :label="t('voiceModel')" />
                            <q-input v-model="edit.generators.openAiVoice.voice" type="text" placeholder="alloy" :label="t('voice')" />
                          </q-card-section>
                        </q-card>
                      </q-tab-panel>
                      <q-tab-panel name="anthropic">
                        <q-card>
                          <q-card-section>
                            <q-input v-model="edit.generators.anthropic.apiKey"
                                     type="text"
                                     placeholder="sk-"
                                     :label="t('apiKey')" />
                            <q-input v-model="edit.generators.anthropic.model"
                                     type="text"
                                     placeholder="claude-3-7-sonnet-latest"
                                     :label="t('textModel')" />
                          </q-card-section>
                        </q-card>
                      </q-tab-panel>
                      <q-tab-panel name="google">
                        <q-card>
                          <q-card-section>
                            <q-input v-model="edit.generators.gemini.apiKey" type="text" :label="t('apiKey')" />
                            <q-input v-model="edit.generators.gemini.model" type="text" placeholder="gemini-2.5-flash" :label="t('textModel')" />
                          </q-card-section>
                          <q-card-section>
                            <q-input v-model="edit.generators.geminiImage.model"
                                     type="text"
                                     placeholder="gemini-2.0-flash-preview-image-generation"
                                     :label="t('imageModel')" />
                          </q-card-section>
                          <q-card-section>
                            <q-input v-model="edit.generators.geminiVoice.model"
                                     type="text"
                                     placeholder="gemini-2.5-flash-preview-tts"
                                     :label="t('voiceModel')" />
                            <q-input v-model="edit.generators.geminiVoice.voice" type="text" placeholder="Kore" :label="t('voice')" />
                          </q-card-section>
                        </q-card>

                      </q-tab-panel>
<!--
                      <q-tab-panel name="voiceVox">
                        <q-card>
                          <q-card-section>
                            <q-input v-model="edit.generators.voiceVox.url"
                                     type="text"
                                     hint="http://192.168.100.100:50021"
                                     label="VoiceVox URL" />
                            <q-input v-model.number="edit.generators.voiceVox.custom.speaker"
                                     type="number"
                                     label="speaker Id" />
                            <q-input v-model.number="edit.generators.voiceVox.custom.speed"
                                     type="number"
                                     label="Speed" />
                            <q-input v-model.number="edit.generators.voiceVox.custom.pitch"
                                     type="number"
                                     label="Pitch" />
                          </q-card-section>
                        </q-card>

                      </q-tab-panel>
-->
                    </q-tab-panels>
                  </q-tab-panel>
                  <q-tab-panel name="mcp">
                    <div class="text-h6 q-mb-md">{{ t('mcpSettings') }}</div>
                    <div class="q-pa-md">
                      <q-btn icon="add" @click="addMcp">{{ t('addMcpDef') }}</q-btn>
                    </div>
                    <q-tabs
                      v-model="tabMcp"
                      inline-label
                      shrink
                      stretch
                      class="bg-orange text-white shadow-2"
                    >
                      <q-tab v-for="(server) in mcpConfig" :key="server.id" :label="server.id" :name="server.id">
                      </q-tab>
                    </q-tabs>
                    <q-separator />
                    <q-tab-panels v-model="tabMcp" animated>
                      <q-tab-panel v-for="(server, index) in mcpConfig" :key="index" :name="server.id">
                        <q-card>
                          <q-card-section>
                            <q-input
                              filled
                              dense
                              v-model="server.id"
                              :label="t('mcpName')"
                              placeholder="mcp1"
                              class="q-mb-sm"
                            />
                            {{ t('onlyAlphaNum') }}
                          </q-card-section>
                          <q-card-section>
                            <q-input
                              filled
                              dense
                              type="textarea"
                              v-model="server.body"
                              :label="t('mcpJson')"
                              placeholder='{command:"npx",args:["-y","@mfukushim/map-traveler-mcp"],env:{"token":"abc"}}'
                              class="q-mb-sm"
                            />
                          </q-card-section>
                          <q-card-actions>
                            <q-btn icon="delete" @click="deleteMcp(server.id)">{{ t('delete') }}</q-btn>
                          </q-card-actions>
                        </q-card>
                      </q-tab-panel>
                    </q-tab-panels>
                  </q-tab-panel>
                  <q-tab-panel name="websocket">
                    <div class="text-h6 q-mb-md">{{ t('avatarCom') }}</div>
                    <q-card>
                      <q-card-section class="row">
                        <q-toggle
                          :label="t('startSocketIoServer')"
                          v-model="edit.websocket.useServer" class="col-6" />
                        <q-input
                          filled
                          dense
                          v-model="websocketPort"
                          :label="t('portNumber')"
                          placeholder="mcp1"
                          class="q-mb-sm col-5 q-mx-md"
                          :disable="!edit.websocket.useServer"
                        />
                        <div class="text-red">{{ t('noteSecurityCom') }}</div>
                      </q-card-section>
                    </q-card>
                    <div class="q-ma-md">{{ t('importExtTalk') }}</div>
                    <q-card>
                      <q-card-section class="row">
                        <q-input class="col-12"
                                 v-model="edit.websocket.textTemplate"
                                 placeholder="{from} said, &quot;{body}&quot;"
                                 :label="t('templateImportExtTalk')"
                        />
<!--
                        <q-input class="col-6" v-model.number="edit.websocket.autoSendTextNumber"
                                 type="number"
                                 label="外部会話のみで返答生成する会話数" />
                        <q-toggle class="col-6"
                                  v-model="edit.websocket.manualSend"
                                  label="外部会話のみで返答を生成しない" />
-->
                      </q-card-section>
                    </q-card>
                  </q-tab-panel>
                  <q-tab-panel name="license">
                    <div class="text-h6 q-mb-md">{{ t('license') }}</div>
                    <q-card class="q-ma-md">
                      <q-card-section>
                        <div class="text-h2">Avatar Shell</div>
                        <div>Version {{ version }}</div>
                        <div class="q-ma-sm text-caption">
                          <div>Copyright (c) 2025-present Masahiro Fukushima</div>
                          <div>Apache-2.0</div>
                          <div><a href="https://github.com/mfukushim/avatar-shell">https://github.com/mfukushim/avatar-shell</a>
                          </div>
                        </div>
                      </q-card-section>
                    </q-card>
                    <div class="q-ma-sm">
                      <div>{{ t('openSourceNotice') }}</div>
                      <div>{{ t('baseElectronBoilerplate') }}: vite-electron-builder</div>
                      <div><a href="https://github.com/cawa-93/vite-electron-builder">https://github.com/cawa-93/vite-electron-builder</a>
                      </div>
                    </div>
                    <q-markdown class="q-ma-sm" :no-blockquote="false">
                      {{ tpl }}
                    </q-markdown>
                  </q-tab-panel>
                </q-tab-panels>
              </template>
            </q-splitter>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="text-primary">
          {{ errorMes }}
          <div v-if="saving">saving and restart...</div>
          <q-btn flat :label="t('close')" @click="saveAndClose" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-icon>
</template>

<style scoped>

</style>
