import moment from "moment";
import {
    TFile,
    CachedMetadata,
    HeadingCache,
    ListItemCache,
    Loc,
    Pos,
} from "obsidian";
import {
    appHasDailyNotesPluginLoaded,
    createDailyNote,
    getAllDailyNotes,
    getDailyNote,
    getDailyNoteSettings,
    getDateFromFile,
} from "obsidian-daily-notes-interface";
import { EventPathLocation } from "../core/EventStore";
import { ObsidianInterface } from "../ObsidianAdapter";
import { OFCEvent, EventLocation, CalendarInfo, validateEvent } from "../types";
import { EventResponse } from "./Calendar";
import { EditableCalendar, EditableEventResponse } from "./EditableCalendar";

const DATE_FORMAT = "YYYY-MM-DD";

// PARSING

type Line = {
    text: string;
    lineNumber: number;
};

const parseBool = (s: string): boolean | string =>
    s === "true" ? true : s === "false" ? false : s;

const fieldRegex = /\[([^\]]+):: ?([^\]]+)\]/g;
export function getInlineAttributes(
    s: string
): Record<string, string | boolean> {
    return Object.fromEntries(
        Array.from(s.matchAll(fieldRegex)).map((m) => [m[1], parseBool(m[2])])
    );
}

const getHeadingPosition = (
    headingText: string,
    metadata: CachedMetadata,
    endOfDoc: Loc
): Pos | null => {
    if (!metadata.headings) {
        return null;
    }

    let level: number | null = null;
    let startingPos: Pos | null = null;
    let endingPos: Pos | null = null;

    for (const heading of metadata.headings) {
        if (!level && heading.heading === headingText) {
            level = heading.level;
            startingPos = heading.position;
        } else if (level && heading.level <= level) {
            endingPos = heading.position;
            break;
        }
    }

    if (!level || !startingPos) {
        return null;
    }

    return { start: startingPos.end, end: endingPos?.start || endOfDoc };
};

const getListsUnderHeading = (
    headingText: string,
    metadata: CachedMetadata
): ListItemCache[] => {
    if (!metadata.listItems) {
        return [];
    }
    const endOfDoc = metadata.sections?.last()?.position.end;
    if (!endOfDoc) {
        return [];
    }
    const headingPos = getHeadingPosition(headingText, metadata, endOfDoc);
    if (!headingPos) {
        return [];
    }
    return metadata.listItems?.filter(
        (l) =>
            headingPos.start.offset < l.position.start.offset &&
            l.position.end.offset <= headingPos.end.offset
    );
};

const listRegex = /^(\s*)\-\s+(\[(.)\]\s+)?/;
const checkboxRegex = /^\s*\-\s+\[(.)\]\s+/;
const checkboxTodo = (s: string) => {
    const match = s.match(checkboxRegex);
    if (!match || !match[1]) {
        return null;
    }
    return match[1] === " " ? false : match[1];
};

const getInlineEventFromLine = (
    text: string,
    globalAttrs: Partial<OFCEvent>
): OFCEvent | null => {
    const attrs = getInlineAttributes(text);

    // Shortcut validation if there are no inline attributes.
    if (Object.keys(attrs).length === 0) {
        return null;
    }

    return validateEvent({
        title: text.replace(listRegex, "").replace(fieldRegex, "").trim(),
        completed: checkboxTodo(text),
        ...globalAttrs,
        ...attrs,
    });
};

function getAllInlineEventsFromFile(
    fileText: string,
    listItems: ListItemCache[],
    fileGlobalAttrs: Partial<OFCEvent>
): { lineNumber: number; event: OFCEvent }[] {
    const lines = fileText.split("\n");
    const listItemText: Line[] = listItems
        .map((i) => i.position.start.line)
        .map((idx) => ({ lineNumber: idx, text: lines[idx] }));

    return listItemText
        .map((l) => ({
            lineNumber: l.lineNumber,
            event: getInlineEventFromLine(l.text, {
                ...fileGlobalAttrs,
                type: "single",
            }),
        }))
        .flatMap(({ event, lineNumber }) =>
            event ? [{ event, lineNumber }] : []
        );
}

// SERIALIZATION

