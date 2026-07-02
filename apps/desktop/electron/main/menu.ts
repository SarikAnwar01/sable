import { Menu, BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC } from '@shared';
import type { TabManager } from './tabs/TabManager';

/**
 * Native menu carries the core accelerators. Registering them here (instead of
 * only as renderer keydown handlers) means they fire even when a web page — not
 * the Sable chrome — has keyboard focus. Command palette (M4) will layer on top.
 */
export function buildMenu(getManager: () => TabManager | null): void {
  const tm = () => getManager();
  const send = (channel: string) =>
    BrowserWindow.getFocusedWindow()?.webContents.send(channel);

  const goToTab: MenuItemConstructorOptions = {
    label: 'Go to Tab',
    submenu: Array.from({ length: 9 }, (_, i) => ({
      label: `Tab ${i + 1}`,
      accelerator: `CmdOrCtrl+${i + 1}`,
      click: () => tm()?.activateByIndex(i),
    })),
  };

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    {
      label: 'Tab',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => tm()?.createTab({}) },
        {
          label: 'New Private Tab',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => tm()?.createTab({ isPrivate: true }),
        },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => tm()?.closeActive() },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => tm()?.reloadActive() },
        { label: 'Focus Address Bar', accelerator: 'CmdOrCtrl+L', click: () => send(IPC.FocusOmnibox) },
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: () => send(IPC.OpenCommandPalette),
        },
        { label: 'Library', accelerator: 'CmdOrCtrl+Y', click: () => send(IPC.OpenLibrary) },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send(IPC.OpenSettings) },
        { type: 'separator' },
        { label: 'Next Tab', accelerator: 'CmdOrCtrl+Shift+]', click: () => tm()?.cycle(1) },
        { label: 'Previous Tab', accelerator: 'CmdOrCtrl+Shift+[', click: () => tm()?.cycle(-1) },
        goToTab,
        {
          label: 'Suspend Background Tabs',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => tm()?.suspendInactive(),
        },
        { type: 'separator' },
        {
          label: 'Toggle Split View',
          accelerator: 'CmdOrCtrl+\\',
          click: () => tm()?.toggleSplit(),
        },
        {
          label: 'Focus Mode',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => send(IPC.ToggleFocus),
        },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
