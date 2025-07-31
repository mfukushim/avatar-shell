<script setup lang="ts">

import {onMounted, ref} from 'vue';
import {
  AvatarSetting,
  McpEnableList,
  AvatarSettingMutable,
  type SchedulerListMutable,
  DaemonTriggerList,
  type McpInfo,
} from '../../../common/Def.ts';
import {Either, ParseResult, Schema} from 'effect';
import short from 'short-uuid';
import {getAvatarConfig, updateAvatarMcpSetting, setAvatarConfig, getGeneratorList} from '@app/preload';
import {AsClassList, AsContextLinesList, AsRoleList} from '../../../common/DefGenerators.ts';
import {useI18n} from 'vue-i18n';

const {t} = useI18n();

const doOpen = async (templateId: string) => {

  const config = await getAvatarConfig(templateId);
  const addMcp = await updateAvatarMcpSetting(templateId)
  editingSettings.value = {
    ...config,
    mcp: addMcp,
  };
  editingSchedulers.value = [...config.daemons]
  generatorList.value =[''].concat(await getGeneratorList())

  if(config.daemons.length > 0){
    tabDaemon.value = config.daemons[0].name
  }
  if(Object.keys(config.mcp).length > 0){
    tabMcp.value = Object.keys(config.mcp)[0]
  }
  console.log('mcpSettingList', mcpServers.value);
  // console.log('mcps', mcps);
  console.log('editingSettings.value', editingSettings.value);
  // const mcp = await applyMcpSetting(templateId.value)
  // mcpSettingList.value = config.mcp
  //  TODO ちょっとreadonlyをごまかしているがどうするか

  show.value = true;
};

defineExpose({
  doOpen,
});

const emit = defineEmits<{
  (e: 'done', templateId: string): void,
}>();


const show = ref(false);

const tab = ref('general');
const tabDaemon = ref('');
const tabMcp = ref('');

const splitterModel = ref(15);

const generatorList = ref<string[]>([]);

const editingSettings = ref<AvatarSettingMutable>();
const editingSchedulers = ref<SchedulerListMutable>();
const errorMes = ref('');
const mcpServers = ref<McpInfo[]>([])

const saving = ref(false);

const getMcpInfo = (id:string,name?:string):any => {
  const mcp = mcpServers.value.find(value => value.id === id)
  if(mcp){
    return mcp.tools.find(v => v.name === name) || ''
  }
  return {}
}

const saveAndClose = async () => {
  saving.value = true;
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
    saving.value = false;
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
  saving.value = false;
  console.log(e);
};


