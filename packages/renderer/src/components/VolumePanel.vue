<script setup lang="ts">
import {onMounted, ref} from 'vue';

const props = defineProps<{
  volume: number,
}>();

const emit = defineEmits<{
  (e: 'setVolume',vol: number): void,
}>()

const volume= ref(6)

onMounted(async () => {
  console.log('onMounted renderer volume panel');
  volume.value = props.volume*10
})

const update = async () => {
  console.log('update',volume.value)
  emit('setVolume',volume.value/10)
  // await updateMutableSetting({volume: volume.value/10})
}
// const mic = ref(8)
</script>

<template>
  <div class="q-pa-md">
    <q-list dense>
      <q-item>
        <q-item-section avatar>
          <q-icon color="teal" name="volume_up" />
        </q-item-section>
        <q-item-section>
          <q-slider
            v-model="volume"
            :min="0"
            :max="10"
            label
            color="teal"
            @update:model-value="update"
          />
        </q-item-section>
      </q-item>
<!--
      <q-item>
        <q-item-section avatar>
          <q-icon color="primary" name="mic" />
        </q-item-section>
        <q-item-section>
          <q-slider
            v-model="mic"
            :min="0"
            :max="50"
            label
          />
        </q-item-section>
      </q-item>
-->
    </q-list>
  </div>
</template>
<style scoped>

</style>
