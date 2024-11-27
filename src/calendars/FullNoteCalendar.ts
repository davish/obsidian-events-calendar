import { TFile, TFolder, parseYaml } from "obsidian";
import { rrulestr } from "rrule";
import { EventPathLocation } from "../core/EventStore";
import { ObsidianInterface } from "../ObsidianAdapter";
import {
    OFCEvent,
    EventLocation,
    validateEvent,
    isRangeTimeData,
} from "../types";
import { EditableCalendar, EditableEventResponse } from "./EditableCalendar";

const basenameFromEvent = (
    event: OFCEvent,
    timeInNoteTitle: boolean
): string => {
    switch (event.type) {
        case undefined:
        case "single":
            if (timeInNoteTitle && isRangeTimeData(event)) {
                return `${event.date} ${event.startTime.replace(":", "")} ${
                    event.title
                }`;
            }
            return `${event.date} ${event.title}`;
        case "recurring":
            return `(Every ${event.daysOfWeek.join(",")}) ${event.title}`;
        case "rrule":
            return `(${rrulestr(event.rrule).toText()}) ${event.title}`;
    }
};

const filenameForEvent = (event: OFCEvent, timeInNoteTitle: boolean) =>
    `${basenameFromEvent(event, timeInNoteTitle)}.md`;

const FRONTMATTER_SEPARATOR = "---";

/**
 * @param page Contents of a markdown file.
 * @returns Whether or not this page has a frontmatter section.
 */
function hasFrontmatter(page: string): boolean {
    return (
        page.indexOf(FRONTMATTER_SEPARATOR) === 0 &&
        page.slice(3).indexOf(FRONTMATTER_SEPARATOR) !== -1
    );
}

/**
 * Return only frontmatter from a page.
 * @param page Contents of a markdown file.
 * @returns Frontmatter section of a page.
 */
function extractFrontmatter(page: string): string | null {
    if (hasFrontmatter(page)) {
        return page.split(FRONTMATTER_SEPARATOR)[1];
    }
    return null;
}

/**
 * Remove frontmatter from a page.
 * @param page Contents of markdown file.
 * @returns Contents of a page without frontmatter.
 */
function extractPageContents(page: string): string {
    if (hasFrontmatter(page)) {
        // Frontmatter lives between the first two --- linebreaks.
        return page.split("---").slice(2).join("---");
    } else {
        return page;
    }
}

function replaceFrontmatter(page: string, newFrontmatter: string): string {
    return `---\n${newFrontmatter}---${extractPageContents(page)}`;
}

type PrintableAtom = Array<number | string> | number | string | boolean;

function stringifyYamlAtom(v: PrintableAtom): string {
    let result = "";
    if (Array.isArray(v)) {
        result += "[";
        result += v.map(stringifyYamlAtom).join(",");
        result += "]";
    } else {
        result += `${v}`;
    }
    return result;
}

function stringifyYamlLine(
    k: string | number | symbol,
    v: PrintableAtom
): string {
    return `${String(k)}: ${stringifyYamlAtom(v)}`;
}

function newFrontmatter(fields: Partial<OFCEvent>): string {
    return (
        "---\n" +
        Object.entries(fields)
            .filter(([_, v]) => v !== undefined)
            .map(([k, v]) => stringifyYamlLine(k, v))
            .join("\n") +
        "\n---\n"
    );
}

function modifyFrontmatterString(
    page: string,
    modifications: Partial<OFCEvent>
): string {
    const frontmatter = extractFrontmatter(page)?.split("\n");
    let newFrontmatter: string[] = [];
    if (!frontmatter) {
        newFrontmatter = Object.entries(modifications)
            .filter(([k, v]) => v !== undefined)
            .map(([k, v]) => stringifyYamlLine(k, v));
        page = "\n" + page;
    } else {
        const linesAdded: Set<string | number | symbol> = new Set();
        // Modify rows in-place.
        for (let i = 0; i < frontmatter.length; i++) {
            const line: string = frontmatter[i];
            const obj: Record<any, any> | null = parseYaml(line);
            if (!obj) {
                continue;
            }

            const keys = Object.keys(obj) as [keyof OFCEvent];
            if (keys.length !== 1) {
                throw new Error("One YAML line parsed to multiple keys.");
            }
            const key = keys[0];
            linesAdded.add(key);
            const newVal: PrintableAtom | undefined = modifications[key];
            if (newVal !== undefined) {
                newFrontmatter.push(stringifyYamlLine(key, newVal));
            } else {
                // Just push the old line if we don't have a modification.
                newFrontmatter.push(line);
            }
        }

        // Add all rows that were not originally in the frontmatter.
        newFrontmatter.push(
            ...(Object.keys(modifications) as [keyof OFCEvent])
                .filter((k) => !linesAdded.has(k))
                .filter((k) => modifications[k] !== undefined)
                .map((k) =>
                    stringifyYamlLine(k, modifications[k] as PrintableAtom)
                )
        );
    }
    return replaceFrontmatter(page, newFrontmatter.join("\n") + "\n");
}

