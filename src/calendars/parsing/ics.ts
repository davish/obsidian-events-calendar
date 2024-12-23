import ical from "ical.js";
import { OFCEvent, validateEvent } from "../../types";
import { DateTime } from "luxon";
import { rrulestr } from "rrule";

function getDate(dateTime: DateTime): string {
    return dateTime.toISODate();
}

function getTime(dateTime: DateTime): string {
    return dateTime.toISOTime({
        includeOffset: false,
        suppressMilliseconds: true,
        suppressSeconds: true,
    });
}

function extractEventUrl(iCalEvent: ical.Event): string {
    let urlProp = iCalEvent.component.getFirstProperty("url");
    return urlProp ? urlProp.getFirstValue() : "";
}


function specifiesEnd(iCalEvent: ical.Event): boolean {
    return Boolean(iCalEvent.component.getFirstProperty("dtend")) ||
           Boolean(iCalEvent.component.getFirstProperty("duration"));
}

function convertUtcToLocal(time: ical.Time): DateTime {
    const isUtc = !time.zone || time.zone.tzid === 'Z'; // Use 'Z' to detect standard UTC, otherwise its floating
    const jsDate = time.toJSDate();
    if (isUtc) {
        return DateTime.fromJSDate(jsDate, { zone: 'utc' }).setZone('local');
    }
    return DateTime.fromJSDate(jsDate, { zone: 'local' });
}

function icsToOFC(input: ical.Event): OFCEvent {
    const isAllDay = input.startDate.isDate;

    if (input.isRecurring()) {
        const rrule = rrulestr(input.component.getFirstProperty("rrule").getFirstValue().toString());
        const exdates = input.component.getAllProperties("exdate").map((exdateProp) => {
            const exdate = exdateProp.getFirstValue();
            return getDate(convertUtcToLocal(exdate));
        });

        return {
            type: "rrule",
            title: input.summary,
            id: `ics::${input.uid}::${getDate(convertUtcToLocal(input.startDate))}::recurring`,
            rrule: rrule.toString(),
            skipDates: exdates,
            startDate: getDate(convertUtcToLocal(input.startDate)),
            ...(isAllDay
                ? { allDay: true }
                : {
                      allDay: false,
                      startTime: getTime(convertUtcToLocal(input.startDate)),
                      endTime: getTime(convertUtcToLocal(input.endDate)),
                  }),
        };
    } else {
        const localStart = convertUtcToLocal(input.startDate);
        const localEnd = specifiesEnd(input) && input.endDate ? convertUtcToLocal(input.endDate) : undefined;
        return {
            type: "single",
            id: `ics::${input.uid}::${getDate(localStart)}::single`,
            title: input.summary,
            date: getDate(localStart),
            endDate: localEnd ? getDate(localEnd) : null,
            ...(isAllDay
                ? { allDay: true }
                : {
                      allDay: false,
                      startTime: getTime(localStart),
                      endTime: localEnd ? getTime(localEnd) : null,
                  }),
        };
    }
}

export function getEventsFromICS(text: string): OFCEvent[] {
    const jCalData = ical.parse(text);
    const component = new ical.Component(jCalData);

    const events: ical.Event[] = component.getAllSubcomponents("vevent")
        .map((vevent) => new ical.Event(vevent))
        .filter((evt) => {
            try {
                evt.startDate.toJSDate();
                if (evt.endDate) evt.endDate.toJSDate();
                return true;
            } catch (err) {
                return false;  // skip invalid date events
            }
        });

    const baseEvents = Object.fromEntries(
        events.filter((e) => e.recurrenceId === null).map((e) => [e.uid, icsToOFC(e)])
    );

    const recurrenceExceptions = events
        .filter((e) => e.recurrenceId !== null)
        .map((e) => [e.uid, icsToOFC(e)] as [string, OFCEvent]);

    for (const [uid, event] of recurrenceExceptions) {
        const baseEvent = baseEvents[uid];
        if (!baseEvent) continue;

        if (baseEvent.type !== "rrule" || event.type !== "single") {
            console.warn(
                "Recurrence exception was recurring or base event was not recurring",
                { baseEvent, recurrenceException: event }
            );
            continue;
        }
        baseEvent.skipDates.push(event.date);
    }

    return [...Object.values(baseEvents), ...recurrenceExceptions.map((e) => e[1])]
        .map(validateEvent)
        .flatMap((e) => (e ? [e] : []));
}
