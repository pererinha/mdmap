import { App, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
import MdmapPlugin from './main';

const LIST_ITEMS_NAME = 'List items and paragraphs as nodes';
const LIST_ITEMS_DESC =
    'Show the list items and paragraphs under a heading as nodes; a list right after a paragraph becomes its children. Takes effect when a mind map is opened.';

export class MdmapSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: MdmapPlugin) {
        super(app, plugin);
    }

    /** Obsidian 1.13 and later render the tab from these and find them in the settings search; they read and save `plugin.settings`. */
    getSettingDefinitions(): SettingDefinitionItem[] {
        return [{ name: LIST_ITEMS_NAME, desc: LIST_ITEMS_DESC, control: { type: 'toggle', key: 'listItemsAsNodes' } }];
    }

    /** Obsidian before 1.13, which does not call getSettingDefinitions(). */
    display(): void {
        this.containerEl.empty();
        new Setting(this.containerEl)
            .setName(LIST_ITEMS_NAME)
            .setDesc(LIST_ITEMS_DESC)
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.listItemsAsNodes).onChange(async value => {
                    this.plugin.settings.listItemsAsNodes = value;
                    await this.plugin.saveSettings();
                }),
            );
    }
}
