<script setup lang="ts">

import {ref, onMounted, onBeforeUnmount, watch} from 'vue';
import { ReactMount } from "./reactMount"
import {Client} from '@modelcontextprotocol/sdk/client';
import {type CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {
  McpUiMessageRequest, McpUiMessageResult,
  McpUiOpenLinkRequest,
  McpUiOpenLinkResult,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import {RequestHandlerExtra} from '@mcp-ui/client';

const props = defineProps<{
  htmlResourceJson: string | undefined,
  client: Client,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResult: CallToolResult,
  // sandbox:{url:URL},
  onOpenLink?: (params: McpUiOpenLinkRequest['params'], extra: RequestHandlerExtra) => Promise<McpUiOpenLinkResult>
  onMessage?: (params: McpUiMessageRequest['params'], extra: RequestHandlerExtra) => Promise<McpUiMessageResult>
}>();

const emit = defineEmits<{
  (e: 'onOpenLink', url: string): void
  // (e: 'onUiAction', mes: CustomEvent): void
}>()

const sandboxUrl = new URL('/sandbox_proxy.html', window.location.origin);

const host = ref<HTMLElement | null>(null)
let react: ReactMount | null = null


onMounted(() => {
  if (!host.value) return
  react = new ReactMount(host.value)
  react.render({
    client: props.client,
    toolName: props.toolName,
    toolInput: props.toolInput,
    toolResult: props.toolResult,
    sandbox: {url:sandboxUrl},
    onOpenLink: async (param ) => {
      // Validate URL scheme before opening
      if (param.url.startsWith('https://') || param.url.startsWith('http://')) {
        window.open(param.url);
      }
      return {} as McpUiOpenLinkResult
    },
    onMessage: async (params) => {
      console.log('Message:', params)
      return {} as McpUiMessageResult
    }
  })
})

watch(() => [props.toolInput, props.toolResult], () => {
  react?.render({
    client: props.client,
    toolName: props.toolName,
    toolInput: props.toolInput,
    toolResult: props.toolResult,
    sandbox: {url:sandboxUrl},
    onOpenLink: async (param ) => {
      // Validate URL scheme before opening
      if (param.url.startsWith('https://') || param.url.startsWith('http://')) {
        window.open(param.url);
      }
      return {} as McpUiOpenLinkResult
    },
    onMessage: async (params) => {
      console.log('Message:', params)
      return {} as McpUiMessageResult
    }
  })
})

onBeforeUnmount(() => {
  react?.unmount()
  react = null
})

/*
import {onMounted, ref} from 'vue';

const props = defineProps<{
  htmlResourceJson: string | undefined,
}>();

const emit = defineEmits<{
  (e: 'onUiAction', mes: CustomEvent): void
}>()
*/



/*
const rendererRef = ref<HTMLElement | null>(null);

onMounted(() => {
  if (rendererRef.value) {
    rendererRef.value?.addEventListener('onUIAction', (event:any) => {
      // console.log('onUIAction',event);
      if(event.detail.type === 'size-change' || event.detail.type === 'ui-size-change') {
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
*/
</script>

<template>
  <div ref="host" style="width:100%; height:600px"></div>
<!--
  <ui-resource-renderer
    ref="rendererRef"
    :resource="props.htmlResourceJson"
    style="display:block;width:100%;height:600px;border:2px solid green;background-color: white;"
  ></ui-resource-renderer>
-->

</template>

<style scoped>

</style>
