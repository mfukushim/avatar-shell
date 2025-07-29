Avatar Shellはアバターと画像に指向したデスクトップMCPクライアントです。
https://akibakokoubou.jp
やや複雑なシステムですので、ここでは特徴のわかりやすい設定を手順を追って説明します。
不要な方は閉じて自分で設定してください。

1. gemini LLMの設定
2. アバターの設定

本システムは画像や音声の生成をLLM生成テキストと織り込む使い方を想定しています。
そのためチュートリアルでは画像,音声の生成も一括サポートしているgemini APIを例に説明します。

openAIの会話/画像生成/音声生成、Claude会話も対応しています。  
LLMの設定には現在、OpenAI,Anthropic,geminiを対応しており、ローカルLLM向けにOllama API,ComfyUI API,VoiceVox APIなどその他のAPIも検討中です。  
