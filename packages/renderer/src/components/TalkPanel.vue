<script setup lang="ts">
/*! avatar-shell | Apache-2.0 License | https://github.com/mfukushim/avatar-shell */
import {nextTick, onMounted, reactive, ref, watch} from 'vue';
import type {AsMessage} from '../../../common/Def.ts';
import type {QVirtualScroll} from 'quasar';
import dayjs from 'dayjs';
import {findInPage, getMediaUrl, stopAvatar} from '@app/preload';
import type {AsClass, AsContextLines, AsRole} from '../../../common/DefGenerators.ts';

const props = defineProps<{
  timeline: AsMessage[],
  oneMes?: string,
  areaHeight: number,
  forceUpdate: boolean,
  avatarName: string,
  userName: string,
  hideControl: boolean,
  runningMarks: string[][],
}>();

const emit = defineEmits<{
  (e: 'select', mes: AsMessage): void
  (e: 'playVoice', mes: AsMessage): void
  (e: 'clearRunningMarks'): void
}>();

const text = ref('');

const data = ref<AsMessage[]>([]);

const useStore = ['file:','ui:'];

watch(props.timeline, async () => {
  await updateExt();
}, {deep: true});

watch(() => props.forceUpdate, async () => {
  await updateExt();
});

const updateExt = async () => {
  data.value = props.timeline.filter(value => isShow(value.asClass, value.asRole, value.asContext, value?.content?.mimeType));
  await nextTick();
  tableRef.value?.scrollTo(data.value.length - 1);
  for (const v of props.timeline) {
    if (v.content?.mimeType && v.content?.mediaUrl && useStore.some(value => (v.content.mediaUrl || '').startsWith(value))) {
      const url = await getMediaUrl(v.content.mimeType, v.content.mediaUrl);
      if (url) {
        imageCache.value[v.id] = url;
      }
    }
  }

};

onMounted(async () => {
  await nextTick();
  if (box.value) {
    console.log('mount talk panel height', box.value);
    boxHeight.value = box.value.getBoundingClientRect().height;
  }
});

const flag = reactive({
  showAssistant: true,
  showUser: false,
  showOnline: true,
  showMedia: false,
  showDaemon: false,
  showAll: false,
});

const isShow = (asClass: AsClass, asRole: AsRole, asContext: AsContextLines, mimeType?: string) => {
  let showFlag = false;
  const view = asContext === 'surface' || asContext === 'outer';
  if (flag.showAll) {
    return true;
  }
  if (asClass === 'daemon' && flag.showDaemon && view && (!mimeType || mimeType.startsWith('text'))) {
    showFlag = true;
  }
  if (flag.showMedia && (mimeType && !mimeType.startsWith('text'))) {
    showFlag = true;
  }
  if (asClass === 'com' && flag.showOnline) {
    showFlag = true;
  }
  if (flag.showUser) {
    if (view && asRole === 'human') showFlag = true;
  }
  if (flag.showAssistant) {
    if (view && asRole === 'bot' && asClass !== 'daemon' && asClass !== 'system') showFlag = true;
  }
  return showFlag;
};

const pickItem = (item: AsMessage) => {
  //  何か処理あるか
  emit('select', item);
};

const playSound = (item: AsMessage) => {
  emit('playVoice', item);
};

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
};

const infoRunningMark = () => {
  return props.runningMarks.length > 0 ? `Running ${props.runningMarks.length} ${props.runningMarks.map(value => value[1]).join(',')}` : '';
};

const findText = async () => {
  await findInPage(text.value);
};

const scrollBottom = async () => {
  if (tableRef.value) {
    tableRef.value.scrollTo(data.value.length - 1, 'start-force');
  }
};

const stopAvatarBtn = async () => {
  emit('clearRunningMarks');
  await stopAvatar();
}

const filterToolData = (toolData: any) => {
  if (toolData?.content) {
    const content:any[] = toolData.content;
    return content.map(value => {
      if (value.type === 'image') {
        return '[image]';
      }
      if (value.type === 'audio') {
        return '[audio]';
      }
      if(value.type === 'resource') {
        return `[${value.mimeType}]`;
      }
      if(value.type === 'text') {
        return `[text] ${value.text}`;
      }
      return `[unknown ${JSON.stringify(value)}]`;
    }).join(',');
  } else {
    return JSON.stringify(toolData);
  }
}