const generateInlineAttributes = (attrs: Record<string, any>): string => {
    return Object.entries(attrs)
        .map(([k, v]) => `[${k}:: ${v}]`)
        .join("  ");
};

const makeListItem = (
    data: OFCEvent,
    whitespacePrefix: string = ""
): string => {
    if (data.type !== "single") {
        throw new Error("Can only pass in single event.");
    }
    const { completed, title } = data;
    const checkbox = (() => {
        if (completed !== null && completed !== undefined) {
            return `[${completed ? "x" : " "}]`;
        }
        return null;
    })();

    const attrs: Partial<OFCEvent> = { ...data };
    delete attrs["completed"];
    delete attrs["title"];
    delete attrs["type"];
    delete attrs["date"];

    for (const key of <(keyof OFCEvent)[]>Object.keys(attrs)) {
        if (attrs[key] === undefined || attrs[key] === null) {
            delete attrs[key];
        }
    }

    if (!attrs["allDay"]) {
        delete attrs["allDay"];
    }

    return `${whitespacePrefix}- ${
        checkbox || ""
    } ${title} ${generateInlineAttributes(attrs)}`;
};

const modifyListItem = (line: string, data: OFCEvent): string | null => {
    const listMatch = line.match(listRegex);
    if (!listMatch) {
        console.warn(
            "Tried modifying a list item with a position that wasn't a list item",
            { line }
        );
        return null;
    }

    return makeListItem(data, listMatch[1]);
};

/**
 * Add a list item to a given heading.
 * If the heading is undefined, then append the heading to the end of the file.
 */
// TODO: refactor this to not do the weird props thing
type AddToHeadingProps = {
    heading: HeadingCache | undefined;
    item: OFCEvent;
    headingText: string;
};
const addToHeading = (
    page: string,
    { heading, item, headingText }: AddToHeadingProps
): { page: string; lineNumber: number } => {
    let lines = page.split("\n");

    const listItem = makeListItem(item);
    if (heading) {
        const headingLine = heading.position.start.line;
        const lineNumber = headingLine + 1;
        lines.splice(lineNumber, 0, listItem);
        return { page: lines.join("\n"), lineNumber };
    } else {
        lines.push(`## ${headingText}`);
        lines.push(listItem);
        return { page: lines.join("\n"), lineNumber: lines.length - 1 };
    }
};

export default class DailyNoteCalendar extends EditableCalendar {
    app: ObsidianInterface;
    heading: string;

    constructor(app: ObsidianInterface, color: string, heading: string) {
        super(color);
        appHasDailyNotesPluginLoaded();
        this.app = app;
        this.heading = heading;
    }

    get type(): CalendarInfo["type"] {
        return "dailynote";
    }
    get identifier(): string {
        return this.heading;
    }
    get name(): string {
        return `Daily note under "${this.heading}"`;
    }
    get directory(): string {
        const { folder } = getDailyNoteSettings();
        if (!folder) {
            throw new Error("Could not load daily note settings.");
        }
        return folder;
    }

