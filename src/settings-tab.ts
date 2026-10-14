import { App, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
import MdmapPlugin from './main';
import { t } from './i18n';

export class MdmapSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: MdmapPlugin) {
        super(app, plugin);
    }

    /** Obsidian 1.13 and later render the tab from these and find them in the settings search; they read and save `plugin.settings`. */
    getSettingDefinitions(): SettingDefinitionItem[] {
        return [{ name: t('listItemsName'), desc: t('listItemsDesc'), control: { type: 'toggle', key: 'listItemsAsNodes' } }];
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
    }
}
