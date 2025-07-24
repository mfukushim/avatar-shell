<script setup lang="ts">

import {onMounted, ref} from 'vue';
import AvatarSettingPanel from './AvatarSettingPanel.vue';
import {copyAvatarConfig, deleteAvatarConfig, getAvatarConfigList} from '@app/preload';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();


const show = ref(false);

const alert = ref(false);
const selAlert = ref(false);

const message = ref('');

const selectAvatar = ref();

const avatarList = ref<{label: string, value: string}[]>([])

const open = async (templateId?:string) => {
  const list = await getAvatarConfigList()
  avatarList.value = list.map(e => ({value: e.templateId, label: e.name}))
  const select = templateId ? avatarList.value.find(e => e.value === templateId) : undefined
  if (avatarList.value.length > 0) {
    selectAvatar.value = select || avatarList.value[0]
  }
  console.log(avatarList.value);
  show.value = true;
};

const settingOpen = async () => {
  const selectAvatarId = selectAvatar.value.value;
  await settingDialog.value.doOpen(selectAvatarId)
}

const copyOpen = async () => {
  const templateId = selectAvatar.value.value;
  const nextTemplateId = await copyAvatarConfig(templateId)
  await settingDialog.value.doOpen(nextTemplateId)
}

const deleteAvatarTemplate = async () => {
  message.value = t('deleteAvatarConfirm', {name: selectAvatar.value.label})
  selAlert.value = true;
}

const doDelete = async () => {
  selAlert.value = false;
  const templateId = selectAvatar.value.value;
  message.value = await deleteAvatarConfig(templateId)
  alert.value = true
}

const alartClose = async () => {
  alert.value = false;
  selAlert.value = false;
  await open()
}

const settingDialog = ref()

onMounted(async () => {
});
</script>

<template>
  <q-icon name="manage_accounts" size="30px" class="q-pa-sm" @click="open">

    <q-dialog v-model="show">
      <q-card style="width: 1000px">
        <q-card-section>
          <div class="text-h6">{{ t('avatarTemplateEdit') }}</div>
        </q-card-section>

        <q-card-section class="q-pa-md q-ma-sm">
          <q-select v-model="selectAvatar" :options="avatarList" :label="t('editAvatarTemplate')">
            <template v-slot:after>
              <q-btn icon="edit" :label="t('edit')" @click="settingOpen" :disable="!selectAvatar"/>
            </template>
          </q-select>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md q-ma-sm text-primary">
          <q-btn :label="t('copyAndAdd')" @click="copyOpen" icon="add"></q-btn>
          <q-btn :label="t('delete')" icon="delete" @click="deleteAvatarTemplate" :disable="!selectAvatar || avatarList.length <= 1"></q-btn>
          <q-space/>
          <q-btn :label="t('close')" @click="show = false"></q-btn>
        </q-card-actions>
      </q-card>
    </q-dialog>
    <AvatarSettingPanel  ref="settingDialog" @done="open"/>
    <q-dialog v-model="selAlert" persistent transition-show="scale" transition-hide="scale">
      <q-card>
        <q-card-section>
          {{message}}
        </q-card-section>
        <q-card-actions>
          <q-btn @click="doDelete">{{ t('delete') }}</q-btn>
          <q-btn @click="alartClose">{{ t('cancel') }}</q-btn>
        </q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog v-model="alert" persistent transition-show="scale" transition-hide="scale">
      <q-card>
        <q-card-section>
          {{message}}
        </q-card-section>
        <q-card-actions>
          <q-btn @click="alartClose">{{ t('ok') }}</q-btn>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-icon>
</template>

<style scoped>

</style>
