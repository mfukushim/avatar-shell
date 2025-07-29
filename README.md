# Avatar-Shell

A multifunctional avatar/media MCP client.  

Note: There are still some parts of the app that are not stable, and there may be major changes to the specifications around daemon processing.

## Specifications

- Runs on Windows/Mac OS/Linux Desktop mode (Raspberry Pi Desktop).
- This is an MCP client designed to run multiple independent avatars, rather than a problem-solving agent.
- Prioritizes image display, such as by always displaying generated images.
- Conversations are prioritized by AI, and other displays can be filtered.
- Multiple AI avatars and clone avatars can be run.
- Multiple AI avatars can communicate with each other.
- Detailed restrictions can be set for each MCP function.
- Context generators are used to combine multiple LLMs, image generation, audio playback, etc.
  The current version includes generators for GPT (text, image, audio), Claude (text), and Gemini (text, image, audio).
- Context daemons are used to launch context generators based on set conditions.
- Echo daemons allow LLMs to perform pseudo-willful actions at their own discretion.


## Install

As with general electron apps, download the archive for each model from Release and run it on each device.  
- windows  
  Open avatar-shell-x.x.x-release.xxxx-win-x64.exe.  
  It's in installer format, so just run it.  
- mac os  
  Open avatar-shell-x.x.x-release.xxxx-mac-arm64.dmg.  
  It's in installer format, so just run it.  
  Note: The author only has a borrowed Intel Mac. Operation on an ARM Mac has not been confirmed.
- Ubuntu Desktop/Raspberry pi Desktop (Desktop UI環境が必須です)  
  sudo apt install ./avatar-shell-x.x.x-release.xxxx-linux-arm64.deb  
  It is in installer format, so just run it.
  Checking on Ubuntu 22 and Raspberry pi 4

## Tutorial Wizard

To make the initial setup easier to understand, a tutorial screen will appear the first time you start the app, allowing you to configure only the basic settings.
To allow you to experience Avatar-Shell's unique combination of text, images, and audio, we will first configure it using Google gemini, which makes it easy to set up these three settings.
Get your Google gemini API key from the Google website.
For other LLMs, try adding them via System Settings or Avatar Settings.


## Screen Description

In preparation

<img width="600" alt="スクリーンショット 2025-07-28 200329" src="https://github.com/user-attachments/assets/59cc4ae5-aa2e-4f72-95be-3a8c77bde911" />

### MCP setting

In preparation

### Context Generator

In preparation

### Context Daemon

In preparation

### Echo Demon

In preparation



<img width="600" alt="スクリーンショット 2025-06-15 020826" src="https://github.com/user-attachments/assets/d03dcdcb-5e54-4a99-acb4-ae7b492f6ce6" />
