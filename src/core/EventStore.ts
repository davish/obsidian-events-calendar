import { Calendar } from "../calendars/Calendar";
import { EventLocation, OFCEvent } from "../types";

interface Identifier {
    id: string;
}

class Path implements Identifier {
    id: string;
    constructor(file: { path: string }) {
        this.id = file.path;
    }
}

class EventID implements Identifier {
    id: string;
    constructor(id: string) {
        this.id = id;
    }
}

/**
 * Class modeling a one-to-many relationship.
 */
class OneToMany<T extends Identifier, FK extends Identifier> {
    private foreign: Map<string, string> = new Map();
    private related: Map<string, Set<string>> = new Map();

    clear() {
        this.foreign.clear();
        this.related.clear();
    }

    add(one: T, many: FK) {
        this.foreign.set(many.id, one.id);
        let related = this.related.get(one.id);
        if (!related) {
            related = new Set();
            this.related.set(one.id, related);
        }
        related.add(many.id);
    }

    delete(many: FK) {
        const oneId = this.foreign.get(many.id);
        if (!oneId) {
            return;
        }
        this.foreign.delete(many.id);
        const related = this.related.get(oneId);
        if (!related) {
            throw new Error(
                `Unreachable: state: relation <${oneId}> exists in the foreign map but not the related map.`
            );
        }
        related.delete(many.id);
    }

    getBy(key: T): Set<string> {
        const related = this.related.get(key.id);
        if (!related) {
            return new Set();
        }
        return new Set(related);
    }

    getRelated(key: FK): string | null {
        return this.foreign.get(key.id) || null;
    }

    renameKey(oldKey: T, newKey: T) {
        const related = this.related.get(oldKey.id);
        if (!related) {
            throw new Error(`Key does not exist in map: ${related}`);
        }
        this.related.delete(oldKey.id);
        this.related.set(newKey.id, related);
    }

    get numEntries(): number {
        return this.foreign.size;
    }

    get relatedCount(): number {
        return [...this.related.values()].filter((s) => s.size > 0).length;
    }

    get groupByRelated(): Map<string, string[]> {
        const result: Map<string, string[]> = new Map();
        for (const [key, values] of this.related.entries()) {
            result.set(key, [...values.values()]);
        }
        return result;
    }
}

export type EventPathLocation = {
    path: string;
    lineNumber: number | undefined;
};

export type StoredEvent = {
    id: string;
    event: OFCEvent;
    location: EventPathLocation | null;
    calendarId: string;
};

type AddEventProps = {
    calendar: Calendar;
    location: EventLocation | null;
    id: string;
    event: OFCEvent;
};

type EventDetails = Omit<AddEventProps, "location" | "calendar"> & {
    location: EventPathLocation | null;
    calendarId: string;
};

type FileObj = { path: string };

/**
 * Class that stores events by their ID as the primary key, with secondary "indexes"
 * by calendar and file. You can look up events by what calendar they belong to, as
 * well as what file their source lives in.
 */
export default class EventStore {
    private store: Map<string, OFCEvent> = new Map();

    private calendarIndex = new OneToMany<Calendar, EventID>();

    private pathIndex = new OneToMany<Path, EventID>();
    private lineNumbers: Map<string, number> = new Map();

    clear() {
        const ids = [...this.store.keys()];
        this.store.clear();
        this.calendarIndex.clear();
        this.pathIndex.clear();
        this.lineNumbers.clear();
        return ids;
    }

    /**
     * Number of files that contain events in the store.
     */
    get fileCount() {
        return this.pathIndex.relatedCount;
    }

    /**
     * Number of calendars with events in the store.
     */
    get calendarCount() {
        return this.calendarIndex.relatedCount;
    }

    /**
     * Number of events in the store.
     */
    get eventCount() {
        return this.store.size;
    }

