<script setup lang="ts">

import {onMounted, ref} from 'vue';
import {doAskAi, getMcpServerInfos, getUserName, type McpResource, readMcpResource} from '@app/preload';
import type {McpInfo, McpResourceInfo} from '../../../common/Def.ts';
import {AsMessage} from '../../../common/Def.ts';

const props = defineProps<{
  disableInput: boolean,
}>();

const emit = defineEmits<{
  (e: 'sent', mes: AsMessage[]): void
}>()

const fileUpload = ref<File|null>(null)
const mcpResource = ref<McpResource|null>(null)
const talkText = ref('')


const mcpServers = ref<McpInfo[]>()

async function sendMessage() {
  const inText = talkText.value;
  talkText.value = '';
  const datas:AsMessage[] = []
  if (inText) {
    datas.push(AsMessage.makeMessage({from: getUserName(), text: inText},'talk','human','surface'));
  }
  if (fileUpload.value) {
    const arrayBuffer = await fileUpload.value.arrayBuffer();
    datas.push(AsMessage.makeMessage({from: getUserName(), mediaBin: arrayBuffer, mimeType:fileUpload.value.type,},'talk','human','surface'));
  }
  if(mcpResource.value) {
    mcpResource.value.contents.forEach(v => {
      if (v.mimeType === 'text/plain' && v.text) {
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(v.text);
        datas.push(AsMessage.makeMessage({from: getUserName(), mediaBin: uint8Array.buffer, mimeType:'text/plain',},'talk','human','inner'))
      } else if (v.mimeType.startsWith('image')) {
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(v.blob);
        datas.push(AsMessage.makeMessage({from: getUserName(), mediaBin: uint8Array.buffer, mimeType:v.mimeType,},'talk','human','inner'))
      }
    })
  }
  await doAskAi(datas);
  fileUpload.value = null;
  mcpResource.value = null;
  // const out = datas.concat(mes) //  TODO ユーザ入力も送ってよいが 長いデータはどうするんだっけ。
  emit('sent', datas);  // 会話した内容をtimelineに設定
  // console.log('ans', mes);
}

const sendTalk = async () => {
  if (talkText.value) {
    await sendMessage();
  }
}
const sendKey = async (event:any) => {
  if (talkText.value && event.keyCode === 13 && event.ctrlKey) {
    await sendMessage();
  }
}

const selectResource = async (name:string,res: McpResourceInfo) => {
  await readMcpResource(name, res.uri)
  // mcpResource.value = await readMcpResource(name, res.uri)
}

onMounted(async () => {
  console.log('onMounted renderer input panel');
  mcpServers.value = await getMcpServerInfos()
  console.log(mcpServers.value);
})

</script>

<template>
  <div class="row ">
    <q-btn color="secondary" icon="text_snippet" >
      <q-menu>
        <q-list style="min-width: 100px">
          <q-item v-for="mcp in mcpServers" :key="mcp.id" clickable>
            <q-item-section>{{ mcp.id }}</q-item-section>
            <q-item-section side>
              <q-icon name="keyboard_arrow_right" />
            </q-item-section>
            <q-menu anchor="top end" self="top start" auto-close>
              <q-list>
                <q-item
                  v-if="mcp.resources.length > 0"
                  v-for="res in mcp.resources"
                  :key="res.name"
                  dense
                  clickable
                  @click="selectResource(mcp.id,res)"
                >
                  <q-item-section>{{res.name}}</q-item-section>
                </q-item>
                <q-item v-else>
                  <q-item-section>No resource</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-item>
        </q-list>
      </q-menu>
    </q-btn>
    <q-file v-model="fileUpload" class="col-1 bg-white q-pa-sm" :disable="props.disableInput">
      <template v-slot:prepend>
        <q-icon name="attach_file" />
      </template>
    </q-file>
    <q-input bottom-slots v-model="talkText" label="talk input" :dense="false" @keydown.enter="sendKey" class="col bg-white q-pa-sm" :disable="props.disableInput">
      <template v-slot:after>
        <q-btn round dense flat @click="sendTalk" icon="send" :disable="props.disableInput"/>
      </template>
    </q-input>
  </div>

</template>

<style scoped>

</style>
