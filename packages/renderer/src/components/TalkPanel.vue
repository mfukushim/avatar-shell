<script setup lang="ts">
import {nextTick, onMounted, reactive, ref, watch} from 'vue';
import type { AsMessage} from '../../../common/Def.ts';
import type {QVirtualScroll} from 'quasar';
import dayjs from 'dayjs';
import {getMediaUrl} from '@app/preload';
import type {AsClass, AsRole} from '../../../common/DefGenerators.ts';

const props = defineProps<{
  timeline: AsMessage[],
  oneMes?: string,
  areaHeight: number,
  forceUpdate: boolean,
  avatarName: string,
  userName:string,
  hideControl: boolean,
  runningMarks:string[],
}>();

const emit = defineEmits<{
  (e: 'select', mes: AsMessage): void
  // (e: 'openMenu'): void
}>()

const text = ref('');

const data = ref<AsMessage[]>([]);

watch(props.timeline, async () => {
  await updateExt();
},{deep: true});

watch(() => props.forceUpdate, async () => {
  await updateExt();
})

const updateExt = async () => {
  data.value = props.timeline.filter(value => isShow(value.asClass,value.asRole));
  await nextTick();
  // console.log('watch num:', data.value.length, tableRef.value);
  tableRef.value?.scrollTo(data.value.length - 1);
  for (const v of props.timeline) {
    if (v.content?.mimeType && v.content?.mediaUrl) {
      // console.log(v);
      const url = await getMediaUrl(v.content.mimeType,v.content.mediaUrl);
      if (url) {
        imageCache.value[v.id] = url;
        // console.log('cache:',v.id,url.slice(0,20),);
      }
    }
  }

}

onMounted(async () => {
  await nextTick();
  if (box.value) {
    console.log('mount talk panel height',box.value );
    boxHeight.value = box.value.getBoundingClientRect().height
  }
});

const flag = reactive({
  showAssistant: true,
  showUser: false,
  showOnline: true,
  showSchedule: false,
  showAll: false,
});
//        v-if="isShow(item.asRole)"


const isShow = (asClass:AsClass,asRole: AsRole) => {
  // if(flag.showAssistant && (asClass === "talk" || asClass === "system" || asClass === 'daemon') && asRole === 'bot') return true
  let showFlag = false;
  if(flag.showAll) {
    return true;
  }
  if(asClass === 'daemon' && flag.showSchedule) {
    showFlag = true;
  }
  if(asClass === 'com' && flag.showOnline) {
    showFlag = true;
  }
  if (flag.showUser) {
    if(asClass === 'talk' && asRole === 'human') showFlag = true;
    // if(asClass === 'com' && asRole === 'human') showFlag = true;
  }
  if(flag.showAssistant) {
    if(asClass === 'talk' && asRole === 'bot') showFlag = true;
    // if(asClass === 'com' && asRole === 'bot') showFlag = true;
  }
  return showFlag;
  // if(asClass === 'system' && flag.showShowSystem || (asRole === 'system' && flag.showShowSystem)) {}return true;
  // if(asClass === 'com' && !flag.showOnline) return false; //  todo ユーザ識別入れるか
  // return (asClass !== 'system' && (asRole === 'bot' && flag.showAssistant || asRole === 'human' && flag.showUser || asRole === 'tools' && flag.showScedule))
};

const pickItem = (item: AsMessage) => {
  //  何か処理あるか
  console.log('pickItem', item);
  emit('select', item);
}

const getItemType = (item: AsMessage) => {
  if (item.content.mediaUrl && item.content.mimeType) {
    return item.content.mimeType.split('/')[0];
  }
  if (item.content.toolData) {
    return 'toolCall';
  }
  if (item.content.text) {
    return 'text';
  }
}

const tableRef = ref<QVirtualScroll>();
const showTextFind = ref(false);
const showInfo = ref(false);
const box = ref<HTMLElement | null>(null);
const boxHeight = ref<Number>(500);
const imageCache = ref<Record<string,string>>({});

</script>

<template ref="box">
  <div >
    <q-virtual-scroll
      ref="tableRef"
      :style="`max-height: ${props.areaHeight-50}px;`"
      :items="data"
      component="q-list"
      separator
      v-slot="{ item }"
      class="q-pa-md"
    >
      <div :class="showInfo ? 'shadow-2 q-ma-sm q-pa-sm':''" @click="pickItem(item)">
<!--
        <q-card @click="pickItem(item)" :bordered="showInfo">
-->
        <div class="row" v-if="showInfo">
          <q-chip dense >{{item.content.from}}</q-chip>
          <q-chip dense >{{getItemType(item)}}</q-chip>
          <div >{{item.asClass}}/{{item.asRole}}</div>
          <div >{{item.content.toolName}}</div>
          <q-space/>
          <div class="text-caption">{{dayjs(item.tick).format('YYYY-MM-DD HH:mm:ss')}}</div>
        </div>
        <q-markdown :no-blockquote="false" v-if="item.content.text" :src="item.content.text" />
        <q-img v-if="getItemType(item) == 'image'"  :src="imageCache[item.id]"/>
        <div v-if="getItemType(item) == 'toolCall'">{{JSON.stringify(item.content.toolData)}}</div>
<!--
        </q-card>
-->
      </div>
    </q-virtual-scroll>
    <div class="q-pa-md" >
      <div v-if="oneMes" >
        {{ oneMes }}
      </div>
      <q-chip color="red" text-color="white" dense :model-value="runningMarks.length > 0" >
        Running {{runningMarks.length}}
      </q-chip>
    </div>
    <div class="q-pa-sm" v-if="!props.hideControl">
      <q-toggle
        v-model="showInfo"
        dense
        label="詳細"
      />
      <q-toggle
        v-model="showTextFind"
        dense
        label="検索"
        class="q-px-sm"
      />

      <q-chip color="primary" text-color="white" dense v-model:selected="flag.showAssistant" @click="updateExt">
        {{ avatarName }}
      </q-chip>
      <q-chip color="teal" text-color="white" dense v-model:selected="flag.showUser" @click="updateExt">
        {{userName}}
      </q-chip>
      <q-chip color="teal" text-color="white" dense v-model:selected="flag.showOnline" @click="updateExt">
        Telecom
      </q-chip>
      <q-chip color="teal" text-color="white" dense v-model:selected="flag.showSchedule" @click="updateExt">
        Daemon
      </q-chip>
      <q-chip color="teal" text-color="white" dense v-model:selected="flag.showAll" @click="updateExt">
        All
      </q-chip>
      <q-input outlined bottom-slots v-model="text" label="Label" counter maxlength="12" dense v-if="showTextFind">
        <template v-slot:before>
          <q-icon name="flight_takeoff" />
        </template>

        <template v-slot:append>
          <q-icon v-if="text !== ''" name="close" @click="text = ''" class="cursor-pointer" />
          <q-icon name="search" />
        </template>

        <template v-slot:hint>
          Field hint
        </template>
      </q-input>
    </div>
  </div>
</template>
