

```mermaid

stateDiagram-v2
  Source: Source(input and MCP)
  Generators: Generators (LLMs,voice gen)

  [*] --> Source:start up(wait user input mcp)
  Source --> Generators: MCP responses, or user input
  note left of Generators
    previous context data
  end note
  [*] --> DaemonRule
  DaemonRule --> Generators: Daemon rule exec
  Generators-->Source: MCP requests\n(if no MCP request,\n wait user input mcp)
  Generators-->[*]: stop
  note right of Generators
    output context data(llm text or images)
  end note


```

user input待ちには

userのテキストエンター
userのファイルアップロード

MCP-UIなどのintent(状態変化をLLMに依頼する),notify(状態変化の報告のみ),toolの実行結果 なども含む

もuser inputであり、これらはスプール可能(またはスプール禁止)が可能に作るべき。