export default class FullNoteCalendar extends EditableCalendar {
    app: ObsidianInterface;
    private _directory: string;
    private _timeInNoteTitle: boolean;

    constructor(
        app: ObsidianInterface,
        color: string,
        directory: string,
        timeInNoteTitle: boolean
    ) {
        super(color);
        this.app = app;
        this._directory = directory;
        this._timeInNoteTitle = timeInNoteTitle;
    }
    get directory(): string {
        return this._directory;
    }
    get timeInNoteTitle(): boolean {
        return this._timeInNoteTitle;
    }

    get type(): "local" {
        return "local";
    }

    get identifier(): string {
        return this.directory;
    }

    get name(): string {
        return this.directory;
    }

    async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
        const metadata = this.app.getMetadata(file);
        let event = validateEvent(metadata?.frontmatter);
        if (!event) {
            return [];
        }
        if (!event.title) {
            event.title = file.basename;
        }
        return [[event, { file, lineNumber: undefined }]];
    }

    private async getEventsInFolderRecursive(
        folder: TFolder
    ): Promise<EditableEventResponse[]> {
        const events = await Promise.all(
            folder.children.map(async (file) => {
                if (file instanceof TFile) {
                    return await this.getEventsInFile(file);
                } else if (file instanceof TFolder) {
                    return await this.getEventsInFolderRecursive(file);
                } else {
                    return [];
                }
            })
        );
        return events.flat();
    }

    async getEvents(): Promise<EditableEventResponse[]> {
        const eventFolder = this.app.getAbstractFileByPath(this.directory);
        if (!eventFolder) {
            throw new Error(`Cannot get folder ${this.directory}`);
        }
        if (!(eventFolder instanceof TFolder)) {
            throw new Error(`${eventFolder} is not a directory.`);
        }
        const events: EditableEventResponse[] = [];
        for (const file of eventFolder.children) {
            if (file instanceof TFile) {
                const results = await this.getEventsInFile(file);
                events.push(...results);
            }
        }
        return events;
    }

    async createEvent(event: OFCEvent): Promise<EventLocation> {
        const path = `${this.directory}/${filenameForEvent(
            event,
            this.timeInNoteTitle
        )}`;
        if (this.app.getAbstractFileByPath(path)) {
            throw new Error(`Event at ${path} already exists.`);
        }
        const file = await this.app.create(path, newFrontmatter(event));
        return { file, lineNumber: undefined };
    }

    getNewLocation(
        location: EventPathLocation,
        event: OFCEvent
    ): EventLocation {
        const { path, lineNumber } = location;
        if (lineNumber !== undefined) {
            throw new Error("Note calendar cannot handle inline events.");
        }
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(
                `File ${path} either doesn't exist or is a folder.`
            );
        }

        const updatedPath = `${file.parent.path}/${filenameForEvent(
            event,
            this.timeInNoteTitle
        )}`;
        return { file: { path: updatedPath }, lineNumber: undefined };
    }

    async modifyEvent(
        location: EventPathLocation,
        event: OFCEvent,
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<void> {
        const { path } = location;
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(
                `File ${path} either doesn't exist or is a folder.`
            );
        }
        const newLocation = this.getNewLocation(location, event);

        updateCacheWithLocation(newLocation);

        if (file.path !== newLocation.file.path) {
            await this.app.rename(file, newLocation.file.path);
        }
        await this.app.rewrite(file, (page) =>
            modifyFrontmatterString(page, event)
        );

        return;
    }

    async move(
        fromLocation: EventPathLocation,
        toCalendar: EditableCalendar,
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<void> {
        const { path, lineNumber } = fromLocation;
        if (lineNumber !== undefined) {
            throw new Error("Note calendar cannot handle inline events.");
        }
        if (!(toCalendar instanceof FullNoteCalendar)) {
            throw new Error(
                `Event cannot be moved to a note calendar from a calendar of type ${toCalendar.type}.`
            );
        }
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(`File ${path} not found.`);
        }
        const destDir = toCalendar.directory;
        const newPath = `${destDir}/${file.name}`;
        updateCacheWithLocation({
            file: { path: newPath },
            lineNumber: undefined,
        });
        await this.app.rename(file, newPath);
    }

    deleteEvent({ path, lineNumber }: EventPathLocation): Promise<void> {
        if (lineNumber !== undefined) {
            throw new Error("Note calendar cannot handle inline events.");
        }
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(`File ${path} not found.`);
        }
        return this.app.delete(file);
    }
}
