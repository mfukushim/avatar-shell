<script setup lang="ts">

import {onBeforeUnmount, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {
  exportAvatar,
  exportSysConfig,
  getAvatarConfigList, getPreferencePath,
  getSysConfig,
  getVersion, importAvatar,
  importSysConfig,
  openBrowser, resetPreference,
  setSysConfig,
} from '@app/preload';
import {type McpServerDef, type SysConfigMutable, SysConfigSchema} from '../../../common/Def.ts';
import {Either, ParseResult, Schema} from 'effect';

import tpl from '../assets/licenseInfo.md?raw';
import {defaultSysSetting} from '../../../common/DefaultSetting.ts';
import {QInput} from 'quasar';

const show = ref(false);

const tabSelect = ref('general');
const tabGen = ref('openAi');
const tabMcp = ref('');

const splitterModel = ref(17);

const avatarList = ref<{label: string, value: string}[]>([]);


const edit = ref<SysConfigMutable>(defaultSysSetting);
const mcpConfig = ref<{id: string,enable:boolean, body: string}[]>([]);
// const mcpConfig = ref<{id: string, body: string}[]>([]);

const websocketPort = ref<string | undefined>(undefined);
const saving = ref(false);

const exportAvatarTemplateId = ref('');

const {t} = useI18n();

const errorMes = ref('');
const version = ref('');

const getMcpServerList = () => {
  return (Object.entries(edit.value.mcpServers) as [string, any][])
    .map(v => {
        if (v[1].def) {
          return {id: v[0],enable:v[1].enable, body: JSON.stringify(v[1].def, null, 2)};
        } else {
          //  旧構造互換
          return {id: v[0],enable:true, body: JSON.stringify(v[1], null, 2)};
        }
      },
    );
};


const doOpen = async () => {
  errorMes.value = '';
  const config = await getSysConfig();
  console.log(config);
  edit.value = {...config} as SysConfigMutable;  //  TODO
  mcpConfig.value = getMcpServerList();
  const list = await getAvatarConfigList();
  avatarList.value = list.map(e => ({value: e.templateId, label: e.name}));
  exportAvatarTemplateId.value = list.length > 0 ? list[0].templateId : '';
  //  websocket
  websocketPort.value = edit.value.websocket.serverPort ? edit.value.websocket.serverPort.toString() : undefined;

  const key = Object.keys(config.mcpServers)
  if(key.length > 0) {
    tabMcp.value = key[0];
  }
  tabSelect.value = 'general';
  //  TODO 暫定対応
  if (!edit.value.generators.ollama) {
    edit.value.generators.ollama = {model: '', host: '',token:'',common: {maxTokenThreshold: 10000, summarizePrompt: 'Generate a sentence summarizing the conversation so far.'}}
  }
  if (!edit.value.generators.ollama.common) {
    edit.value.generators.ollama.common = {maxTokenThreshold: 10000, summarizePrompt: 'Generate a sentence summarizing the conversation so far.'}
  }
  if (!edit.value.generators.lmStudio) {
    edit.value.generators.lmStudio = {model: '', baseUrl: '',token:'', common: {maxTokenThreshold: 10000, summarizePrompt: 'Generate a sentence summarizing the conversation so far.'}}
  }
  if (!edit.value.generators.lmStudio.common) {
    edit.value.generators.lmStudio.common = {maxTokenThreshold: 10000, summarizePrompt: 'Generate a sentence summarizing the conversation so far.'}
  }
  if(!edit.value.generators.openAiText.common) {
    edit.value.generators.openAiText.common = {maxTokenThreshold: 10000, summarizePrompt: 'Generate a sentence summarizing the conversation so far.'};
  }
  if(!edit.value.generators.anthropic.common) {
    edit.value.generators.anthropic.common = {maxTokenThreshold: 10000, summarizePrompt: 'Generate a sentence summarizing the conversation so far.'};
  }
  if(!edit.value.generators.gemini.common) {
    edit.value.generators.gemini.common = {maxTokenThreshold: 10000, summarizePrompt: 'Generate a sentence summarizing the conversation so far.'};
  }
  version.value = await getVersion();
  show.value = true;
};

const saveAndClose = async () => {
  saving.value = true;
  errorMes.value = ''
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
    cnt = 0;
    if (edit.value.generators.ollama?.model) cnt++;
    if (edit.value.generators.ollama?.host) cnt++;
    if (cnt === 1) {
      errorMes.value = 'Ollama setting is not valid';
      return;
    }
    cnt = 0;
    if (edit.value.generators.lmStudio?.model) cnt++;
    if (edit.value.generators.lmStudio?.baseUrl) cnt++;
    if (cnt === 1) {
      errorMes.value = 'LM Studio setting is not valid';
      return;
    }

    //  mcp
    //    mcp idが重複しないこと、設定記述があればjson書式であること、一部設定値があれば両方の値があること、すべて空欄なら展開しないこと
    //  mcp設定バリデート/設定
    // console.log('mcpConfig:', mcpConfig.value);
    const idList = mcpConfig.value.map(v => v.id);
    console.log('idList:', idList);
    const idSet = new Set(idList);
    if (idSet.size !== idList.length) {
      errorMes.value = 'mcp id is not unique';
      return;
    }
    const mcpOut: Record<string, McpServerDef> = {};
    for (const mcp of mcpConfig.value) {
      if (mcp.id && mcp.id.length > 0 && mcp.body && mcp.body.length > 0) {
        if(!mcpRegex.test(mcp.id))  {
          errorMes.value = `mcp name "${mcp.id}" only alphanumeric characters are allowed`;
          return;
        }
        try {
          mcpOut[mcp.id] = {
            enable:mcp.enable || false,
            def: JSON.parse(mcp.body)
          };
        } catch (e) {
          console.log('json parse error:', e);
          errorMes.value = `mcp "${mcp.id}" setting is not valid`;
          return;
        }
      }
    }
    // console.log('mcp:', mcpOut);
    edit.value.mcpServers = mcpOut;
    //  websocket

    try {
      edit.value.websocket.serverPort = websocketPort.value ? Number.parseInt(websocketPort.value) : undefined;
    } catch (e) {
      edit.value.websocket.serverPort = undefined;
    }
    // console.log(
    //   'edit:',
    //   JSON.stringify(edit.value),
    // );
    const setting = Schema.decodeUnknownEither(SysConfigSchema)(edit.value);
    if (Either.isRight(setting)) {
      // console.log('edit:', JSON.stringify(setting.right));
      await setSysConfig(setting.right);
      show.value = false;
      return;
    }
    const e = ParseResult.ArrayFormatter.formatErrorSync(setting.left);
    errorMes.value = e.map(e => `${e.path.join(' > ')} : ${e.message}`).join(', ');
    //  TODO エラー時にLLMと音声読み上げが有効ならローカル言語化と音声読み上げを行う
    // console.log(e);
  } finally {
    saving.value = false;
  }
};