const addScheduler = () => {
  if (editingSchedulers.value) {
    let count = 1
    let name = `daemon-${tabDaemon.value.length}`;
    while (editingSchedulers.value.find(v => v.name === name)) {
      count++;
      name = `daemon-${tabDaemon.value.length+count}`;
    }

    editingSchedulers.value.push({
      id: short.generate(),
      name: name,
      isEnabled: true,
      trigger: {
        triggerType: 'Startup',
        condition: {},
      },
      exec: {
        generator: 'emptyText',
        templateGeneratePrompt: 'Are you ready?',
        addDaemonGenToContext: false,
        setting: {
          toClass: 'daemon',
          toRole: 'bot',
          toContext: 'outer'
        }
      }
    });
    tabDaemon.value = name;
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
        <div class="text-h6">{{$t('avatarTemplateEdit')}} - {{ editingSettings?.general.name }}</div>
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
                <q-tab name="daemon" icon="schedule" :label="$t('contextDaemon')" />
                <q-tab name="mcp" icon="extension" :label="$t('mcpPermission')" />
                <q-tab name="websocket" icon="rss_feed" :label="$t('avatarCommunication')"/>
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
                  <div class="text-h8 q-mb-md">{{ $t('general') }}</div>
                  <q-card>
                    <q-card-section>
                      <q-input v-model="editingSettings!.general.name" :label="$t('avatarTemplateName')" />
                      <div class="row">
                        <div class="col-6 q-pa-sm">
                          <q-input type="number" v-model.number="editingSettings!.general.maxGeneratorUseCount" :label="$t('generatorUsageLimit')" />
                        </div>
                      </div>
                    </q-card-section>
                  </q-card>
                </q-tab-panel>

                <q-tab-panel name="mcp">
                  <div class="text-h6 q-mb-md">{{$t('mcpPermission')}}</div>
                  <div class="text-body2">{{$t('setMcpPermissions')}}</div>
                  <div class="text-caption q-ma-sm">
                    {{$t('mcpNotice')}}
                  </div>
                  <q-tabs
                    v-model="tabMcp"
                    inline-label
                    shrink
                    stretch
                    no-caps
                    class="bg-orange text-white shadow-2"
                  >
                    <q-tab v-for="(mcp) in Object.entries(editingSettings!!.mcp!!)" :key="mcp[0]" :label="mcp[0]" :name="mcp[0]">
                    </q-tab>
                  </q-tabs>
                  <q-separator />
                  <q-tab-panels v-model="tabMcp" animated>
                    <q-tab-panel
                      v-for="(mcp, index) in Object.entries(editingSettings!!.mcp!!)"
                      :key="index"
                      :name="mcp[0]"
                      class="bg-grey-2 my-card q-mb-md"
                    >
                      <q-card>
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
                  </q-tab-panels>
                </q-tab-panel>
                <q-tab-panel name="daemon">
                  <div class="q-ma-md">{{$t('contextDaemonLabel')}}</div>
                  <div>
                    <div class="q-pa-md">
                      <q-btn icon="add" @click="addScheduler">{{$t('addContextDaemon')}}</q-btn>
                    </div>
                    <q-tabs
                      v-model="tabDaemon"
                      inline-label
                      shrink
                      stretch
                      no-caps
                      class="bg-orange text-white shadow-2"
                    >
                      <q-tab v-for="(daemon) in editingSchedulers" :key="daemon.id" :label="daemon.name" :name="daemon.name">
                      </q-tab>
                    </q-tabs>
                    <q-separator />
                    <q-tab-panels v-model="tabDaemon" animated>
                    <q-tab-panel v-for="daemon in editingSchedulers" :key="daemon.id" :name="daemon.name">
                      <q-card>
                        <q-card-section class="row items-center">
                          <q-input bottom-slots class="" v-model="daemon.name" debounce="500" @change="tabDaemon = daemon.name">
                            <template v-slot:hint>
                              {{ $t('name') }}
                            </template>
                          </q-input>
                          <q-toggle class="" v-model="daemon.isEnabled" :label="$t('enable')" />
                          <q-space/>
                          <q-btn icon="add" @click="deleteScheduler(daemon)">{{ $t('delete') }}</q-btn>
                        </q-card-section>
                        <div class="row">
                        <div class="col-4">
                          <div class="q-pa-sm shadow-2 q-ma-md">
                            {{$t('conditions')}}
                          <q-select class="q-ma-sm" v-model="daemon.trigger.triggerType" options-dense map-options @update:model-value="daemon.trigger.triggerType = $event.value" :options="DaemonTriggerList.map(value => ({value,label:$t(`trigger.${value}`)}))" label="起動条件"/>
                          <div v-if="daemon.trigger.triggerType === 'Startup'">
                            {{$t('trigger.Startup')}}
                          </div>
                          <div v-else-if="daemon.trigger.triggerType === 'TalkAfterMin'">
                            {{$t('trigger.TalkAfterMin')}}
                            <q-input type="number" v-model.number="daemon.trigger.condition.min" :label="$t('min')" />
                          </div>
                          <div v-else-if="daemon.trigger.triggerType === 'IfContextExists'">
                            {{$t('trigger.IfContextExists')}}
                            <q-select v-model="daemon.trigger.condition.asClass" :options="AsClassList" label="asClass" />
                            <q-select v-model="daemon.trigger.condition.asRole" :options="AsRoleList" label="asRole" />
                          </div>
                            <div v-else-if="daemon.trigger.triggerType === 'IfSummaryCounterOver'">
                              {{$t('trigger.IfSummaryCounterOver')}}
                              <q-input type="number" v-model.number="daemon.trigger.condition.countMax" :label="$t('convNum')" />
                            </div>
                            <div v-else-if="daemon.trigger.triggerType === 'IfExtTalkCounterOver'">
                              {{$t('trigger.IfExtTalkCounterOver')}}
                              <q-input type="number" v-model.number="daemon.trigger.condition.countMax" :label="$t('convNum')" />
                            </div>
                          <div v-else-if="daemon.trigger.triggerType === 'TimerMin'">
                            {{$t('trigger.TimerMin')}}
                            <q-input type="number" v-model.number="daemon.trigger.condition.min" :label="$t('min')" />
                            <q-toggle v-model="daemon.trigger.condition.isRepeatMin" :label="$t('loop')"/>
                          </div>
                          <div v-else-if="daemon.trigger.triggerType === 'DayTimeDirect'">
                            {{$t('trigger.DayTimeDirect')}}
                            <q-input type="time" v-model="daemon.trigger.condition.time" :label="$t('time')" />
                          </div>
                          <div v-else-if="daemon.trigger.triggerType === 'DateTimeDirect'">
                            {{$t('trigger.DateTimeDirect')}}
                            <q-input type="date" v-model="daemon.trigger.condition.date" :label="$t('date')" />
                            <q-input type="time" v-model="daemon.trigger.condition.time" :label="$t('time')" />
                          </div>
                          <div v-else>
                            {{daemon.trigger.triggerType}}
                            {{$t('trigger.selectCondition')}}
                          </div>
                          </div>

                        </div>
                        <div class="col-8">
                          <div class="q-ma-md q-pa-md shadow-2">
                            {{$t('execution')}}
                            <q-select v-model="daemon.exec.generator" :options="generatorList" options-dense :label="$t('generatorName')" />
                            <q-toggle v-model="daemon.exec.addDaemonGenToContext" :label="$t('selectContextLine')"/>
                            <q-input type="textarea" class="q-ma-md" v-model="daemon.exec.templateGeneratePrompt" label="Generator prompt template" outlined :disable="daemon.exec.generator == 'emptyText'" />
                            <div>{{$t('outputContextAttr')}}</div>
                            <div class="row">
                            <q-select v-model="daemon.exec.setting.toClass" :options="AsClassList" options-dense :label="$t('outputClass')" class="col-6" />
                              <q-select v-model="daemon.exec.setting.toRole" :options="AsRoleList" options-dense :label="$t('outputRole')" class="col-6" />
                              <q-select v-model="daemon.exec.setting.toContext" :options="AsContextLinesList" options-dense :label="$t('outputContext')" class="col-6" />
                            </div>
                          </div>
                        </div>
                        </div>
                      </q-card>
                    </q-tab-panel>
                    </q-tab-panels>
                  </div>
                </q-tab-panel>

                <q-tab-panel name="websocket">
                  <div class="text-h6 q-mb-md">{{$t('avatarCommunication')}}</div>
                  <q-toggle v-model="editingSettings!.general.useSocket" :label="$t('useWebSocketCommunication')" />
                  <q-input v-model="editingSettings!.general.remoteServer"
                           :disable="!(editingSettings!.general.useSocket)"
                           :label="$t('remoteServerAddress')" />
                </q-tab-panel>
              </q-tab-panels>
            </template>

          </q-splitter>
        </div>
      </q-card-section>
<q-card-section class="row">
  <q-input type="textarea" :model-value="errorMes" readonly class="col-11" style="height: 60px"/>
  <div v-if="saving">reset and saving...</div>
  <q-btn flat :label="t('close')" @click="saveAndClose" class="col-1"/>
</q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>

</style>
