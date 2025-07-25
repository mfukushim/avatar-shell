<script setup lang="ts">

import {
  addAvatar,
  calcDefaultName,
  cancelSchedule,
  currentAvatarSetting,
  getScheduleList,
  getUserName, setNames,
} from '@app/preload';
import SysSettingPanel from './SysSettingPanel.vue';
import AvatarSettingSelectPanel from './AvatarSettingSelectPanel.vue';
import {ref, watch} from 'vue';
import {type DaemonTriggerSchema} from '../../../common/Def.ts';


const props = defineProps<{
  disableInput: boolean,
  avatarTemplateList: {label: string, value: string}[]
  avatarName: string,
  userName:string
}>();

const avatarName = ref('')
const userName = ref('')
const readOnlyAvatarName = ref(true)
const readOnlyUserName = ref(true)
const editAvatarIcon = ref('edit')
const editUserIcon = ref('edit')

const scheduleList = ref<{
  status: string,
  list: {id: string, name: string, trigger: DaemonTriggerSchema}[]
}>({status: 'Wait a moment', list: []});

watch(() => props.avatarName, async () => {
  avatarName.value = props.avatarName;
});
watch(() => props.userName, async () => {
  userName.value = props.userName;
});

const cloneAvatar = async () => {
  const avatarSetting = currentAvatarSetting();
  console.log(avatarSetting);
  if (avatarSetting) {
    await addNewAvatar(avatarSetting.templateId);
  }
};

const addNewAvatar = async (templateId: string) => {
  const tempName = await calcDefaultName(templateId);
  await addAvatar(templateId, tempName);
};

const getSchedule = async () => {
  scheduleList.value = await getScheduleList();
};

const editAvatar = async () => {
  if (readOnlyAvatarName.value) {
    readOnlyAvatarName.value = false;
    editAvatarIcon.value = 'done'
  } else {
    if(avatarName.value === '' || avatarName.value === props.avatarName) {
      avatarName.value = props.avatarName;
    } else {
      await setNames({avatarName:avatarName.value})
    }
    readOnlyAvatarName.value = true;
    editAvatarIcon.value = 'edit'
  }
}

const editUser = async () => {
  if (readOnlyUserName.value) {
    readOnlyUserName.value = false;
    editUserIcon.value = 'done'
  } else {
    if(userName.value === '' || userName.value === props.userName) {
      userName.value = getUserName();
    } else {
      await setNames({userName:userName.value})
    }
    readOnlyUserName.value = true;
    editUserIcon.value = 'edit'
  }
}


</script>

<template>
  <q-icon name="face" size="30px" class="q-pa-sm">
    <q-menu
      anchor="top right"
      self="top left"
    >
      <q-list style="min-width: 100px">
        <q-item>
          <q-item-section>
            <q-input v-model="avatarName" label="Avatar Name" :disable="props.disableInput" :outlined="!readOnlyAvatarName" :readonly="readOnlyAvatarName">
              <template v-slot:append>
                <q-btn round dense flat :icon="editAvatarIcon" @click="editAvatar"/>
              </template>
            </q-input>
            <q-input v-model="userName" label="User Name" :disable="props.disableInput" :outlined="!readOnlyUserName"  :readonly="readOnlyUserName">
              <template v-slot:append>
                <q-btn round dense flat :icon="editUserIcon" @click="editUser"/>
              </template>
            </q-input>
          </q-item-section>
        </q-item>
        <q-item clickable v-close-popup @click="cloneAvatar" :disable="props.disableInput">
          <q-item-section>Clone Avatar...</q-item-section>
        </q-item>
        <q-item clickable :disable="props.disableInput">
          <q-item-section>Select Avatar Template...</q-item-section>
          <q-item-section side>
            <q-icon name="keyboard_arrow_right" />
          </q-item-section>

          <q-menu anchor="top end" self="top start" auto-close>
            <q-list>
              <q-item
                v-for="n in avatarTemplateList"
                :key="n.value"
                dense
                clickable
                :disable="props.disableInput"
                @click="addNewAvatar(n.value)"
              >
                <q-item-section>{{ n.label }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>

        </q-item>
        <q-separator />
      </q-list>
    </q-menu>
  </q-icon>
  <q-icon name="schedule" size="30px" class="q-pa-sm">
    <q-menu
      anchor="top right"
      self="top left"
      @before-show="getSchedule"
    >
      <q-list style="min-width: 100px">
        <q-item>{{ scheduleList.status !== 'ok' ? scheduleList.status : 'Running Echo schedule' }}</q-item>
        <q-item clickable v-close-popup v-for="n in scheduleList.list"
                :key="n.id"
                dense
                @click="cancelSchedule(n.id)">
          <q-item-section>
            <q-item-label>{{ n.name }}</q-item-label>
            <q-item-label>trigger:{{ n.trigger.triggerType }}</q-item-label>
            <q-item-label>{{ n.trigger.condition }}</q-item-label>
          </q-item-section>

          <q-item-section side top>
            <q-icon name="delete" />
<!--
            <q-icon :name="n.isEnabled ? 'flash_on':'flash_off'" />
            <q-icon :name="n.isOnetime? 'repeat_one':'repeat'" />
-->
          </q-item-section>
        </q-item>
        <q-separator />
      </q-list>
    </q-menu>
  </q-icon>
  <q-icon name="collections" size="30px" class="q-pa-sm">
    <q-popup-proxy transition-show="flip-up" transition-hide="flip-down">
    </q-popup-proxy>
  </q-icon>

  <q-separator></q-separator>
  <AvatarSettingSelectPanel />
  <SysSettingPanel />

</template>

<style scoped>

</style>