const addMcp = () => {
  let count = 1;
  let id = `mcp${mcpConfig.value.length + count}`;
  while (mcpConfig.value.find(v => v.id === id)) {
    count++;
    id = `mcp${mcpConfig.value.length + count}`;
  }
  const items = {id: id,enable:false, body: '{}'};
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

const disableImportSys = ref(false);
const disableImportAvatar = ref(false);
const disableExportAvatar = ref(false);
const disableExportSysConfig = ref(false);

const prefPath = ref('');
const pathRef = ref<QInput | null>(null);

const importSys = async () => {
  disableImportSys.value = true;
  await importSysConfig()
  await doOpen()
  disableImportSys.value = false;
}

const exportSys = async () => {
  disableExportSysConfig.value = true;
  await exportSysConfig()
  disableExportSysConfig.value = false;
}

const importAvatarBtn = async () => {
  disableImportAvatar.value = true
  await importAvatar()
  disableImportAvatar.value = false
}

const exportAvatarBtn = async (templateId:string) => {
  disableExportAvatar.value = true
  await exportAvatar(templateId)
  disableExportAvatar.value = false
}

const fullReset = async (all:boolean) => {
  await resetPreference(all)
}

onMounted(async () => {
  document.addEventListener('click', handleClick);
  prefPath.value = await getPreferencePath();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClick);
});

const mcpRegex = /^[a-z][a-z0-9]*$/;

const mcpNameValidate = [
  // (val:string) => (val && val.length > 0) || 'Please type mcp name',
  (val:string) => (val && mcpRegex.test(val)) || 'Only lowercase alphanumeric characters are allowed',
]

const copyPath = async () => {
  try {
    await navigator.clipboard.writeText(prefPath.value);
    if (pathRef.value) {
      pathRef.value.select()
    }
  } catch (err) {
    alert("copy fail: " + err);
  }
}

</script>

