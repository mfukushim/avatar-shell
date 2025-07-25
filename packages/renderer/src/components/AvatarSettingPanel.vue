<script setup lang="ts">

import {onMounted, ref} from 'vue';
import {
  AvatarSetting,
  // MainLlmList,
  type McpEnable,
  McpEnableList,
  AvatarSettingMutable,
  type SchedulerListMutable,
  DaemonTriggerList,
  type McpInfo, AvatarMcpSettingMutable,
} from '../../../common/Def.ts';
import {Either, ParseResult, Schema} from 'effect';
import short from 'short-uuid';
import {getAvatarConfig, getGeneratorList, getMcpServerInfos, setAvatarConfig} from '@app/preload';
import {AsClassList, AsRoleList} from '../../../common/DefGenerators.ts';

const doOpen = async (templateId: string) => {

  const config = await getAvatarConfig(templateId);
  mcpServers.value = await getMcpServerInfos();
  console.log('mcpServers', mcpServers);
  console.log('config', config);
  generatorList.value =[''].concat(await getGeneratorList())
  const mcps: Record<string, AvatarMcpSettingMutable> = {};
  mcpServers.value.forEach(value => {
    const useTools: Record<string, {enable: boolean, allow: McpEnable}> = {};
    value.tools.map(tool => {
      useTools[tool.name] = {
        enable: true,
        allow: 'ask',
        // info: tool,
      };
    });
    // console.log(value);
    // if (config.mcp[value.id]) {
    //   Object.entries(config.mcp[value.id]?.useTools).forEach(value2 => {
    //     useTools[value2[0]] = {
    //       enable: value2[1].enable,
    //       allow: value2[1].allow,
    //       // info: value.tools.find(tool => tool.name === value2[0])!,
    //     };
    //   });
    // }
    mcps[value.id] = {
      enable: config.mcp[value.id]?.enable === undefined ? true : config.mcp[value.id]?.enable,
      notice: value.notice,
      useTools: {
        ...useTools,
        ...config.mcp[value.id]?.useTools,
      },
    };
    // config.mcp[value.id];
  });
  let addMcp = deepMerge(mcps,config.mcp as Record<string, AvatarMcpSettingMutable>)
  // {
  //   ...mcps,
  //   ...config.mcp as Record<string, AvatarMcpSettingMutable>,
  // }
  console.log('mcps', mcps);
  console.log('addMcp', addMcp);
  // Object.entries(addMcp).forEach(value => {
  //   addMcp[value[0]].useTools = {
  //     ...mcps[value[0]].useTools,
  //     ...addMcp[value[0]].useTools
  //   }
  // })
  editingSettings.value = {
    ...config,
    mcp: addMcp,
  };
  editingSchedulers.value = [...config.daemons]
  console.log('mcpSettingList', mcpServers.value);
  console.log('mcps', mcps);
  console.log('editingSettings.value', editingSettings.value);
  // const mcp = await applyMcpSetting(templateId.value)
  // mcpSettingList.value = config.mcp
  //  TODO ちょっとreadonlyをごまかしているがどうするか

  show.value = true;
};
function deepMerge<T extends object, U extends object>(target: T, source: U): T & U {
  const output = { ...target } as T & U;

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = (target as any)[key];

    if (
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      output[key] = deepMerge(targetValue, sourceValue);
    } else {
      output[key] = sourceValue as any;
    }
  }

  return output;
}

defineExpose({
  doOpen,
});

const emit = defineEmits<{
  (e: 'done', templateId: string): void,
}>();


const show = ref(false);

const tab = ref('general');
const splitterModel = ref(15);

const generatorList = ref<string[]>([]);

const editingSettings = ref<AvatarSettingMutable>();
const editingSchedulers = ref<SchedulerListMutable>();
const errorMes = ref('');
const mcpServers = ref<McpInfo[]>([])


const getMcpInfo = (id:string,name?:string):any => {
  const mcp = mcpServers.value.find(value => value.id === id)
  if(mcp){
    return mcp.tools.find(v => v.name === name) || ''
  }
  return {}
}

const saveAndClose = async () => {
  console.log('editing:', JSON.stringify(editingSettings.value));
  // console.log('mcpSettingList',mcpSettingList.value);
  //  TODO ここで選択したLLMのsystem側apiKeyやmodelが空欄でないかどうかだけ確認する LLM未選択はエラーがわかりにくいので出来れば避けたい
  const save = {
    ...editingSettings.value,
    daemons: editingSchedulers.value,
  };
  const setting = Schema.decodeUnknownEither(AvatarSetting)(save);
  if (Either.isRight(setting)) {
    console.log('editingSettings:', JSON.stringify(setting.right));
    await setAvatarConfig(editingSettings.value?.templateId!!, setting.right);
    show.value = false;
    emit('done', editingSettings.value?.templateId!!);
    return;
  }
  const e = ParseResult.ArrayFormatter.formatErrorSync(setting.left);
  errorMes.value = Array.from(e.reduce((p, c) => {
    const key = c.path.join(' > ');
    if(p.has(key)) return p;
    return p.set(key, c.message);
  },new Map<string,string>()).entries()).map(e => `${e[0]} : ${e[1]}`).join('\n');
  //  TODO エラー時にLLMと音声読み上げが有効ならローカル言語化と音声読み上げを行う
  console.log(e);
};


