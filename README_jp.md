# Avatar-Shell

### アバター/メディア指向 高機能MCPクライアント 

Japanese / [English](./README.md)

アバター/メディア指向の高機能MCPクライアントです。

> 注意: 近日中に破壊的変更として、いくつかの機能の配置を大きく変更します。  
> 「ジェネレーター」の設定はアバター設定側に移動し、既存の「ジェネレーター」は「モデル」に変更します。  
> アバターAIがコンテキストを中心として複数のジェネレーターの集合体で構成される関係性をより明確化する予定です。

> MCP Appsを暫定的にサポートしました。  
> 簡素なMCP Appsは動作します。それにともない従来のMCP-UIのサポートははずしています。(実装にはMCP-UI AppRendererを使用)  
> 将来的にはMCP Appsに統一予定です。

> 暫定的な対策としてLLM設定に cutoffChatLimit を追加しました。  
> 強制的にコンテキストを切り詰めることでトークンの消費量を抑制します。    

> LM Studio API (OpenAI互換モード)をサポートしました。

> Note: 以前の版を使っている方で、動作が不安定になった方はSystemSetting > initialize で一旦設定の初期化をお願いします。  
> デーモンの検出条件を変更しました。動作が不安定になった場合は申し訳ありませんが設定を初期化してください。


## 機能

- Windows/Mac OS/Linux Desktopモード (Raspberry pi Desktop)で動作します。
- 問題解決のためのエージェントではなく、複数の独立したアバターを実行する方向のMCPクライアントです
- 生成画像を常時表示するなど、画像の表示を優先しています。
- 会話はAI側の会話を優先し、その他の表示をフィルタすることができます。
- 複数のAIアバター、クローンアバターを実行することができます。
- 複数のAIアバター同士で会話通信することができます。
- MCPの各関数には細かく制限を設定することができます。
- コンテキストジェネレーターという考え方で、複数のLLM、画像生成、音声再生などをまとめています。
現在の版ではGPT(テキスト,画像,音声),Claude(テキスト),Gemini(テキスト,画像,音声)のジェネレーターを持ちます。
- コンテキストデーモンという考え方で、設定した条件でコンテキストジェネレーターを起動します。
- エコーデーモンという考え方で、LLMが自身の判断で擬似的な意志行動を実行できます。

https://note.com/marble_walkers/n/nf3e2a277c061

## インストール

一般的なelectronアプリと同様に、Releaseから各機種対応のアーカイブをダウンロードし、各機器上で実行してください。

- windows  
avatar-shell-x.x.x-release.xxxx-win-x64.exe を開く。  
インストーラー形式ですのでそのまま実行してください。
- mac os  
  avatar-shell-x.x.x-release.xxxx-mac-arm64.dmg を開く。  
  インストーラー形式ですのでそのまま実行してください。  
Intel Macしか手元にないのでarm Macは未確認
- Ubuntu Desktop/Raspberry pi Desktop (Desktop UI環境が必須です)  
  sudo apt install ./avatar-shell-x.x.x-release.xxxx-linux-arm64.deb  
  インストーラー形式ですのでそのまま実行してください。  
ubuntu 22とRaspberry pi 4で確認中

## Wizard画面

初期設定をわかりやすくするため、起動後初回には基本設定のみを行うチュートリアル画面が出ます。  
Avatar-Shellの特徴である、テキスト-画像-音声の組み合わせを体験していただくために、3つの設定がしやすいGoogle geminiで最初設定します。  
Google geminiのAPI keyをGoogleのサイトより取得してください。
他のLLMについては、システム設定、アバター設定より追加してみてください。


## 画面解説

<img width="600" alt="スクリーンショット 2025-07-28 200329" src="./page_images/img.png" />

- title bar
  - daemon status/on-off コンテキストデーモンの動作を全体でon/offする
  - socket status/on-off ソケット通信をon/offする  
  - sound volume 音声ボリューム
  - conversation browser 過去の会話データ/メディアデータをブラウジングする
- tools bar
  - avatar list/add   現在のアバター名と、クローンアバターの追加
  - daemon schedule   実行中のコンテキストデーモン一覧
  - avatar setting   アバター設定
  - system setting   システム設定
- main window
  - image area   画像エリア
  - conversation area   会話エリア
  - jump to bottom   末尾移動
  - show details   詳細表示
  - show find bar   検索バー表示
  - conversation selector   会話情報セレクタ
  - find bar (hidden)   検索バー (デフォルト非表示)
- input bar
  - tools bar show/hide   ツールバー表示/非表示
  - MCP resource selector   MCPリソース選択
  - input file selector   ファイル選択
  - input text   対話テキスト入力
  - conversation area show/hide   会話エリア切替(多段)

## コンセプト  

### コンテキストジェネレーター

本システムでは、タイムラインに文脈(会話文、生成画像など)を追加する機能を持つ部品を「コンテキストジェネレーター」と呼んでいます。  
LLM/SLMもコンテキストジェネレーターです。

### コンテキストデーモン

AvatarShellでのコンテキストデーモンとは特定条件で起動するコンテキストジェネレーターと定義しています。
特定の条件を設定して、コンテキストジェネレーターを呼び出します。  
Avatar-Shellはコンテキストデーモンの組み合わせで会話構造を制御します。

例:  
- 「人から話しかけられたら、そのときの文脈からLLMを起動して、返事を作る」
- 「LLMが返答文を作ったら、音声合成AIを起動して返答文を音声ファイルに変換する」
- 「会話が1分空いたら『今までの文脈に対して閑話休題の話題を作って話しかけなさい』という指示をLLMに行ってください」
- 「(vector db等で検索して)会話に関連する語/表現が含まれているとき、その語に対する補足情報をLLMの入力に追加して、返答文を作る」


### エコーデーモン

AIが内蔵MCPサーバーに提出した予定を、人の入力のようにAvatar-Shellに再入力することで、擬似的自我をシミュレートします。
注意: 本機能は過大な権限の昇格を発生します。危険性を把握して自己リスクで利用を判断してください。

コンテキストジェネレーター、コンテキストデーモン、エコーデーモンの概念については以下のページでも説明しています(日本語)

https://note.com/marble_walkers/n/nb7930d95c2d3

### MCP Apps  

MCP公式の仕様の確定に伴い、UI処理部分はMCP Appsに統一予定です。  
MCP-UI AppRendererを使い、現時点、簡素なMCP Appsは動作可能です。  

https://github.com/modelcontextprotocol/ext-apps のいくつかのサンプルは動作することを確認しています。  

以下のMCP AppsサーバーはAvatar-Shellに最適化されています。
                                                                                                                                  
- リバーシMCP Apps https://github.com/mfukushim/reversi-mcp-apps  




## ガイド  

https://note.com/marble_walkers/n/nf3e2a277c061  
https://note.com/marble_walkers/n/nb7930d95c2d3  
https://note.com/marble_walkers/n/nd702134c8f52  
https://note.com/marble_walkers/n/n12b4caae21d8  
https://note.com/marble_walkers/n/n6f460f490898


<img width="600" alt="スクリーンショット 2025-06-15 020826" src="https://github.com/user-attachments/assets/d03dcdcb-5e54-4a99-acb4-ae7b492f6ce6" />