    /**
     * Given a list of event IDs, return all information the store contains on those events.
     * @param ids IDs of events to retrieve information about
     * @returns List of event information contained in the cache.
     */
    private fetch(ids: string[] | Set<string>): StoredEvent[] {
        const result: StoredEvent[] = [];
        ids.forEach((id) => {
            const event = this.store.get(id);
            if (!event) {
                return;
            }
            const path = this.pathIndex.getRelated(new EventID(id));
            let lineNumber: number | undefined = undefined;
            if (path) {
                lineNumber = this.lineNumbers.get(id);
            }
            const location = path ? { path, lineNumber } : null;
            const calendarId = this.calendarIndex.getRelated(new EventID(id));
            if (!calendarId) {
                throw new Error(
                    `Event with id ${id} does not have an associated calendar.`
                );
            }
            result.push({ id, event, location, calendarId });
        });
        return result;
    }

    has(id: string): boolean {
        return this.store.has(id);
    }

    /**
     * Add a new event to the store with given associations.
     * @param param0
     * @returns ID for event in the store.
     */
    add({ calendar, location, id, event }: AddEventProps): string {
        if (this.store.has(id)) {
            throw new Error(
                `Event with given ID "${id}" that was supposed to be added to calendar "${
                    calendar.id
                }" already exists in the EventStore within calendar "${this.calendarIndex.getRelated(
                    new EventID(id)
                )}".`
            );
        }

        console.debug("adding event", { id, event, location });

        this.store.set(id, event);
        this.calendarIndex.add(calendar, new EventID(id));
        if (location) {
            const { file, lineNumber } = location;
            console.debug("adding event in file:", file.path);
            this.pathIndex.add(new Path(file), new EventID(id));
            if (lineNumber) {
                this.lineNumbers.set(id, lineNumber);
            }
        }
        return id;
    }

    /**
     * Delete an event in the store.
     * @param id ID of event to delete.
     * @returns The event if it was in the store, null otherwise.
     */
    delete(id: string): OFCEvent | null {
        const event = this.store.get(id);
        if (!event) {
            return null;
        }
        console.debug("deleting event", { id, event });

        this.calendarIndex.delete(new EventID(id));
        this.pathIndex.delete(new EventID(id));
        this.lineNumbers.delete(id);
        this.store.delete(id);
        return event;
    }

    deleteEventsAtPath(path: string): Set<string> {
        const eventIds = this.pathIndex.getBy(new Path({ path }));
        eventIds.forEach((id) => this.delete(id));
        return eventIds;
    }

    deleteEventsInCalendar(calendar: Calendar): Set<string> {
        const eventIds = this.calendarIndex.getBy(calendar);
        eventIds.forEach((id) => this.delete(id));
        return eventIds;
    }

    getEventById(id: string): OFCEvent | null {
        return this.store.get(id) || null;
    }

    getEventsInFile(file: FileObj): StoredEvent[] {
        return this.fetch(this.pathIndex.getBy(new Path(file)));
    }

    getEventsInCalendar(calendar: Calendar): StoredEvent[] {
        return this.fetch(this.calendarIndex.getBy(calendar));
    }

    getEventsInFileAndCalendar(
        file: FileObj,
        calendar: Calendar
    ): StoredEvent[] {
        const inFile = this.pathIndex.getBy(new Path(file));
        const inCalendar = this.calendarIndex.getBy(calendar);
        return this.fetch([...inFile].filter((id) => inCalendar.has(id)));
    }

    get eventsByCalendar(): Map<string, StoredEvent[]> {
        const result = new Map();
        for (const [k, vs] of this.calendarIndex.groupByRelated) {
            result.set(k, this.fetch(vs));
        }
        return result;
    }

    getEventDetails(eventId: string): EventDetails | null {
        const event = this.getEventById(eventId);
        const calendarId = this.calendarIndex.getRelated(new EventID(eventId));
        if (!event || !calendarId) {
            return null;
        }

        const path = this.pathIndex.getRelated(new EventID(eventId));
        const lineNumber = this.lineNumbers.get(eventId);
        const location = path ? { path, lineNumber } : null;
        return { id: eventId, event, calendarId, location };
    }
}