    async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
        // @ts-ignore
        const date = getDateFromFile(file, "day")?.format(DATE_FORMAT);
        if (!date) {
            return [];
        }
        const cache = this.app.getMetadata(file);
        if (!cache) {
            return [];
        }
        const listItems = getListsUnderHeading(this.heading, cache);
        const inlineEvents = await this.app.process(file, (text) =>
            getAllInlineEventsFromFile(text, listItems, { date })
        );
        return inlineEvents.map(({ event, lineNumber }) => [
            event,
            { file, lineNumber },
        ]);
    }

    async getEvents(): Promise<EventResponse[]> {
        const notes = getAllDailyNotes();
        const files = Object.values(notes) as TFile[];
        return (
            await Promise.all(files.map((f) => this.getEventsInFile(f)))
        ).flat();
    }

    async createEvent(event: OFCEvent): Promise<EventLocation> {
        if (event.type !== "single" && event.type !== undefined) {
            console.debug(
                "tried creating a recurring event in a daily note",
                event
            );
            throw new Error("Cannot create a recurring event in a daily note.");
        }
        const m = moment(event.date);
        let file = getDailyNote(m, getAllDailyNotes()) as TFile;
        if (!file) {
            file = (await createDailyNote(m)) as TFile;
        }
		await this.app.read(file);
		await new Promise(resolve => setTimeout(resolve, 500));
        const metadata = await this.app.waitForMetadata(file);

        const headingInfo = metadata.headings?.find(
            (h) => h.heading == this.heading
        );
        if (!headingInfo) {
            throw new Error(
                `Could not find heading ${this.heading} in daily note ${file.path}.`
            );
        }

        let lineNumber = await this.app.rewrite(file, (contents) => {
            const { page, lineNumber } = addToHeading(contents, {
                heading: headingInfo,
                item: event,
                headingText: this.heading,
            });
            return [page, lineNumber] as [string, number];
        });
        return { file, lineNumber };
    }

    private getConcreteLocation({ path, lineNumber }: EventPathLocation): {
        file: TFile;
        lineNumber: number;
    } {
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(`File not found at path: ${path}`);
        }
        if (!lineNumber) {
            throw new Error(`Daily note events must have a line number.`);
        }
        return { file, lineNumber };
    }

    async deleteEvent(loc: EventPathLocation): Promise<void> {
        const { file, lineNumber } = this.getConcreteLocation(loc);
        this.app.rewrite(file, (contents) => {
            let lines = contents.split("\n");
            lines.splice(lineNumber, 1);
            return lines.join("\n");
        });
    }

    async modifyEvent(
        loc: EventPathLocation,
        newEvent: OFCEvent,
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<void> {
        console.debug("modified daily note event");
        if (newEvent.type !== "single" && newEvent.type !== undefined) {
            throw new Error(
                "Recurring events in daily notes are not supported."
            );
        }
        if (newEvent.endDate) {
            throw new Error(
                "Multi-day events are not supported in daily notes."
            );
        }
        const { file, lineNumber } = this.getConcreteLocation(loc);
        const oldDate = getDateFromFile(file as any, "day")?.format(
            DATE_FORMAT
        );
        if (!oldDate) {
            throw new Error(
                `Could not get date from file at path ${file.path}`
            );
        }
        if (newEvent.date !== oldDate) {
            // Event needs to be moved to a new file.
            console.debug("daily note event moving to a new file.");
            // TODO: Factor this out with the createFile path.
            const m = moment(newEvent.date);
            let newFile = getDailyNote(m, getAllDailyNotes()) as TFile;
            if (!newFile) {
                newFile = (await createDailyNote(m)) as TFile;
            }
            await this.app.read(newFile);

            const metadata = this.app.getMetadata(newFile);
            if (!metadata) {
                throw new Error("No metadata for file " + file.path);
            }
            const headingInfo = metadata.headings?.find(
                (h) => h.heading == this.heading
            );
            if (!headingInfo) {
                throw new Error(
                    `Could not find heading ${this.heading} in daily note ${file.path}.`
                );
            }

            await this.app.rewrite(file, async (oldFileContents) => {
                // Open the old file and remove the event.
                let lines = oldFileContents.split("\n");
                lines.splice(lineNumber, 1);
                await this.app.rewrite(newFile, (newFileContents) => {
                    // Before writing that change back to disk, open the new file and add the event.
                    const { page, lineNumber } = addToHeading(newFileContents, {
                        heading: headingInfo,
                        item: newEvent,
                        headingText: this.heading,
                    });
                    // Before any file changes are committed, call the updateCacheWithLocation callback to ensure
                    // the cache is properly updated with the new location.
                    updateCacheWithLocation({ file: newFile, lineNumber });
                    return page;
                });
                return lines.join("\n");
            });
        } else {
            console.debug("daily note event staying in same file.");
            updateCacheWithLocation({ file, lineNumber });
            await this.app.rewrite(file, (contents) => {
                const lines = contents.split("\n");
                const newLine = modifyListItem(lines[lineNumber], newEvent);
                if (!newLine) {
                    throw new Error("Did not successfully update line.");
                }
                lines[lineNumber] = newLine;
                return lines.join("\n");
            });
        }
    }

    move(
        from: EventPathLocation,
        to: EditableCalendar
    ): Promise<EventLocation> {
        throw new Error("Method not implemented.");
    }
}
