<script setup lang="ts">

import {onMounted, ref} from 'vue';

const props = defineProps<{
  htmlResourceJson: string | undefined,
}>();

const emit = defineEmits<{
  (e: 'onUiAction', mes: CustomEvent): void
}>()


const rendererRef = ref<HTMLElement | null>(null);

onMounted(() => {
  if (rendererRef.value) {
    rendererRef.value?.addEventListener('onUIAction', (event:any) => {
      if(event.detail.type === 'size-change') {
        const iframe = document.querySelector('iframe');
        if (iframe) {
          iframe.style.height = event.detail.payload.height;
          if (rendererRef.value) {
            rendererRef.value.style.height = event.detail.payload.height;
          }
        }
        return
      }
      emit('onUiAction', event)
    });
  }
})
</script>

<template>
  <ui-resource-renderer
    ref="rendererRef"
    :resource="props.htmlResourceJson"
    style="display:block;width:100%;height:600px;border:2px solid green;background-color: white;"
  ></ui-resource-renderer>

</template>

<style scoped>

</style>
