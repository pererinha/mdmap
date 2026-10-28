import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import MdmapPlugin from './main';
import { ColorsModal } from './colors-modal';
import { DEFAULT_SETTINGS } from './settings';
import { hasPickedColors } from './settings-panel';
import { t } from './i18n';

/** The plugin's settings: the same as the gear in a map has, and the ones that only apply when a map opens. */
export class MdmapSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: MdmapPlugin) {
        super(app, plugin);
    }

    /** Obsidian renders the tab from these and finds them in the settings search; they read and save `plugin.settings`. */
    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            { name: t('listItemsName'), desc: t('listItemsDesc'), control: { type: 'toggle', key: 'listItemsAsNodes' } },
            // Without list items as nodes, paragraphs are never nodes.
            {
                name: t('showParagraphs'),
                desc: t('showParagraphsDesc'),
                control: { type: 'toggle', key: 'paragraphsAsNodes', disabled: () => !this.plugin.settings.listItemsAsNodes },
            },
            { name: t('showClickedNode'), desc: t('showClickedNodeDesc'), control: { type: 'toggle', key: 'revealInNote' } },
            { name: t('rememberPosition'), desc: t('rememberPositionDesc'), control: { type: 'toggle', key: 'rememberPosition' } },
            { name: t('mapWidthName'), desc: t('mapWidthDesc'), control: { type: 'slider', key: 'mapWidth', min: 20, max: 80, step: 5, displayFormat: value => `${value}%` } },
            {
                type: 'group',
                heading: t('nodeColors'),
                items: [
                    { name: t('editColorsName'), desc: t('editColorsDesc'), action: () => this.openColors() },
                    {
                        name: t('themeColors'),
                        desc: t('themeColorsDesc'),
                        action: () => this.useThemeColors(),
                        disabled: () => !hasPickedColors(this.plugin.settings.colors),
                    },
                ],
            },
        ];
    }

    /**
     * The switches the gear in a map has too go through the same actions, so the open maps show the change at once;
     * "Show paragraphs" follows "List items and paragraphs as nodes".
     */
    async setControlValue(key: string, value: unknown) {
        const settings = this.plugin.settings;
        if (key === 'paragraphsAsNodes' && value !== settings.paragraphsAsNodes) {
            this.plugin.settingsActions.toggleParagraphs();
        } else if (key === 'revealInNote' && value !== settings.revealInNote) {
            this.plugin.settingsActions.toggleReveal();
        } else {
            // What PluginSettingTab does by default: the value goes into `plugin.settings`, which is saved.
            (settings as unknown as Record<string, unknown>)[key] = value;
            await this.plugin.saveSettings();
        }
        if (key === 'listItemsAsNodes') {
            this.refreshDomState();
        }
    }

    private openColors() {
        new ColorsModal(this.app, this.plugin.settings, this.plugin.settingsActions, () => this.refreshDomState()).open();
    }

    private useThemeColors() {
        this.plugin.settingsActions.setColors(DEFAULT_SETTINGS.colors);
        this.refreshDomState();
    }
}