<template>
  <q-icon name="settings" size="30px" class="q-pa-sm" @click="doOpen" data-testid="sys-setting-btn" >
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
                  <q-tab name="importExport" icon="import_export" :label="t('importExport')" />
                  <q-tab name="reset" icon="delete_forever" :label="t('reset')" />
                  <q-tab name="experimental" icon="science" :label="t('experimental')" />
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
                                  map-options
                                  data-testid="default-avatar-select" />
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
                      <q-tab label="Ollama" name="ollama"/>
                      <q-tab label="LM Studio" name="lmStudio"/>
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
                                     :label="t('apiKey')"
                                     data-testid="openai-api-key" />
                            <q-input v-model="edit.generators.openAiText.model"
                                     type="text"
                                     placeholder="gpt-4.1-mini"
                                     :label="t('textModel')"
                                     data-testid="openai-model" />
                            <q-input v-model.number="edit.generators.openAiText.common.cutoffChatLimit"
                                     type="number"
                                     placeholder="100"
                                     :label="t('cutoffChatLimit')"
                                     data-testid="openai-cutoffChatLimit" />
                            <q-input v-model.number="edit.generators.openAiText.common.maxTokenThreshold"
                                     type="number"
                                     placeholder="10000"
                                     :label="t('maxTokenThreshold')"
                                     data-testid="openai-maxTokenThreshold" />
                            <q-input v-model="edit.generators.openAiText.common.summarizePrompt"
                                     type="textarea"
                                     placeholder=""
                                     :label="t('summarizePrompt')"
                                     data-testid="openai-summarizePrompt" />
                          </q-card-section>
                          <q-card-section>
                            <q-input v-model="edit.generators.openAiImage.model"
                                     type="text"
                                     placeholder="gpt-4.1-mini"
                                     :label="t('imageModel')"
                                     data-testid="openai-image-model" />
                            <div class="q-px-md text-caption">{{t('openaiImageNotice')}}</div>
                          </q-card-section>
                          <q-card-section>
                            <q-input v-model="edit.generators.openAiVoice.model"
                                     type="text"
                                     placeholder="gpt-4o-audio-preview"
                                     :label="t('voiceModel')"
                                     data-testid="openai-voice-model" />
                            <q-input v-model="edit.generators.openAiVoice.voice" type="text" placeholder="alloy" :label="t('voice')" data-testid="openai-voice-voice" />
                            <q-input v-model.number="edit.generators.openAiVoice.cutoffTextLimit" type="number" placeholder="200" :label="t('voiceCutoffTextLimit')" data-testid="openai-voice-cutoff" />
                          </q-card-section>
                        </q-card>
                      </q-tab-panel>
                      <q-tab-panel name="anthropic">
                        <q-card>
                          <q-card-section>
                            <q-input v-model="edit.generators.anthropic.apiKey"
                                     type="text"
                                     placeholder="sk-"
                                     :label="t('apiKey')"
                                     data-testid="anthropic-api-key" />
                            <q-input v-model="edit.generators.anthropic.model"
                                     type="text"
                                     placeholder="claude-3-7-sonnet-latest"
                                     :label="t('textModel')"
                                     data-testid="anthropic-model" />
                            <q-input v-model.number="edit.generators.anthropic.common.cutoffChatLimit"
                                     type="number"
                                     placeholder="10000"
                                     :label="t('cutoffChatLimit')"
                                     data-testid="anthropic-cutoffChatLimit" />
                            <q-input v-model.number="edit.generators.anthropic.common.maxTokenThreshold"
                                     type="number"
                                     placeholder="10000"
                                     :label="t('maxTokenThreshold')"
                                     data-testid="anthropic-maxTokenThreshold" />
                            <q-input v-model="edit.generators.anthropic.common.summarizePrompt"
                                     type="textarea"
                                     placeholder=""
                                     :label="t('summarizePrompt')"
                                     data-testid="anthropic-summarizePrompt" />
                          </q-card-section>
                        </q-card>
                      </q-tab-panel>
                      <q-tab-panel name="google">
                        <q-card>
                          <q-card-section>
                            <q-input v-model="edit.generators.gemini.apiKey" type="text" :label="t('apiKey')" data-testid="gemini-api-key" />
                            <q-input v-model="edit.generators.gemini.model" type="text" placeholder="gemini-2.5-flash" :label="t('textModel')" data-testid="gemini-model" />
                            <q-input v-model.number="edit.generators.gemini.common.cutoffChatLimit"
                                     type="number"
                                     placeholder="100"
                                     :label="t('cutoffChatLimit')"
                                     data-testid="gemini-cutoffChatLimit" />
                            <q-input v-model.number="edit.generators.gemini.common.maxTokenThreshold"
                                     type="number"
                                     placeholder="10000"
                                     :label="t('maxTokenThreshold')"
                                     data-testid="gemini-maxTokenThreshold" />
                            <q-input v-model="edit.generators.gemini.common.summarizePrompt"
                                     type="textarea"
                                     placeholder=""
                                     :label="t('summarizePrompt')"
                                     data-testid="gemini-summarizePrompt" />
                          </q-card-section>
                          <q-card-section>
                            <q-input v-model="edit.generators.geminiImage.model"
                                     type="text"
                                     placeholder="gemini-2.0-flash-preview-image-generation"
                                     :label="t('imageModel')"
                                     data-testid="gemini-image-model" />
                          </q-card-section>
                          <q-card-section>
                            <q-input v-model="edit.generators.geminiVoice.model"
                                     type="text"
                                     placeholder="gemini-2.5-flash-preview-tts"
                                     :label="t('voiceModel')"
                                     data-testid="gemini-voice-model" />
                            <q-input v-model="edit.generators.geminiVoice.voice" type="text" placeholder="Kore" :label="t('voice')" data-testid="gemini-voice-voice" />
                            <q-input v-model.number="edit.generators.geminiVoice.cutoffTextLimit" type="number" placeholder="200" :label="t('voiceCutoffTextLimit')" data-testid="gemini-voice-cutoff" />
                          </q-card-section>
                        </q-card>

                      </q-tab-panel>
                      <q-tab-panel name="ollama">
                        <q-card>
                          <q-card-section>
                            <q-input v-model="edit.generators.ollama.host"
                                     type="text"
                                     placeholder="http://192.168.1.1:11434"
                                     :label="t('Host')"
                                     data-testid="ollama-host" />
                            <q-input v-model="edit.generators.ollama.model"
                                     type="text"
                                     placeholder="llama3.1"
                                     :label="t('Model')"
                                     data-testid="ollama-model" />
                            <q-input v-model.number="edit.generators.ollama.common.cutoffChatLimit"
                                     type="number"
                                     placeholder="100"
                                     :label="t('cutoffChatLimit')"
                                     data-testid="ollama-cutoffChatLimit" />
                            <q-input v-model.number="edit.generators.ollama.common.maxTokenThreshold"
                                     type="number"
                                     placeholder="10000"
                                     :label="t('maxTokenThreshold')"
                                     data-testid="ollama-maxTokenThreshold" />
                            <q-input v-model="edit.generators.ollama.common.summarizePrompt"
                                     type="textarea"
                                     placeholder=""
                                     :label="t('summarizePrompt')"
                                     data-testid="ollama-summarizePrompt" />
                          </q-card-section>
                        </q-card>
                      </q-tab-panel>
                      <q-tab-panel name="lmStudio">
                        <q-card>
                          <q-card-section>
                            <q-input v-model="edit.generators.lmStudio.baseUrl"
                                     type="text"
                                     placeholder="http://192.168.1.1:1234"
                                     :label="t('Host')"
                                     data-testid="lmStudio-host" />
                            <q-input v-model="edit.generators.lmStudio.model"
                                     type="text"
                                     placeholder="openai/gpt-oss-20b"
                                     :label="t('defaultModel')"
                                     data-testid="lmStudio-model" />
                            <q-input v-model.number="edit.generators.lmStudio.common.cutoffChatLimit"
                                     type="number"
                                     placeholder="100"
                                     :label="t('cutoffChatLimit')"
                                     data-testid="ollama-cutoffChatLimit" />
                            <q-input v-model.number="edit.generators.lmStudio.common.maxTokenThreshold"
                                     type="number"
                                     placeholder="10000"
                                     :label="t('maxTokenThreshold')"
                                     data-testid="ollama-maxTokenThreshold" />
                            <q-input v-model="edit.generators.lmStudio.common.summarizePrompt"
                                     type="textarea"
                                     placeholder=""
                                     :label="t('summarizePrompt')"
                                     data-testid="ollama-summarizePrompt" />
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
                      <q-btn icon="add" @click="addMcp" data-testid="mcp-add-btn">{{ t('addMcpDef') }}</q-btn>
                    </div>
                    <q-tabs
                      v-model="tabMcp"
                      inline-label
                      shrink
                      stretch
                      no-caps
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
                              :hint="t('onlyAlphaNum')"
                              class="q-mb-sm"
                              debounce="1000"
                              lazy-rules
                              @change="tabMcp = server.id"
                              :rules="mcpNameValidate"
                              data-testid="mcp-id-input"
                            />
                            <q-toggle
                              dense
                              v-model="server.enable"
                              label="enable"
                              class="q-mb-sm"
                              data-testid="mcp-enable-input"
                            />
                            <q-input
                              filled
                              dense
                              type="textarea"
                              v-model="server.body"
                              :label="t('mcpJson')"
                              placeholder='{command:"npx",args:["-y","@mfukushim/map-traveler-mcp"],env:{"token":"abc"}}'
                              class="q-mb-sm"
                              data-testid="mcp-json-input"
                            />
                          </q-card-section>
                          <q-card-actions>
                            <q-btn icon="delete" @click="deleteMcp(server.id)" data-testid="mcp-delete-btn">{{ t('delete') }}</q-btn>
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
                          v-model="edit.websocket.useServer" class="col-6"
                          data-testid="ws-use-server" />
                        <q-input
                          filled
                          dense
                          v-model="websocketPort"
                          :label="t('portNumber')"
                          placeholder="mcp1"
                          class="q-mb-sm col-5 q-mx-md"
                          :disable="!edit.websocket.useServer"
                          data-testid="ws-port-input"
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
                                 data-testid="ws-text-template"
                        />
                      </q-card-section>
                    </q-card>
                  </q-tab-panel>
                  <q-tab-panel name="reset">
                    <div class="text-h6 q-mb-md">{{ t('reset') }}</div>
                    <q-card class="q-pa-sm">
                        <div class="row q-ma-sm">
                          <div class="q-ma-md">{{t('fullReset')}}</div>
                          <q-space/>
                          <q-btn :label="t('fullReset')" class="q-ma-md" @click="fullReset(true)"></q-btn>
                        </div>
                        <div class="row">
                          <div class="q-ma-md">{{t('resetWithoutMedia')}}</div>
                          <q-space/>
                          <q-btn :label="t('resetWithoutMedia')" class="q-ma-md" @click="fullReset(false)"></q-btn>
                        </div>
                        <div class="row">
                          <div class="q-ma-md">{{ t('preferenceDirectory') }}:</div>
                          <q-space/>
                          <q-input ref="pathRef" v-model="prefPath" hint="Readonly" readonly class="col-8">
                            <template v-slot:append>
                              <q-icon name="content_copy" @click="copyPath" />
                            </template>
                          </q-input>
                        </div>
                    </q-card>
                  </q-tab-panel>
                  <q-tab-panel name="experimental">
                    <div class="text-h6 q-mb-md">{{ t('experimental') }}</div>
                    <q-card>
                      <q-card-section class="row">
                        <q-toggle
                          :label="t('useMcpUi')"
                          v-model="edit.experimental.mcpUi" class="col-6"
                          data-testid="exp-mcpui-toggle" />
                        <q-toggle
                          :label="t('mcpUiFilterDisabled')"
                          v-model="edit.experimental.mcpUiFilterDisabled" class="col-6"
                          data-testid="exp-mcpui-toggle" />
                        <q-input class="col-6"
                                 v-model="edit.experimental.mcpUiTemplate"
                                 placeholder="user select, &quot;{body}&quot;"
                                 :label="t('mcpUiSelectTemplate')"
                                 data-testid="exp-mcpui-template"
                        />
                      </q-card-section>
                    </q-card>
                  </q-tab-panel>
                  <q-tab-panel name="importExport">
                    <div class="text-h6 q-mb-md">{{ t('importExport') }}</div>
                    <q-card class="q-ma-md">
                      <q-card-section class="row">
                        {{t('importSysInfo')}}
                        <q-space/>
                        <q-btn @click="importSys" :disable="disableImportSys" data-testid="import-sys-btn">{{t('importSys')}}</q-btn>
                      </q-card-section>
                      <q-card-section class="row">
                        {{t('exportSysInfo')}}
                        <q-space/>
                        <q-btn @click="exportSys" :disable="disableExportSysConfig" data-testid="export-sys-btn">{{t('exportSys')}}</q-btn>
                      </q-card-section>
                    </q-card>
                    <q-card class="q-ma-md">
                      <q-card-section class="row">
                        {{t('importAvatarInfo')}}
                        <q-space/>
                        <q-btn @click="importAvatarBtn"  :disable="disableImportAvatar" data-testid="import-avatar-btn">{{t('importAvatar')}}</q-btn>
                      </q-card-section>
                      <q-card-section class="row q-px-md">
                        {{t('exportAvatarInfo')}}
                        <q-space/>
                        <q-select v-model="exportAvatarTemplateId"
                                  :options="avatarList"
                                  emit-value
                                  map-options class="q-px-sm"
                                  data-testid="export-avatar-select" />
                        <q-btn @click="exportAvatarBtn(exportAvatarTemplateId)" :disable="exportAvatarTemplateId=='' || disableExportAvatar" data-testid="export-avatar-btn">{{t('exportAvatar')}}</q-btn>
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
          <q-btn flat :label="t('close')" @click="saveAndClose" data-testid="save-and-close-btn" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-icon>
</template>

<style scoped>

</style>
