<script setup lang="ts">

import {ref, onMounted, onBeforeUnmount, watch, toRaw} from 'vue';
import { ReactMount } from "./reactMount"
import {type CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {
  McpUiMessageRequest,
  McpUiMessageResult,
  McpUiOpenLinkResult,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import short from 'short-uuid';
import {callMcpToolDirect} from '@app/preload';

const props = defineProps<{
  toolName: string,
  // toolResourceUri: string,
  toolInput: Record<string, unknown>,
  toolResult: CallToolResult,
  html:string,
  genId: string,
  // onOpenLink?: (params: McpUiOpenLinkRequest['params'], extra: RequestHandlerExtra) => Promise<McpUiOpenLinkResult>
  // onMessage?: (params: McpUiMessageRequest['params'], extra: RequestHandlerExtra) => Promise<McpUiMessageResult>
  // htmlResourceJson: string | undefined,
}>();

const emit = defineEmits<{
  (e: 'appendInput', mes: McpUiMessageRequest["params"]): void
}>()
/*
const emit = defineEmits<{
  (e: 'onOpenLink', url: string): void
  // (e: 'onUiAction', mes: CustomEvent): void
}>()
*/

watch(props, () => {
  console.log('props.toolInput:', toRaw(props.toolInput));
  console.log('props.toolResult:', toRaw(props.toolResult));
  if (!react.value) {
    return
  }
  react.value?.render({
    // client: props.client,
    toolName: props.toolName,
    // toolResourceUri:"ui://my-server/widget",
    sandbox: {url:sandboxUrl},
    html:props.html,
    /*
        onReadResource:async ({ uri }) => {
          // Fetch the resource from your backend
          const text = await readDocMedia(uri);
          // calledMcpUiName.value = ui.content?.toolName || ''
          return {
            contents:[{
              uri: uri,
              mimeType: 'text/html',
              text
            }]
          };
          // const response = await fetch(`/api/mcp/resources?uri=${encodeURIComponent(uri)}`);
          // return response.json();
        },
    */
    onCallTool:async (params) => {
      // Proxy tool calls through your backend
      //  TODO toolを直起動にする
      const names = props.toolName.split('_')
      const toolName = names.length > 0 ? names[0] +'_'+params.name : ''
      console.log('toolName',props.toolName,toolName);
      const id = short.generate()
      try {
        const res = await callMcpToolDirect({
          callId: id,
          // callId: calledMcpUiCallId.value, //  TODO この扱いでよいか確認要
          name: toolName,
          input: params.arguments || {},
        })
        console.log('callMcpToolDirect res',res);
        return res.results
      } catch (e) {
        console.log('callMcpToolDirect error',e);
      }
      return {} as CallToolResult

      // const response = await fetch('/api/mcp/tools/call', {
      //   method: 'POST',
      //   body: JSON.stringify(params),
      // });
      // return response.json();
    },
    toolInput: toRaw(props.toolInput),

    toolResult: toRaw(props.toolResult),
    onOpenLink: async (param ) => {
      // Validate URL scheme before opening
      if (param.url.startsWith('https://') || param.url.startsWith('http://')) {
        window.open(param.url);
      }
      return {} as McpUiOpenLinkResult
    },
    onMessage: async (params) => {
      console.log('Message:', params)
      emit('appendInput', params)
      return {} as McpUiMessageResult
    },
    onSizeChanged: (params) => {
      // Handle size change notifications
      console.log('Size changed:', params);
    }
  });

})

const sandboxUrl = new URL('/sandbox_proxy.html', window.location.origin);

const host = ref<HTMLElement | null>(null)
const react = ref<ReactMount | null>(null)// = null


onMounted(() => {
  if (!host.value) return
  react.value = new ReactMount(host.value)
})

/*
watch(() => [props.toolInput, props.toolResult], () => {
  react.value?.render({
    // client: props.client,
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
    },
    onSizeChanged: (params) => {
    // Handle size change notifications
    console.log('Size changed:', params);
  },
    hostContext: {
      "theme": "dark",
      "styles": {
        "css": {
          "fonts": "@font-face { font-family: \"Custom Font Name\"; src: url(\"https://...\"); }"
        }
      },
      "displayMode": "inline",
      "containerDimensions": { "width": 400, "maxHeight": 600 }
    }
  })
})
*/

onBeforeUnmount(() => {
  react.value?.unmount()
  react.value = null
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
