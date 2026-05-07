# Outliner Plus

**Work with your lists like in Workflowy or RoamResearch**

> **Note:** This is a personal fork of [obsidian-outliner](https://github.com/vslinko/obsidian-outliner) by Viacheslav Slinko, distributed under the MIT License. Modifications by Evgeny Dorland — see [Differences from upstream](#differences-from-upstream).

🐛 [Report issues for this fork](https://github.com/ushakov-git/obsidian-outliner/issues)

Compatible with [Obsidian Zoom plugin](https://github.com/vslinko/obsidian-zoom).

## Differences from upstream

This fork adds the following on top of [vslinko/obsidian-outliner](https://github.com/vslinko/obsidian-outliner):

- **Stage 1 — Cross-group bullet drag-and-drop.** You can now drag a bullet item between two separate bullet groups (separated by blank lines) in a single Markdown note. The original plugin only allowed dragging within one contiguous bullet group.
- More changes coming (drag plain-text lines, multi-line drag).

## Demo

![Demo](https://raw.githubusercontent.com/vslinko/obsidian-outliner/main/demos/demo1.gif)

## How to install

### From within Obsidian

You can activate this plugin within Obsidian by doing the following:

- Open Settings > Third-party plugin
- Make sure Safe mode is off
- Click Browse community plugins
- Search for "Outliner"
- Click Install
- Once installed, close the community plugins window and activate the newly installed plugin

### Manual installation

Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/vslinko/obsidian-outliner/releases/latest) and put them into `<vault>/.obsidian/plugins/obsidian-outliner` folder.

## How to use

Try to create a deeply structured list and move items by pressing the hotkeys described below.

## Features

### Improve the style of your lists

If you liked the styles from the demo above, you can enable them in the plugin settings tab.

> **Disclaimer:** Styles are only compatible with built-in Obsidian theme.

| Setting                         | Default value |
|---------------------------------|:-------------:|
| Improve the style of your lists |    `true`     |

### Move lists back and forth

Move lists with children wherever you want without breaking the structure.

| Command                       |       Default hotkey (Windows/Linux)        |             Default hotkey (MacOS)             |                                    Mobile Quick Action                                    |
|-------------------------------|:-------------------------------------------:|:----------------------------------------------:|:-----------------------------------------------------------------------------------------:|
| Move list and sublists up     | <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>↑</kbd> | <kbd>Command</kbd><kbd>Shift</kbd><kbd>↑</kbd> |  ![](https://raw.githubusercontent.com/vslinko/obsidian-outliner/main/icons/move-up.png)  |
| Move list and sublists down   | <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>↓</kbd> | <kbd>Command</kbd><kbd>Shift</kbd><kbd>↓</kbd> | ![](https://raw.githubusercontent.com/vslinko/obsidian-outliner/main/icons/move-down.png) |
| Indent the list and sublists  |               <kbd>Tab</kbd>                |                 <kbd>Tab</kbd>                 |  ![](https://raw.githubusercontent.com/vslinko/obsidian-outliner/main/icons/indent.png)   |
| Outdent the list and sublists |       <kbd>Shift</kbd><kbd>Tab</kbd>        |         <kbd>Shift</kbd><kbd>Tab</kbd>         |  ![](https://raw.githubusercontent.com/vslinko/obsidian-outliner/main/icons/outdent.png)  |

| Setting             | Default value |
|---------------------|:-------------:|
| Enhance the Tab key |    `true`     |

### Draw vertical indentation lines

> **Disclaimer:** vertical indentation lines are only compatible with built-in Obsidian theme.

![Demo of vertical indentation lines](https://raw.githubusercontent.com/vslinko/obsidian-outliner/main/demos/demo2.gif)

| Setting                                |  Default value   |
|----------------------------------------|:----------------:|
| Draw vertical indentation lines        |     `false`      |
| Vertical indentation line click action | `Toggle Folding` |

### Stick the cursor to the content

Don't let the cursor move to the bullet position. Affects cursor movement, text deletion, text selection.

| Setting                         | Default value |
|---------------------------------|:-------------:|
| Stick the cursor to the content |    `true`     |

### Enhance the Enter key

Make the Enter key behave the same as other outliners:

- Enter outdents list item if it's empty.
- Enter creates new line on children level if there are any children.
- Shift-Enter creates a new note line.

[More info](https://github.com/vslinko/obsidian-outliner/discussions/98#discussioncomment-649514)

| Setting               | Default value |
|-----------------------|:-------------:|
| Enhance the Enter key |    `true`     |

### Fold and unfold your lists

| Command         | Default hotkey (Windows/Linux) |     Default hotkey (MacOS)     |                                  Mobile Quick Action                                   |
|-----------------|:------------------------------:|:------------------------------:|:--------------------------------------------------------------------------------------:|
| Fold the list   |  <kbd>Ctrl</kbd><kbd>↑</kbd>   | <kbd>Command</kbd><kbd>↑</kbd> |  ![](https://raw.githubusercontent.com/vslinko/obsidian-outliner/main/icons/fold.png)  |
| Unfold the list |  <kbd>Ctrl</kbd><kbd>↓</kbd>   | <kbd>Command</kbd><kbd>↓</kbd> | ![](https://raw.githubusercontent.com/vslinko/obsidian-outliner/main/icons/unfold.png) |

### Enhance the <kbd>Ctrl</kbd><kbd>A</kbd> or <kbd>Cmd</kbd><kbd>A</kbd> behavior

Press the hotkey once to select the current list item. Press the hotkey twice to select the entire list.

| Setting                              | Default value |
|--------------------------------------|:-------------:|
| Enhance the Ctrl+A or Cmd+A behavior |    `true`     |

### Drag-and-Drop

![Demo of Drag-and-Drop](https://raw.githubusercontent.com/vslinko/obsidian-outliner/main/demos/demo4.gif)

| Setting       | Default value |
|---------------|:-------------:|
| Drag-and-Drop |    `true`     |

### Debug mode

Open DevTools (Command+Option+I or Control+Shift+I) to copy the debug logs.

| Setting    | Default value |
|------------|:-------------:|
| Debug mode |    `false`    |

## Unsupported (yet) features

- [Manipulation with multiple lines](https://github.com/vslinko/obsidian-outliner/issues/3)

## Acknowledgements

This project is a derivative work based on [obsidian-outliner](https://github.com/vslinko/obsidian-outliner) by Viacheslav Slinko, distributed under the MIT License. Huge thanks to him and all the original contributors for the foundation.

## Pricing

This plugin is free for everyone.
