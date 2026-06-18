# DualLink (Obsidian Local File Linker)

**DualLink** is an efficient Obsidian plugin for linking, managing, and live previewing local and external physical files.

Due to Obsidian's vault mechanism limitations, handling large resource files (such as videos of tens of GB, lossless audio collections, or engineering source files) or system-level network drive mappings often requires keeping them outside the `.obsidian` vault. This plugin perfectly solves the pain point of "needing external path large file associations while also requiring smooth built-in preview", helping you seamlessly integrate **external absolute path files** and **internal vault files** within the same panel.

---

## 🌟 Core Features

- **📂 Dual Link Mode**
  The left sidebar includes an interactive file browser that supports one-click switching between **📦 Internal Vault Mode** and **🌐 External Path Mode**. You can use it to quickly browse massive images and videos on external disks.
- **🖱️ Drag & Drop Mapping**
  Directly drag external files into the Obsidian editor to instantly convert them into safe and smooth `local-file://` association links, eliminating tedious manual path typing.
- **👁️ Hover & Inline Preview**
  In reading or editing mode, simply hover over the generated link to reveal a elegant card-style preview (supports common image formats). If inline mode is enabled, external images will be rendered directly in the document flow.
- **🎵 Multimedia Instant Decoding**
  No longer limited to images! For formats like `.mp4`, `.webm`, `.mp3`, etc., supports inline rendering or native application activation, without consuming any vault storage space.
- **⚙️ Multi-Protocol Adaptation**
  Provides 3 ready-to-use link injection protocol formats for advanced user scenarios:
  1. `custom-protocol://` (Recommended: safe sandbox isolation)
  2. `file:///` (Standard cross-tool compatible protocol)
  3. `Absolute Path` (Raw direct address)
- **✨ Smart Link Detection**
  When selecting files from the browser to inject into documents, it automatically determines: for external resources, generates corresponding external link format `![]()`; for "Internal Vault Mode", automatically derives standard internal link format `[[ ]]` and media resources auto-add prefix `![[ ]]`.

---

## 🚀 Installation

> The plugin is currently in non-official community market stage, requires local manual mounting to enable.

1. **Build from Source** (if you cloned this project)
   Run the build or package command via Node environment, typically generating `main.js` and `manifest.json`.
2. **Move to Plugin Directory**
   Open your Obsidian vault location, navigate to `.obsidian/plugins` directory.
   Create a new empty folder named `obsidian-dual-link`.
   Copy the compiled `main.js`, `styles.css`, and `manifest.json` into this directory.
3. **Safe Mode Settings**
   Start Obsidian, go to **Settings -> Community Plugins**.
   If in "Safe Mode", turn it off, scroll down to find the **DualLink** plugin card, and toggle it to **On**.

---

## 📖 Usage Guide

### 1. Left External File Browser
After enabling the plugin, you'll find a new icon in the left ribbon. Click to expand the interactive panel:
- **Switch Path Mode**: Click the 📦/🌐 button combination to toggle between internal vault and last opened external root path.
- **Browse Folder**: Click "Browse" to invoke native file manager to specify external disk location.
- **Quick Filter/Tags**: Panel includes real-time text filter and media format filter (All/Images/Video/Audio).
- **Click to Inject**: Position cursor in editor, click any file in the list to inject the reference.

### 2. Markdown Drag & Drop
Open any system file manager, select files, drag directly to Markdown text position to generate links or image tags.

### 3. Three Generation Format Settings
Open plugin settings to change "Default Link Format":
- **`custom-protocol:// (Recommended)`** 
  Uses Obsidian's exposed safe protocol routing (starting with `local-file://`). Benefits: **ignores cross-origin and strict security policy restrictions**, can load external disk content without errors.
- **`file:/// Standard Protocol`**
  Generated format starts with traditional browser file:// protocol. Better compatibility when using other third-party Markdown editors. May be blocked in strict security configurations.
- **`Absolute Path`**
  No protocol tags, raw `C:\Users\...` format. Recommended for physical archive management directory registration.

### 4. Gallery & Path Auto-Correction
- **Quick Gallery Insert**: Browse images/videos in the file browser panel:
  - **Single Insert**: Click a media file to insert with 1-column format.
  - **Multi-Select Columns**: Hold `Ctrl` or `Cmd` and click multiple files, "Insert N images (N columns)" button appears (auto-calculates ideal layout, supports up to 5 columns). Click to generate elegant ````duallink-gallery```` code block.
- **Path Auto-Correction**: For gallery content rendered in this format:
  - If internal links become dead due to folder restructuring, plugin will use internal API to search vault-wide and fix link references.
  - If external image original path is affected by relocation or disk letter changes, as long as it's still within the configured "Default External Resource Root Directory", plugin will perform background deep traversal search and silently fix the Markdown source path after finding the target!

---

## 🛠 Development & Build Commands

If you want to modify based on this project:
```bash
# Install dependencies
npm install

# Frontend watch mode for instant debugging
npm run dev

# Build production targets
npm run build
```

---

## 中文说明

**DualLink** 是一款专为 Obsidian 打造的高效本地及外部物理文件关联、管理与实时预览插件。
由于 Obsidian 本身的保险箱机制限制，我们在涉及大容量资源文件（如几十GB的视频、大量无损音频、工程源文件）或系统级别不同网盘映射时，往往无法或者不适合将它们悉数移入 `.obsidian` 保险箱中。本插件完美解决了"既需要外部路径大文件关联，又需要内置丝滑预览"的痛点，帮助您在同一面板内无缝整合**外部绝对路径文件**与**内部保险箱文件**。

### 核心特性

- **📂 双轨模式驱动** - 左侧边栏内置交互式文件浏览器，支持一键在内部库模式和外部路径模式之间切换
- **🖱️ 极速拖入映射** - 直接将外部文件拖拽进入编辑器，自动转为 `local-file://` 关联软链
- **👁️ 实时悬浮与内嵌预览** - 鼠标悬浮即可调出卡片式预览，支持图片内嵌渲染
- **🎵 多媒体即时解码** - 支持 `.mp4`, `.webm`, `.mp3` 等格式内联渲染
- **⚙️ 多形式协议适配** - 提供 3 种链接格式：custom-protocol、file:///、绝对路径
- **✨ 智能区分链接** - 自动判断内外资源，生成对应格式链接

### 安装步骤

1. 编译构建生成 `main.js`、`styles.css` 和 `manifest.json`
2. 将文件复制到 `.obsidian/plugins/obsidian-dual-link` 目录
3. 在 Obsidian 设置中启用第三方插件，打开 DualLink

---

## 📝 License

MIT License