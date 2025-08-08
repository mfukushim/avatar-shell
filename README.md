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

https://note.com/marble_walkers/n/nf3e2a277c061 (Japanese)

## Install

As with general electron apps, download the archive for each model from Release and run it on each device.  
- windows  
  Open avatar-shell-x.x.x-release.xxxx-win-x64.exe.  
  It's in installer format, so just run it.  
- mac os  
  Open avatar-shell-x.x.x-release.xxxx-mac-arm64.dmg.  
  It's in installer format, so just run it.  
  Note: The author only has a borrowed Intel Mac. Operation on an ARM Mac has not been confirmed.
- Ubuntu Desktop/Raspberry pi Desktop (need Desktop UI)  
  sudo apt install ./avatar-shell-x.x.x-release.xxxx-linux-arm64.deb  
  It is in installer format, so just run it.
  Checking on Ubuntu 22 and Raspberry pi 4

## Tutorial Wizard

To make the initial setup easier to understand, a tutorial screen will appear the first time you start the app, allowing you to configure only the basic settings.  
To allow you to experience Avatar-Shell's unique combination of text, images, and audio, we will first configure it using Google gemini, which makes it easy to set up these three settings.  
Get your Google gemini API key from the Google website.  
For other LLMs, try adding them via System Settings or Avatar Settings.


## Screen Description

<img width="600" alt="スクリーンショット 2025-07-28 200329" src="./page_images/img.png" />

- title bar
  - daemon status/on-off  
    Turn context daemon operation on/off globally
  - socket status/on-off  
    Turn socket communication on/off
  - sound volume  
    Audio volume
  - conversation browser  
    Browse past conversation data/media data
- tools bar
  - avatar list/add  
    current avatar info and clone new avatar
  - daemon schedule  
    list of current daemon schedule
  - avatar setting  
    edit avatar setting
  - system setting  
    edit system setting
- main window
  - image area  
    Image display area
  - conversation area  
    Area to display conversations
  - jump to bottom  
    Move to the end
  - show details  
    Detailed display
  - show find bar  
    Search bar display
  - conversation selector  
    Conversation Information Selector
  - find bar  
    Search bar (hidden by default)
- input bar
  - tools bar show/hide  
    Show/hide toolbar
  - MCP resource selector  
    MCP Resource Selection
  - input file selector  
    File Selection
  - input text  
    Dialogue text input
  - conversation area show/hide  
    Conversation area switching (multi-stage)

    
### Context Generator

In this system, components that have the function of adding context (conversational text, generated images, etc.) to the timeline are called "context generators."  
LLM/SLM are also context generators.

### Context Daemon

In AvatarShell, a context daemon is defined as a context generator that is activated under specific conditions.  
Specific conditions are set and the context generator is called.  
Avatar-Shell controls the conversation structure through a combination of context daemons.  

Examples:
- "When someone speaks to me, launch LLM based on the current context and create a reply."
- "Once LLM has created a reply, launch the speech synthesis AI and convert it into an audio file."
- "After a one-minute pause in the conversation, instruct LLM to 'create a new topic based on the current context and start a conversation.'"
- "When the conversation contains words/phrases related to the previous conversation (searched in a vector database, etc.), add supplementary information about those words to the LLM's input and create a reply."

### Echo Demon

The schedule submitted by the AI to the built-in MCP server is re-entered into the Avatar Shell as if it were a human, simulating a pseudo-ego.
Caution: This function may result in excessive privilege escalation. Please be aware of the risks and use it at your own risk.

The concepts of context generators, context daemons, and echo daemons are also explained on the following page (Japanese)

https://note.com/marble_walkers/n/nb7930d95c2d3


<img width="600" alt="スクリーンショット 2025-06-15 020826" src="https://github.com/user-attachments/assets/d03dcdcb-5e54-4a99-acb4-ae7b492f6ce6" />
