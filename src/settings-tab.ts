import { App, PluginSettingTab, Setting } from 'obsidian';
import MdmapPlugin from './main';

export class MdmapSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: MdmapPlugin) {
        super(app, plugin);
    }

    display(): void {
        this.containerEl.empty();
        new Setting(this.containerEl)
            .setName('List items as nodes')
            .setDesc('Show the list items under a heading as child nodes of that heading. Takes effect when a mind map is opened.')
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.listItemsAsNodes).onChange(async value => {
                    this.plugin.settings.listItemsAsNodes = value;
                    await this.plugin.saveSettings();
                }),
            );
    }
}
