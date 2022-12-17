import {
	CachedMetadata,
	MetadataCache,
	TAbstractFile,
	TFile,
	Vault,
} from "obsidian";

/**
 * A stripped-down interface into the Obsidian API that only exposes the necessary
 * functions that calendars will use. Factoring this out is useful for mocking the
 * Obsidian API in unit tests.
 */
export interface ObsidianInterface {
	/**
	 * @param path path to get the file for.
	 * Get a file/folder from the Vault. Returns null if file doesn't exist.
	 */
	getAbstractFileByPath(path: string): TAbstractFile | null;

	/**
	 * @param path path to get the file for.
	 * Get a file from the Vault. Returns null if file doesn't exist or is a folder.
	 */
	getFileByPath(path: string): TFile | null;

	/**
	 * @param file file to get metadata for.
	 * Get the Obsidian-parsed metadata for the given file.
	 */
	getMetadata(file: TFile): CachedMetadata | null;

	/**
	 * @param file file to read.
	 * Read a file from the vault.
	 */
	read(file: TFile): Promise<string>;

	/**
	 * Create a new file at the given path with the given contents.
	 *
	 * @param path path to create the file at.
	 * @param contents new contents of the file.
	 */
	create(path: string, contents: string): Promise<TFile>;

	/**
	 * Rewrite the given file. This API does not directly expose a "write" function
	 * to ensure that a file is read from disk directly before it is written to.
	 *
	 * @param file file to rewrite
	 * @param rewriteFunc callback function that performs the rewrite.
	 */
	rewrite(
		file: TFile,
		rewriteFunc: (contents: string) => string
	): Promise<void>;

	/**
	 * Rename a file.
	 * @param file file to rename.
	 * @param newPath new path for this file.
	 */
	rename(file: TFile, newPath: string): Promise<void>;

	/**
	 * Send a file to the trash.
	 * @param file file to delete
	 * @param system set to true to send to system trash, otherwise Vault trash.
	 */
	trash(file: TFile, system: boolean): Promise<void>;
}

/**
 * "Production" implementation of the ObsidianInterface.
 * It takes in the Vault and MetadataCache from Plugin.app.
 */
export class ObsidianIO implements ObsidianInterface {
	vault: Vault;
	metadataCache: MetadataCache;

	constructor(vault: Vault, metadataCache: MetadataCache) {
		this.vault = vault;
		this.metadataCache = metadataCache;
	}

	trash(file: TFile, system: boolean): Promise<void> {
		return this.vault.trash(file, system);
	}

	rename(file: TFile, newPath: string): Promise<void> {
		return this.vault.rename(file, newPath);
	}

	async rewrite(
		file: TFile,
		rewriteFunc: (contents: string) => string
	): Promise<void> {
		const page = await this.vault.read(file);
		const newPage = rewriteFunc(page);
		return this.vault.modify(file, newPage);
	}

	create(path: string, contents: string): Promise<TFile> {
		return this.vault.create(path, contents);
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.vault.getAbstractFileByPath(path);
	}

	getFileByPath(path: string): TFile | null {
		const f = this.vault.getAbstractFileByPath(path);
		if (!f) {
			return null;
		}
		if (!(f instanceof TFile)) {
			return null;
		}
		return f;
	}

	getMetadata(file: TFile): CachedMetadata | null {
		return this.metadataCache.getFileCache(file);
	}

	read(file: TFile): Promise<string> {
		return this.vault.cachedRead(file);
	}
}
