import { CalendarInfo } from "./calendar_settings";

export type { OFCEvent } from "./schema";
export { validateEvent } from "./schema";

export { makeDefaultPartialCalendarSource } from "./calendar_settings";
export type { CalendarInfo } from "./calendar_settings";

export const PLUGIN_SLUG = "full-calendar-plugin";

export class FCError {
    message: string;
    constructor(message: string) {
        this.message = message;
    }
}

export type EventLocation = {
    file: { path: string };
    lineNumber: number | undefined;
};

export type Authentication = {
    type: "basic";
    username: string;
    password: string;
};

export type CalDAVSource = Extract<CalendarInfo, { type: "caldav" }>;