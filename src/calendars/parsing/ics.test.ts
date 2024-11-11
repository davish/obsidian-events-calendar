import { getEventsFromICS } from "./ics";
import { DateTime } from "luxon";

const LOCAL_TIME_ZONE = DateTime.local().zone;
const VTIMEZONE_GEORGIAN = `BEGIN:VTIMEZONE
TZID:Georgian Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0400
TZOFFSETTO:+0400
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T000000
TZOFFSETFROM:+0400
TZOFFSETTO:+0400
END:DAYLIGHT
END:VTIMEZONE`;

const VTIMEZONE_UTC0 = `BEGIN:VTIMEZONE
TZID:UTC
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0000
TZOFFSETTO:+0000
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T000000
TZOFFSETFROM:+0000
TZOFFSETTO:+0000
END:DAYLIGHT
END:VTIMEZONE`;

describe("ics tests", () => {
    it("parses all day event", () => {
        const ics = `BEGIN:VCALENDAR
PRODID:blah
X-WR-CALNAME:Test calendar
X-WR-TIMEZONE:Etc/UTC
VERSION:2.0
CALSCALE:GREGORIAN
X-PUBLISHED-TTL:PT5M
METHOD:PUBLISH
BEGIN:VEVENT
UID:7389432083-0-40713-74006
SEQUENCE:1
CLASS:PUBLIC
CREATED:20200101T000000Z
GEO:40.7128;-74.006
DTSTAMP:20230226T143136Z
DTSTART;VALUE=DATE:20230226
DESCRIPTION:Description!
LOCATION:New york city
URL:https://www.example.com
STATUS:CONFIRMED
SUMMARY:EVENT TITLE
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR`;
        const events = getEventsFromICS(ics);
        expect(events).toMatchSnapshot(ics);
    });

    it("parses gcal ics file", () => {
        const ics = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Obsidian Test Calendar
X-WR-TIMEZONE:UTC
${VTIMEZONE_UTC0}
BEGIN:VEVENT
DTSTART;VALUE=DATE:20220302
DTEND;VALUE=DATE:20220303
DTSTAMP:20230302T233513Z
UID:5r09pnnlktaqivstai5vlbqb1h@google.com
CREATED:20220226T211158Z
DESCRIPTION:
LAST-MODIFIED:20220226T214634Z
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:All day event
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=UTC:20220301T110000
DTEND;TZID=UTC:20220301T123000
RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=TH,TU
DTSTAMP:20230302T233513Z
UID:5tt2avr2th0h65homv3b6jeqof@google.com
CREATED:20220226T211144Z
DESCRIPTION:
LAST-MODIFIED:20220226T214627Z
LOCATION:
SEQUENCE:1
STATUS:CONFIRMED
SUMMARY:Recurring event
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART:20220228T164500Z
DTEND:20220228T194500Z
DTSTAMP:20230302T233513Z
UID:40mdbe6fvc1rmd60n6r0c3go7e@google.com
X-GOOGLE-CONFERENCE:https://meet.google.com/riu-josb-pdb
CREATED:20220226T210517Z
DESCRIPTION:This is an example <i>event.</i>\n\nJoin with Google Meet: http
    s://meet.google.com/riu-josb-pdb\nOr dial: (US) +1 609-726-6186 PIN: 156393
    865#\nMore phone numbers: https://tel.meet/riu-josb-pdb?pin=1416269198709&h
    s=7\n\nLearn more about Meet at: https://support.google.com/a/users/answer/
    9282720
LAST-MODIFIED:20220226T214608Z
LOCATION:
SEQUENCE:1
STATUS:CONFIRMED
SUMMARY:Hello\, iCal!
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART:20220219T190000Z
DTEND:20220219T230000Z
DTSTAMP:20230302T233513Z
UID:44hekcaaf0or7547vhqa772mqj@google.com
CREATED:20220220T002201Z
DESCRIPTION:
LAST-MODIFIED:20220220T002201Z
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Work on GCal Sync
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20220216
DTEND;VALUE=DATE:20220217
DTSTAMP:20230302T233513Z
UID:7ooluqb717vabebvc9gkc38c9l@google.com
CREATED:20220220T002146Z
DESCRIPTION:
LAST-MODIFIED:20220220T002146Z
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Announce Beta
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR
        `;
        const events = getEventsFromICS(ics);
        expect(events).toMatchSnapshot(ics);
    });

    it("should convert timezones correctly using defined VTIMEZONE", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "METHOD:PUBLISH",
            "PRODID:Microsoft Exchange Server 2010",
            "VERSION:2.0",
            "X-WR-CALNAME:Calendar",
            VTIMEZONE_GEORGIAN,

            "BEGIN:VEVENT",
            "DESCRIPTION: Event With TimeZone",
            "EXDATE;TZID=Georgian Standard Time:20231225T150000",
            "SUMMARY: Event With TimeZone",
            "DTSTART;TZID=Georgian Standard Time:20231225T150000",
            "DTEND;TZID=Georgian Standard Time:20231225T160000",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\n");

        const events = getEventsFromICS(ics) as any[];
        expect(events.length).toBe(1);

        expect(events[0].endTime).toBe(timeFromUTCSeconds(1703505600));
        expect(events[0].startTime).toBe(timeFromUTCSeconds(1703502000));
    });

    it("should convert timezones correctly using alias for VTIMEZONE", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "METHOD:PUBLISH",
            "PRODID:Microsoft Exchange Server 2010",
            "VERSION:2.0",
            "X-WR-CALNAME:Calendar",
            VTIMEZONE_GEORGIAN,

            "BEGIN:VEVENT",
            "DESCRIPTION: Event With Alias",
            "EXDATE;TZID=Caucasus Standard Time:20231225T150000",
            "SUMMARY: Event With Alias",
            "DTSTART;TZID=Caucasus Standard Time:20231225T150000",
            "DTEND;TZID=Caucasus Standard Time:20231225T160000",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\n");

        const events = getEventsFromICS(ics) as any[];
        expect(events.length).toBe(1);

        expect(events[0].endTime).toBe(timeFromUTCSeconds(1703505600));
        expect(events[0].startTime).toBe(timeFromUTCSeconds(1703502000));
    });

    it("should fall back to UTC timezone if no VTIMEZONE found for event", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "METHOD:PUBLISH",
            "PRODID:Microsoft Exchange Server 2010",
            "VERSION:2.0",
            "X-WR-CALNAME:Calendar",
            VTIMEZONE_GEORGIAN,

            "BEGIN:VEVENT",
            "DESCRIPTION: Event With Alias",
            "EXDATE;TZID=Unknown Time:20231225T150000",
            "SUMMARY: Event With Alias",
            "DTSTART;TZID=Unknown Time:20231225T150000",
            "DTEND;TZID=Unknown Time:20231225T160000",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\n");

        const events = getEventsFromICS(ics) as any[];
        expect(events.length).toBe(1);

        expect(events[0].endTime).toBe(timeFromUTCSeconds(1703520000));
        expect(events[0].startTime).toBe(timeFromUTCSeconds(1703516400));
    });
});

function timeFromUTCSeconds(timestamp: number): string {
    return DateTime.fromSeconds(timestamp, { zone: "UTC" })
        .setZone(LOCAL_TIME_ZONE)
        .toISOTime({
            includeOffset: false,
            includePrefix: false,
            suppressMilliseconds: true,
            suppressSeconds: true,
        });
}
