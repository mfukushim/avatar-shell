<script setup lang="ts">
import {minimize, toggleMaximize, closeApp, onSocketState, setSocketConnect} from '@app/preload';
import VolumePanel from './VolumePanel.vue';
import {onMounted, ref} from 'vue';
import ImageSelector from './ImageSelector.vue';
import type {AsMessage} from '../../../common/Def.ts';

const props = defineProps<{
  name: string,
}>();

const emit = defineEmits<{
  (e: 'toggleDrawer'): void,
  (e: 'changeDoc',mes: AsMessage[]): void,
  (e: 'changeImage',url: string,mime:string): void,
}>()


const showSchedule = ref("daemon")
const showCom = ref("wifi_off")
const toggleSchedule = () => {
  showSchedule.value = showSchedule.value === "schedule" ? "update_disabled" : "schedule"
}
const toggleCom = () => {
  showCom.value = showCom.value === "wifi" ? "wifi_off" : "wifi"
  setSocketConnect(showCom.value === "wifi")
}
const showVolume = ref("volume_up")
const showImageSelect = ref(false)
const toggleImageSelect = () => {
  showImageSelect.value = !showImageSelect.value
}


const changeDoc = (doc: AsMessage[]) => emit('changeDoc',doc)
const changeImage = (url: string,mime:string) => emit('changeImage',url,mime)

onMounted(async () => {
  onSocketState(state => {
    if (state) {
      showCom.value = "wifi"
    } else {
      showCom.value = "wifi_off"
    }
  })
})

</script>

<template>
  <q-header elevated class="bg-blue-grey-9 text-white" height-hint="10">
    <q-bar class="q-electron-drag">
      <q-icon name="face" @click="emit('toggleDrawer')"/>
      <div>{{props.name}} - Avatar Shell</div>

      <q-space />

      <q-btn dense flat :icon="showSchedule" @click="toggleSchedule" />
      <q-btn dense flat :icon="showCom" @click="toggleCom" />
      <q-btn dense flat :icon="showVolume" >
        <q-popup-proxy :offset="[-100, 10]">
          <VolumePanel style="width: 300px" />
        </q-popup-proxy>
      </q-btn>
      <q-btn dense flat icon="search" @click="toggleImageSelect" />
      <q-btn dense flat  />
      <q-btn dense flat icon="minimize" @click="minimize" />
      <q-btn dense flat icon="crop_square" @click="toggleMaximize" />
      <q-btn dense flat icon="close" @click="closeApp" />
    </q-bar>
    <ImageSelector v-if="showImageSelect" @change-doc="changeDoc" @change-image="changeImage"></ImageSelector>
  </q-header>
</template>
<style scoped>

</style>
