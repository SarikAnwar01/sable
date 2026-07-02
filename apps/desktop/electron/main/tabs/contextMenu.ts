import { Menu, clipboard, type MenuItemConstructorOptions, type WebContents } from 'electron';
import { SEARCH_ENGINES, type SearchEngineId } from '@shared';

export interface PageMenuActions {
  openInNewTab: (url: string) => void;
  openInSplit: (url: string) => void;
  engine: () => SearchEngineId;
}

/**
 * Build the right-click menu for web content. Sections appear contextually:
 * link actions, image actions, clipboard/selection, then navigation and
 * Inspect Element always. Kept as a pure template builder so it's testable.
 */
export function buildPageMenuTemplate(
  wc: WebContents,
  params: Electron.ContextMenuParams,
  actions: PageMenuActions,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  const sep = () => {
    if (items.length && items[items.length - 1].type !== 'separator') {
      items.push({ type: 'separator' });
    }
  };

  if (params.linkURL) {
    items.push(
      { label: 'Open Link in New Tab', click: () => actions.openInNewTab(params.linkURL) },
      { label: 'Open Link in Split View', click: () => actions.openInSplit(params.linkURL) },
      { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
    );
    sep();
  }

  if (params.mediaType === 'image' && params.srcURL) {
    items.push(
      { label: 'Open Image in New Tab', click: () => actions.openInNewTab(params.srcURL) },
      { label: 'Copy Image', click: () => wc.copyImageAt(params.x, params.y) },
      { label: 'Save Image As…', click: () => wc.downloadURL(params.srcURL) },
    );
    sep();
  }

  const selection = params.selectionText.trim();
  if (params.isEditable) {
    items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    sep();
  } else if (selection) {
    const engine = SEARCH_ENGINES[actions.engine()];
    const preview = selection.length > 28 ? `${selection.slice(0, 28)}…` : selection;
    items.push(
      { label: 'Copy', click: () => wc.copy() },
      {
        label: `Search ${engine.name} for “${preview}”`,
        click: () =>
          actions.openInNewTab(engine.query.replace('%s', encodeURIComponent(selection))),
      },
    );
    sep();
  }

  items.push(
    {
      label: 'Back',
      enabled: wc.navigationHistory.canGoBack(),
      click: () => wc.navigationHistory.goBack(),
    },
    {
      label: 'Forward',
      enabled: wc.navigationHistory.canGoForward(),
      click: () => wc.navigationHistory.goForward(),
    },
    { label: 'Reload', click: () => wc.reload() },
  );
  sep();
  items.push({
    label: 'Inspect Element',
    click: () => wc.inspectElement(params.x, params.y),
  });

  return items;
}

export function showPageContextMenu(
  wc: WebContents,
  params: Electron.ContextMenuParams,
  actions: PageMenuActions,
): void {
  Menu.buildFromTemplate(buildPageMenuTemplate(wc, params, actions)).popup();
}
