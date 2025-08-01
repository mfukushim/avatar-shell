# Avatar-Shell

### アバター/メディア指向 高機能MCPクライアント 

Japanese / [English](./README.md)

アバター/メディア指向の高機能MCPクライアントです。

注意: まだ動作が安定していない部分があります。またデーモン処理付近で大きく仕様を変更する場合があります。

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

準備中

<img width="600" alt="スクリーンショット 2025-07-28 200329" src="https://github.com/user-attachments/assets/59cc4ae5-aa2e-4f72-95be-3a8c77bde911" />


### MCP設定

準備中

### コンテキストジェネレーター

準備中

### コンテキストデーモン

準備中

### エコーデーモン

準備中

<img width="600" alt="スクリーンショット 2025-06-15 020826" src="https://github.com/user-attachments/assets/d03dcdcb-5e54-4a99-acb4-ae7b492f6ce6" />
