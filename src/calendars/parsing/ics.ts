import ical from "ical.js";
import { OFCEvent, validateEvent } from "../../types";
import { DateTime } from "luxon";
import { rrulestr } from "rrule";

function getDate(t: ical.Time): string {
    return DateTime.fromSeconds(t.toUnixTime()).toISODate();
}

function getTime(t: ical.Time): string {
    if (t.isDate) {
        return "00:00";
    }
    return DateTime.fromSeconds(t.toUnixTime()).toISOTime({
        includeOffset: false,
        includePrefix: false,
        suppressMilliseconds: true,
        suppressSeconds: true,
    });
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

function icsToOFC(input: ical.Event, tz: ical.Timezone | null): OFCEvent {
    const tzConvert = (time: ical.Time) => {
        let convertedTime = time;
        if (tz != null && tz.tzid != null && tz.tzid.length > 0) {
            convertedTime = time.convertToZone(tz);
        }
        return convertedTime.convertToZone(ical.Timezone.utcTimezone);
    };

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
                return getDate(exdate);
            });

        const startDate = tzConvert(input.startDate);
        return {
            type: "rrule",
            title: input.summary,
            id: `ics::${input.uid}::${getDate(startDate)}::recurring`,
            rrule: rrule.toString(),
            skipDates: exdates,
            startDate: getDate(startDate),
            ...(allDay
                ? { allDay: true }
                : {
                      allDay: false,
                      startTime: getTime(startDate),
                      endTime: getTime(tzConvert(input.endDate)),
                  }),
        };
    } else {
        const date = getDate(tzConvert(input.startDate));
        const endDate =
            specifiesEnd(input) && input.endDate
                ? getDate(tzConvert(input.endDate))
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
                      startTime: getTime(tzConvert(input.startDate)),
                      endTime: getTime(tzConvert(input.endDate)),
                  }),
        };
    }
}

export function getEventsFromICS(text: string): OFCEvent[] {
    const jCalData = ical.parse(text);
    const component = new ical.Component(jCalData);

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

    let tz: ical.Timezone | null = null;
    const tzc = component.getAllSubcomponents("vtimezone");
    if (tzc != null) {
        tz = new ical.Timezone(tzc[0]);
    }

    // Events with RECURRENCE-ID will have duplicated UIDs.
    // We need to modify the base event to exclude those recurrence exceptions.
    const baseEvents = Object.fromEntries(
        events
            .filter((e) => e.recurrenceId === null)
            .map((e) => [e.uid, icsToOFC(e, tz)])
    );

    const recurrenceExceptions = events
        .filter((e) => e.recurrenceId !== null)
        .map((e): [string, OFCEvent] => [e.uid, icsToOFC(e, tz)]);

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