const addScheduler = () => {
  if (editingSchedulers.value) {
    editingSchedulers.value.push({
      id: short.generate(),
      name: 'startup',
      isEnabled: true,
      trigger: {
        triggerType: 'Startup',
        condition: {},
      },
      exec: {
        generator: 'emptyText',
        templateGeneratePrompt: '',
        addDaemonGenToContext: false,
        // templateContextPrompt: '',
        setting: {
        }
      }
    });
  }
};

const deleteScheduler = (time: any) => {
  if (editingSchedulers.value) {
    editingSchedulers.value = editingSchedulers.value.filter(value => value.id !== time.id);
  }
};

onMounted(async () => {
  //  ここはトップ画面の生成と同時に作られる部分なので、初期処理はdoOpenに置く
});
</script>

<template>
  <q-dialog v-model="show" persistent full-width>
    <q-card style="width: 1000px;min-height: 600px">
      <q-card-section>
        <div class="text-h6">アバターひな形設定 - {{ editingSettings?.general.name }}</div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div>
          <q-splitter
            v-model="splitterModel"
            style="height: 500px;"
          >

            <template v-slot:before>
              <q-tabs
                v-model="tab"
                vertical
                dense
                no-caps
                class="text-teal"
                style=""
              >
                <q-tab name="general" icon="face" :label="$t('general')" />
                <q-tab name="daemon" icon="schedule" label="コンテキストデーモン" />
                <q-tab name="mcp" icon="extension" label="MCP権限" />
                <q-tab name="websocket" icon="rss_feed" label="アバター間通信" />
              </q-tabs>
            </template>

            <template v-slot:after>
              <q-tab-panels
                v-model="tab"
                animated
                swipeable
                vertical
                transition-prev="jump-up"
                transition-next="jump-up"
              >
                <q-tab-panel name="general">
                  <div class="text-h8 q-mb-md">一般</div>
                  <q-card>
                    <q-card-section>
                      <q-input v-model="editingSettings!.general.name" label="アバターひな形名" />
                      <div class="row">
                        <div class="col-6 q-pa-sm">
<!--
                          <q-select v-model="editingSettings!.general.useLlm" :options="MainLlmList" label="メイン言語LLM" />
