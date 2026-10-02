import { App, PluginSettingTab, Setting } from 'obsidian';
import MdmapPlugin from './main';

export class MdmapSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: MdmapPlugin) {
        super(app, plugin);
    }

    display(): void {
        this.containerEl.empty();
        new Setting(this.containerEl)
            .setName('List items and paragraphs as nodes')
            .setDesc('Show the list items and paragraphs under a heading as nodes; a list right after a paragraph becomes its children. Takes effect when a mind map is opened.')
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.listItemsAsNodes).onChange(async value => {
                    this.plugin.settings.listItemsAsNodes = value;
                    await this.plugin.saveSettings();
                }),
            );
    }
}
