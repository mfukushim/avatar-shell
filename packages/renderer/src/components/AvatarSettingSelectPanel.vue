<script setup lang="ts">

import {onMounted, ref} from 'vue';
import AvatarSettingPanel from './AvatarSettingPanel.vue';
import {copyAvatarConfig, deleteAvatarConfig, getAvatarConfigList, getCurrentAvatarList} from '@app/preload';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const emit = defineEmits<{
  (e: 'resetAvatarList'): void
}>()


const show = ref(false);

const alert = ref(false);
const selAlert = ref(false);

const message = ref('');

const selectAvatar = ref();

const avatarConfigList = ref<{label: string, value: string}[]>([])
const avatars = ref<{id: string, name: string, templateId: string}[]>([])

const open = async (templateId?:string) => {
  const list = await getAvatarConfigList()
  avatars.value = await getCurrentAvatarList()
  avatarConfigList.value = list.map(e => ({value: e.templateId, label: e.name}))
  const select = templateId ? avatarConfigList.value.find(e => e.value === templateId) : undefined
  if (avatarConfigList.value.length > 0) {
    selectAvatar.value = select || avatarConfigList.value[0]
  }
  console.log(avatarConfigList.value);
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
  emit('resetAvatarList')
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

const dialogClose = async () => {
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
          <q-select
            v-model="selectAvatar"
            :options="avatarConfigList"
            :label="t('editAvatarTemplate')"
            data-testid="avatar-select"
          >
            <template v-slot:after>
              <q-btn
                icon="edit"
                :label="t('edit')"
                @click="settingOpen"
                :disable="!selectAvatar"
                data-testid="avatar-edit-btn"
              />
            </template>
          </q-select>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md q-ma-sm text-primary">
          <q-btn
            :label="t('copyAndAdd')"
            @click="copyOpen"
            icon="add"
            data-testid="avatar-copy-btn"
          />
          <q-btn
            :label="t('delete')"
            icon="delete"
            @click="deleteAvatarTemplate"
            :disable="!selectAvatar || avatarConfigList.length <= 1 || avatars.find(value => value.templateId === selectAvatar.value) !== undefined"
            data-testid="avatar-delete-btn"
          />
          <q-space/>
          <q-btn
            :label="t('close')"
            @click="show = false"
            data-testid="avatar-close-btn"
          />
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
          <q-btn @click="doDelete" data-testid="avatar-delete-confirm-btn">{{ t('delete') }}</q-btn>
          <q-btn @click="dialogClose" data-testid="avatar-delete-cancel-btn">{{ t('cancel') }}</q-btn>
        </q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog v-model="alert" persistent transition-show="scale" transition-hide="scale">
      <q-card>
        <q-card-section>
          {{message}}
        </q-card-section>
        <q-card-actions>
          <q-btn @click="dialogClose" data-testid="avatar-alert-ok-btn">{{ t('ok') }}</q-btn>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-icon>
</template>

<style scoped>

</style>