-->
                          <q-input type="number" v-model.number="editingSettings!.general.maxGeneratorUseCount" label="アバターごとのジェネレーター使用回数上限" />
                        </div>
                      </div>
                    </q-card-section>
                  </q-card>
                </q-tab-panel>

                <q-tab-panel name="mcp">
                  <div class="text-h6 q-mb-md">MCP権限</div>
                  <div class="text-body2">使用するMCPの設定をします</div>
                  <div class="text-caption q-ma-sm">注意:
                    MCPはセキュリティと動作安全性の上でリスクがあります。リスクを判断の上、使用するか判断してください。
                  </div>
                  <q-card
                    v-for="(mcp, index) in Object.entries(editingSettings!!.mcp!!)"
                    :key="index"
                    bordered
                    class="bg-grey-2 my-card q-mb-md"
                  >
                    <q-card-section>
                      <div class="text-subtitle2">{{ mcp[0] }}</div>
                      <q-toggle v-model="mcp[1].enable" label="enable" />
                      <div v-if="mcp[1].notice" class="text-red">{{ mcp[1].notice }}</div>
                    </q-card-section>
                    <div class="row q-pa-sm">
                      <div class="col-6 q-my-sm q-pa-sm shadow-1"
                           v-for="(tool, inputIndex) in Object.entries(mcp[1].useTools)"
                           :key="inputIndex">
                        {{ tool[0] }}
                        <div class="row">
                          <q-toggle class="col-6" v-model="tool[1].enable" label="enable" />
                          <q-select class="col-6" v-model="tool[1].allow" :options="McpEnableList" label="Permission" />
                          <q-tooltip>
                            {{getMcpInfo(mcp[0],tool[0])?.description}}
                          </q-tooltip>
                        </div>
                      </div>
                    </div>
                  </q-card>
                </q-tab-panel>
                <q-tab-panel name="daemon">
                  <div class="q-ma-md">コンテキストデーモン</div>
                  <div>
                    <div class="q-pa-md">
                      <q-btn icon="add" @click="addScheduler">Add Context daemon</q-btn>
                    </div>
                    <div v-for="daemon in editingSchedulers">
                      <q-card>
                        <q-card-section class="row items-center">
                          <q-input bottom-slots class="" v-model="daemon.name">
                            <template v-slot:hint>
                              Name
                            </template>
                          </q-input>
                          <q-toggle class="" v-model="daemon.isEnabled" label="enable" />
                          <q-space/>
                          <q-btn icon="add" @click="deleteScheduler(daemon)">delete</q-btn>

                        </q-card-section>
                        <div class="row">
                        <div class="col-4">
                          <div class="q-pa-sm shadow-2 q-ma-md">
                            条件
                          <q-select class="q-ma-sm" v-model="daemon.trigger.triggerType" options-dense map-options @update:model-value="daemon.trigger.triggerType = $event.value" :options="DaemonTriggerList.map(value => ({value,label:$t(`trigger.${value}`)}))" label="起動条件"/>
                          <div v-if="daemon.trigger.triggerType === 'Startup'">
                            アバター起動時に実行
                          </div>
                          <div v-else-if="daemon.trigger.triggerType === 'TalkAfterMin'">
                            最後の会話から一定時間後
                            <q-input type="number" v-model.number="daemon.trigger.condition.min" label="分" />
                          </div>
                          <div v-else-if="daemon.trigger.triggerType === 'IfContextExists'">
                            (指定の種別のコンテキスト発生時)
                            <q-select v-model="daemon.trigger.condition.asClass" :options="AsClassList" label="asClass" />
                            <q-select v-model="daemon.trigger.condition.asRole" :options="AsRoleList" label="asRole" />
                          </div>
                            <div v-else-if="daemon.trigger.triggerType === 'IfSummaryCounterOver'">
                              (一定数会話が行われた時)
                              <q-input type="number" v-model.number="daemon.trigger.condition.countMax" label="検出会話数" />
                            </div>
                            <div v-else-if="daemon.trigger.triggerType === 'IfExtTalkCounterOver'">
                              (一定数の外部会話が入力された時)
                              <q-input type="number" v-model.number="daemon.trigger.condition.countMax" label="検出会話数" />
                            </div>
                          <div v-else-if="daemon.trigger.triggerType === 'TimerMin'">
                            アバター起動後、指定時間後
                            <q-input type="number" v-model.number="daemon.trigger.condition.min" label="分" />
                            <q-toggle v-model="daemon.trigger.condition.isRepeatMin" label="繰り返し"/>
                          </div>
                          <div v-else-if="daemon.trigger.triggerType === 'DayTimeDirect'">
                            1日の指定時刻
                            <q-input type="time" v-model="daemon.trigger.condition.time" label="時刻" />
                          </div>
                          <div v-else-if="daemon.trigger.triggerType === 'DateTimeDirect'">
                            指定日時
                            <q-input type="date" v-model="daemon.trigger.condition.date" label="日付" />
                            <q-input type="time" v-model="daemon.trigger.condition.time" label="時刻" />
                          </div>
                          <div v-else>
                            {{daemon.trigger.triggerType}}
                            起動条件を選択してください
                          </div>
                          </div>

                        </div>
                        <div class="col-8">
                          <div class="q-ma-md q-pa-md shadow-2">
                            実行
                            <q-select v-model="daemon.exec.generator" :options="generatorList" options-dense label="Generator名" /><q-toggle v-model="daemon.exec.addDaemonGenToContext" label="結果をコンテキストに追加する"/>
                            <q-input type="textarea" class="q-ma-md" v-model="daemon.exec.templateGeneratePrompt" label="Generator prompt template" outlined :disable="daemon.exec.generator == 'emptyText'" />
                            <div>追加コンテキスト</div>
                            <div class="row">
                            <q-select v-model="daemon.exec.setting.toClass" :options="AsClassList" options-dense label="output class" class="col-6" />
                            <q-select v-model="daemon.exec.setting.toRole" :options="AsRoleList" options-dense label="output role" class="col-6" />
                            </div>
<!--
                            <q-input type="textarea" class="q-ma-md" v-model="daemon.exec.templateContextPrompt" label="Context prompt template" outlined />
-->
                          </div>
                        </div>
                        </div>
                      </q-card>
                    </div>
                  </div>
                </q-tab-panel>

                <q-tab-panel name="websocket">
                  <div class="text-h6 q-mb-md">AvatarCom</div>
                  <q-toggle v-model="editingSettings!.general.useSocket" label="use webSocket communication" />
                  <q-input v-model="editingSettings!.general.remoteServer"
                           :disable="!(editingSettings!.general.useSocket)"
                           label="remote socket.io server (use localServer if empty,例 http://192.168.1.10:3000 )" />
                </q-tab-panel>
              </q-tab-panels>
            </template>

          </q-splitter>
        </div>
      </q-card-section>
<q-card-section class="row">
  <q-input type="textarea" :model-value="errorMes" readonly class="col-11" style="height: 60px"/>
  <q-btn flat label="Close" @click="saveAndClose" class="col-1"/>

</q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>

</style>
