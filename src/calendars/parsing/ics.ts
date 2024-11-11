import ical from "ical.js";
import { OFCEvent, validateEvent } from "../../types";
import { DateTime } from "luxon";
import { rrulestr } from "rrule";
import { getWindowsTimezoneAliases } from "./windows";
const LOCAL_TIME_ZONE = DateTime.local().zone;

class Timezones {
    private timezones: Map<string, ical.Timezone>;
    constructor(root: ical.Component) {
        this.timezones = new Map();
        (root.getAllSubcomponents("vtimezone") || []).forEach((tz) => {
            const timezone = new ical.Timezone(tz);
            this.timezones.set(timezone.tzid, timezone);
        });

        // set aliases for windows timezones
        // since outlook calendars may not list them
        // as separate VTIMEZONE elements, but still use in events
        this.timezones.forEach((timezone) => {
            const aliases = getWindowsTimezoneAliases(timezone.tzid);
            if (aliases.length > 1) {
                aliases
                    .filter((alias) => !this.timezones.has(alias))
                    .forEach((alias) => this.timezones.set(alias, timezone));
            }
        });
    }
    /**
     * Returns new [ical.Time] converted to UTC zone
     */
    toUTC(t: ical.Time): ical.Time {
        const tt = t.clone();
        // using explicit zones collected earlier instead of [t.zone],
        // because [t.zone] will often contain incorrect "floating" zone
        // and therefore be useless for actual offset shift.
        const tz = this.timezones.get(t.timezone);
        if (tz) {
            ical.Timezone.convert_time(tt, tz, ical.Timezone.utcTimezone);
        }

        return tt;
    }

    /**
     * Converts ICal time to ISODate string in local timezone.
     */
    getDate(t: ical.Time): string {
        return DateTime.fromSeconds(this.toUTC(t).toUnixTime(), { zone: "UTC" })
            .setZone(LOCAL_TIME_ZONE)
            .toISODate();
    }

    /**
     * Converts ICal time to ISOTime string  in local timezone.
     */
    getTime(t: ical.Time): string {
        if (t.isDate) {
            return "00:00";
        }

        return DateTime.fromSeconds(this.toUTC(t).toUnixTime(), { zone: "UTC" })
            .setZone(LOCAL_TIME_ZONE)
            .toISOTime({
                includeOffset: false,
                includePrefix: false,
                suppressMilliseconds: true,
                suppressSeconds: true,
            });
    }
}

function extractEventUrl(iCalEvent: ical.Event): string {
    let urlProp = iCalEvent.component.getFirstProperty("url");
    return urlProp ? urlProp.getFirstValue() : "";
}

function specifiesEnd(iCalEvent: ical.Event) {
    return (
        Boolean(iCalEvent.component.getFirstProperty("dtend")) ||
        Boolean(iCalEvent.component.getFirstProperty("duration"))
    );
}

function icsToOFC(input: ical.Event, timezones: Timezones): OFCEvent {
    if (input.isRecurring()) {
        const rrule = rrulestr(
            input.component.getFirstProperty("rrule").getFirstValue().toString()
        );
        const allDay = input.startDate.isDate;
        const exdates = input.component
            .getAllProperties("exdate")
            .map((exdateProp) => {
                const exdate = exdateProp.getFirstValue();
                // NOTE: We only store the date from an exdate and recreate the full datetime exdate later,
                // so recurring events with exclusions that happen more than once per day are not supported.
                return timezones.getDate(exdate);
            });

        const idDate = timezones.getTime(input.endDate);
        return {
            type: "rrule",
            title: input.summary,
            id: `ics::${input.uid}::${idDate}::recurring`,
            rrule: rrule.toString(),
            skipDates: exdates,
            startDate: timezones.getDate(input.startDate),
            ...(allDay
                ? { allDay: true }
                : {
                      allDay: false,
                      startTime: timezones.getTime(input.startDate),
                      endTime: timezones.getTime(input.endDate),
                  }),
        };
    } else {
        const date = timezones.getDate(input.startDate);
        const endDate =
            specifiesEnd(input) && input.endDate
                ? timezones.getDate(input.endDate)
                : undefined;
        const allDay = input.startDate.isDate;
        return {
            type: "single",
            id: `ics::${input.uid}::${date}::single`,
            title: input.summary,
            date,
            endDate: date !== endDate ? endDate || null : null,
            ...(allDay
                ? { allDay: true }
                : {
                      allDay: false,
                      startTime: timezones.getTime(input.startDate),
                      endTime: timezones.getTime(input.endDate),
                  }),
        };
    }
}

export function getEventsFromICS(text: string): OFCEvent[] {
    const jCalData = ical.parse(text);
    const component = new ical.Component(jCalData);
    const timezones = new Timezones(component);

    const events: ical.Event[] = component
        .getAllSubcomponents("vevent")
        .map((vevent) => new ical.Event(vevent))
        .filter((evt) => {
            evt.iterator;
            try {
                evt.startDate.toJSDate();
                evt.endDate.toJSDate();
                return true;
            } catch (err) {
                // skipping events with invalid time
                return false;
            }
        });

    // Events with RECURRENCE-ID will have duplicated UIDs.
    // We need to modify the base event to exclude those recurrence exceptions.
    const baseEvents = Object.fromEntries(
        events
            .filter((e) => e.recurrenceId === null)
            .map((e) => [e.uid, icsToOFC(e, timezones)])
    );

    const recurrenceExceptions = events
        .filter((e) => e.recurrenceId !== null)
        .map((e): [string, OFCEvent] => [e.uid, icsToOFC(e, timezones)]);

    for (const [uid, event] of recurrenceExceptions) {
        const baseEvent = baseEvents[uid];
        if (!baseEvent) {
            continue;
        }

        if (baseEvent.type !== "rrule" || event.type !== "single") {
            console.warn(
                "Recurrence exception was recurring or base event was not recurring",
                { baseEvent, recurrenceException: event }
            );
            continue;
        }
        baseEvent.skipDates.push(event.date);
    }

    const allEvents = Object.values(baseEvents).concat(
        recurrenceExceptions.map((e) => e[1])
    );

    return allEvents.map(validateEvent).flatMap((e) => (e ? [e] : []));
}
