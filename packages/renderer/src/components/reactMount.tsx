import React from "react"
import { createRoot, type Root } from "react-dom/client"
import {AppRenderer} from '@mcp-ui/client';
import type {AppRendererProps} from '@mcp-ui/client';

/*
export type AppRendererProps = {
  client: Client,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResult: CallToolResult,
  sandbox:{url:URL},
  onOpenLink?: (params: McpUiOpenLinkRequest['params'], extra: RequestHandlerExtra) => Promise<McpUiOpenLinkResult>
  onMessage?: (params: McpUiMessageRequest['params'], extra: RequestHandlerExtra) => Promise<McpUiMessageResult>
  // message: string
  // count: number
  // onIncrement?: () => void
}
*/

export class ReactMount {
  private root: Root

  constructor(host: HTMLElement) {
    this.root = createRoot(host)
  }

  render(props: AppRendererProps) {
    this.root.render(<AppRenderer {...props} />)
  }

  unmount() {
    this.root.unmount()
  }
}
