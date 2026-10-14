import { App, ButtonComponent, PluginSettingTab, Setting, SettingDefinitionItem, ToggleComponent, requireApiVersion } from 'obsidian';
import MdmapPlugin from './main';
import { ColorsModal } from './colors-modal';
import { DEFAULT_SETTINGS } from './settings';
import { hasPickedColors } from './settings-panel';
import { t } from './i18n';

/** The plugin's settings: the same as the gear in a map has, and the ones that only apply when a map opens. */
export class MdmapSettingTab extends PluginSettingTab {
    /** Before Obsidian 1.13, the controls whose state other settings change. */
    private older?: { paragraphs: ToggleComponent; useThemeColors: ButtonComponent };

    constructor(app: App, private plugin: MdmapPlugin) {
        super(app, plugin);
    }

    /** Obsidian 1.13 and later render the tab from these and find them in the settings search; they read and save `plugin.settings`. */
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
            this.refresh();
        }
    }

    private openColors() {
        new ColorsModal(this.app, this.plugin.settings, this.plugin.settingsActions, () => this.refresh()).open();
    }

    private useThemeColors() {
        this.plugin.settingsActions.setColors(DEFAULT_SETTINGS.colors);
        this.refresh();
    }

    /** Shows which settings can be used now: the definitions' disabled states from Obsidian 1.13 on, the controls before. */
    private refresh() {
        if (requireApiVersion('1.13.0')) {
            this.refreshDomState();
        } else {
            this.older?.paragraphs.setDisabled(!this.plugin.settings.listItemsAsNodes);
            this.older?.useThemeColors.setDisabled(!hasPickedColors(this.plugin.settings.colors));
        }
    }

    /** Obsidian before 1.13, which does not call getSettingDefinitions(). */
    display(): void {
        const settings = this.plugin.settings;
        this.containerEl.empty();
        new Setting(this.containerEl)
            .setName(t('listItemsName'))
            .setDesc(t('listItemsDesc'))
            .addToggle(toggle =>
                toggle.setValue(settings.listItemsAsNodes).onChange(async value => {
                    settings.listItemsAsNodes = value;
                    await this.plugin.saveSettings();
                    this.refresh();
                }),
            );
        const paragraphs = new ToggleComponent(
            new Setting(this.containerEl).setName(t('showParagraphs')).setDesc(t('showParagraphsDesc')).controlEl,
        )
            .setValue(settings.paragraphsAsNodes)
            .setDisabled(!settings.listItemsAsNodes)
            .onChange(() => this.plugin.settingsActions.toggleParagraphs());
        new Setting(this.containerEl)
            .setName(t('showClickedNode'))
            .setDesc(t('showClickedNodeDesc'))
            .addToggle(toggle => toggle.setValue(settings.revealInNote).onChange(() => this.plugin.settingsActions.toggleReveal()));
        new Setting(this.containerEl)
            .setName(t('mapWidthName'))
            .setDesc(t('mapWidthDesc'))
            .addSlider(slider =>
                slider
                    .setLimits(20, 80, 5)
                    .setValue(settings.mapWidth)
                    .onChange(async value => {
                        settings.mapWidth = value;
                        await this.plugin.saveSettings();
                    }),
            );
        new Setting(this.containerEl).setName(t('nodeColors')).setHeading();
        new Setting(this.containerEl)
            .setName(t('editColorsName'))
            .setDesc(t('editColorsDesc'))
            .addButton(button => button.setButtonText(t('editColors')).onClick(() => this.openColors()));
        const useThemeColors = new ButtonComponent(new Setting(this.containerEl).setName(t('themeColors')).setDesc(t('themeColorsDesc')).controlEl)
            .setButtonText(t('themeColors'))
            .setDisabled(!hasPickedColors(settings.colors))
            .onClick(() => this.useThemeColors());
        this.older = { paragraphs, useThemeColors };
    }
}
