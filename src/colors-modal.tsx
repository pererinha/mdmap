import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { MdmapSettings } from './settings';
import { ColorEditor, SettingsActions } from './settings-panel';
import { t } from './i18n';

/** The colour editor of the map's gear, opened from the plugin's settings tab. */
export class ColorsModal extends Modal {
    private root: Root;

    constructor(
        app: App,
        private settings: MdmapSettings,
        private actions: SettingsActions,
        /** Called once the modal closes, so the settings tab shows the colours as they are now. */
        private closed: () => void,
    ) {
        super(app);
    }

    onOpen() {
        this.modalEl.addClass('mdmap-colors-modal');
        // A title keeps the close button on its own line, above the theme tabs.
        this.setTitle(t('editColorsName'));
        this.root = createRoot(this.contentEl);
        this.root.render(<ColorEditor settings={this.settings} actions={this.actions} />);
    }

    onClose() {
        this.root.unmount();
        this.closed();
    }
}
