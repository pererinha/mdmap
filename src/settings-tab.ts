import { App, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
import MdmapPlugin from './main';
import { t } from './i18n';

export class MdmapSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: MdmapPlugin) {
        super(app, plugin);
    }

    /** Obsidian 1.13 and later render the tab from these and find them in the settings search; they read and save `plugin.settings`. */
    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            { name: t('listItemsName'), desc: t('listItemsDesc'), control: { type: 'toggle', key: 'listItemsAsNodes' } },
            { name: t('mapWidthName'), desc: t('mapWidthDesc'), control: { type: 'slider', key: 'mapWidth', min: 20, max: 80, step: 5, displayFormat: value => `${value}%` } },
        ];
    }

    /** Obsidian before 1.13, which does not call getSettingDefinitions(). */
    display(): void {
        this.containerEl.empty();
        new Setting(this.containerEl)
            .setName(t('listItemsName'))
            .setDesc(t('listItemsDesc'))
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.listItemsAsNodes).onChange(async value => {
                    this.plugin.settings.listItemsAsNodes = value;
                    await this.plugin.saveSettings();
                }),
            );
        new Setting(this.containerEl)
            .setName(t('mapWidthName'))
            .setDesc(t('mapWidthDesc'))
            .addSlider(slider =>
                slider
                    .setLimits(20, 80, 5)
                    .setValue(this.plugin.settings.mapWidth)
                    .onChange(async value => {
                        this.plugin.settings.mapWidth = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