const tableRef = ref<QVirtualScroll>();
const showTextFind = ref(false);
const showInfo = ref(false);
const box = ref<HTMLElement | null>(null);
const boxHeight = ref<Number>(500);
const imageCache = ref<Record<string, string>>({});

</script>

<template ref="box">
  <div>
    <q-virtual-scroll
      ref="tableRef"
      :style="`max-height: ${props.areaHeight-50}px;`"
      :items="data"
      component="q-list"
      separator
      v-slot="{ item,index }"
      class="q-pa-md"
    >
      <q-item :key="index">
        <div :class="showInfo ? 'shadow-2 q-ma-sm q-pa-sm':''" v-if="!props.hideControl">
          <div class="row" v-if="showInfo">
            <q-chip dense>{{ item.content.from }}</q-chip>
            <q-chip dense>{{ getItemType(item) }}</q-chip>
            <div>{{ item.asClass }}/{{ item.asRole }}/{{ item.asContext }}</div>
            <div>{{ item.genName ? `/${item.genName}`: '' }}</div>
            <div>{{ item.content.toolName }}</div>
            <q-space />
            <div class="text-caption">{{ dayjs(item.tick).format('YYYY-MM-DD HH:mm:ss') }}</div>
          </div>
          <q-markdown :no-blockquote="false" v-if="item.content.text" :src="item.content.text" />
          <q-img v-if="getItemType(item) == 'image'" :src="imageCache[item.id]" @click="pickItem(item)" />
          <q-icon v-if="getItemType(item) == 'audio'" size="32px" name="play_circle" @click="playSound(item)" />
          <q-markdown :no-blockquote="false" v-if="getItemType(item) == 'toolCall' && item.content.toolData" :src="filterToolData(item.content.toolData)" />
        </div>
        <div v-else >
          {{item.content.text.slice(0,3)}}
        </div>
      </q-item>
    </q-virtual-scroll>
    <div class="q-pa-md">
      <div v-if="oneMes">
        {{ oneMes }}
      </div>
      <q-chip color="red" text-color="white" dense :model-value="runningMarks.length > 0" icon="cancel" clickable @click="stopAvatarBtn">
        {{ infoRunningMark() }}
      </q-chip>
    </div>
    <div class="q-pa-sm row" v-if="!props.hideControl">
      <div class="row col-all">
        <q-icon name="vertical_align_bottom" size="md" color="primary" @click="scrollBottom"  class="cursor-pointer" />
        <q-space />
        <q-toggle
          name="showInfo"
          v-model="showInfo"
          dense
          label="詳細" class="q-px-sm"
        />
        <q-toggle
          name="showTextFind"
          v-model="showTextFind"
          dense
          label="検索"
          class="q-px-sm"
        />
      </div>
      <q-chip color="primary" text-color="white" dense v-model:selected="flag.showAssistant" @click="updateExt">
        {{ avatarName }}
      </q-chip>
      <q-chip color="teal" text-color="white" dense v-model:selected="flag.showUser" @click="updateExt">
        {{ userName }}
      </q-chip>
      <q-chip color="teal" text-color="white" dense v-model:selected="flag.showOnline" @click="updateExt">
        Com
      </q-chip>
      <q-chip color="teal" text-color="white" dense v-model:selected="flag.showMedia" @click="updateExt">
        Media
      </q-chip>
      <q-chip color="teal" text-color="white" dense v-model:selected="flag.showDaemon" @click="updateExt">
        Daemon
      </q-chip>
      <q-chip color="teal" text-color="white" dense v-model:selected="flag.showAll" @click="updateExt">
        All
      </q-chip>
      <q-input outlined
               name="inputText"
               bottom-slots
               v-model="text"
               label="Label"
               counter
               maxlength="12"
               @keydown.enter="findText"
               dense
               v-if="showTextFind">
        <template v-slot:append>
          <q-icon v-if="text !== ''" name="close" @click="text = ''" class="cursor-pointer" />
          <q-icon name="search" @click="findText" />
        </template>

        <template v-slot:hint>
          Field hint
        </template>
      </q-input>
    </div>
  </div>
</template>
