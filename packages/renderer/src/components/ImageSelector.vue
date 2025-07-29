<script setup lang="ts">
import {defineComponent, h, onBeforeMount, onMounted, ref} from 'vue';
import {getMediaUrl, readDocList, readDocument} from '@app/preload';
import type {AsMessage} from '../../../common/Def.ts';
import dayjs from 'dayjs';
import {QItemLabel, QItemSection, QSkeleton} from 'quasar';

const emit = defineEmits<{
  (e: 'changeDoc', mes: AsMessage[]): void
  (e: 'changeImage', url: string, mime: string): void
  (e: 'selectSound', url: string, mime: string): void
}>();

const AsyncComponent = defineComponent({
  props: {
    index: Number,
  },

  setup(props) {
    const asyncContent = ref<{top: string, end: string, imageNum: number, textNum: number} | null>(null);

    onBeforeMount(async () => {
      console.log('onBeforeMount:', props.index);
      if (props.index !== undefined) {
        docPreview(docList.value[props.index]).then(value => {
          console.log('calc:', value);
          asyncContent.value = value;
        });
      }
    });

    return () => {
      if (asyncContent.value === Object(asyncContent.value)) {
        return h(QItemSection, {class: 'row'},
          [
            h(QItemLabel, {
                class: 'q-mx-sm text-caption',
              },
              asyncContent.value?.top + '...',
            ),
            h(QItemLabel, {
                class: 'q-mx-sm text-caption',
              },
              '...' + asyncContent.value?.end,
            ),
            h(QItemLabel, {
              class: 'q-mx-sm text-caption',
            }, `text: ${asyncContent.value?.textNum}, image: ${asyncContent.value?.imageNum}`),
          ],
        );
      }

      const content = [
        h(QSkeleton, {
          class: 'on-left on-right',
          animation: 'none',
          type: 'text',
          width: '150px',
          height: '100px',
        }),
      ];

      return h('div', {
        class: `row no-wrap items-center q-mx-sm`,
        style: 'height: 78px',
        key: props.index,
      }, content);
    };
  },
});

const TextPreviewLength = 100;

const docList = ref<{label: string, file: string}[]>([]);
const doc = ref<{
  id: string,
  url: string | undefined,
  tick: string,
  label: string,
  mime: string,
}[]>([]);

const docImage = ref<Map<string, string>>(new Map<string, string>());

const getItems = (from: number, size: number) => {
  const items = [];

  for (let i = 0; i < size; i++) {
    items.push(docList.value[from + i]);
  }

  return Object.freeze(items);
};

onMounted(async () => {
  const reg = new RegExp(`^[^_]+_[^_]+_(\\d{4})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})\\.asdata$`);
  const list = await readDocList();
  docList.value = list.reverse().flatMap(v => {
    const match = v.match(reg);
    console.log(v, match);
    return match ? [{
      label: `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`,
      file: v,
      top: '',
      end: '',
    }] : [];
  });
  console.log('docList', docList.value);
});

const logClick = async (item: {label: string, file: string}) => {
  const docData = await readDocument(item.file);
  emit('changeDoc', docData);
  doc.value = docData.filter(v => v.content.mediaUrl).map(value => {
    const mime = value.content?.mimeType || 'unknown/any';
    const label = mime.split('/')[0];
    return {
      id: value.id,
      url: value.content.mediaUrl,
      tick: dayjs(value.tick).format('HH:mm:ss'),
      label,
      mime,
    };
  });
  for (const docDatum of doc.value) {
    if (!docDatum.url) continue;
    const img = await getMediaUrl(docDatum.mime, docDatum.url);
    docImage.value.set(docDatum.id, img);
  }
};

const itemClick = (item: {id: string, url: string | undefined, tick: string, label: string, mime: string}) => {
  console.log('itemClick', item);
  if (!item.url) return;
  if(item.mime.startsWith('image')) {
    emit('changeImage', item.url, item.mime);
  }
  if(item.mime.startsWith('audio')) {
    emit('selectSound', item.url, item.mime);
  }
};

const docPreview = async (item: {label: string, file: string}) => {
  const docData = await readDocument(item.file);
  const block = docData.find(value => {
    if (value.asClass === 'talk' && value.content.text) {
      return true;
    }
  });
  const blockEnd = docData.reverse().find(value => {
    if (value.asClass === 'talk' && value.content.text) {
      return true;
    }
  });
  const imageNum = docData.filter(value => (value.content?.mimeType || '').startsWith('image')).length;
  const textNum = docData.filter(value => value.content?.text).length;

  const text = block?.content?.text;
  return {
    top: text?.slice(0, TextPreviewLength) || '',
    end: blockEnd?.content?.text?.slice(-TextPreviewLength) || '',
    textNum,
    imageNum,
  };
};

</script>

<template>
  <div class="row">
    <div v-if="docList.length === 0" class="q-pa-sm">
      No log
    </div>
    <div class="col-8 q-pa-sm">
      <q-virtual-scroll
        style="max-height: 150px;"
        :items-size="docList.length"
        :items-fn="getItems"
        separator
        v-slot="{ item, index }"
      >
        <q-item
          :key="index"
          dense
          clickable
          @click="logClick(item)"
        >
          <q-item-section>
            <q-item-label>
              {{ item.label }}
            </q-item-label>
            <async-component :key="index" :index="index"></async-component>
          </q-item-section>
        </q-item>
      </q-virtual-scroll>
    </div>
    <div class="col-4 q-pa-sm">
      <q-virtual-scroll
        style="max-height: 150px;"
        :items="doc"
        separator
        v-slot="{ item, index }"
      >
        <q-item
          :key="index"
          dense
          clickable
          @click="itemClick(item)"
        >
          <q-item-section>
            <q-img :src="docImage.get(item.id)" width="64px" v-if="item.label === 'image'">
            </q-img>
            <div v-else-if="item.label === 'audio'">
              <q-icon name="play_circle" color="white" size="64px"/>
            </div>
            <div v-else>
            </div>
          </q-item-section>
          <q-item-section side>
            <q-item-label>
              {{ item.label }} {{ item.tick }}
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-virtual-scroll>
    </div>
  </div>
</template>

<style scoped>

</style>
