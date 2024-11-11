/**
 * @see https://github.com/unicode-org/cldr/blob/main/common/supplemental/windowsZones.xml
 *
 * Outlook sometimes calendars have and issue, when events
 * will have timezone that is not listed in .ics as VTIMEZONE.
 * E.g. .ics file can have only 'Central Europe Standard Time' VTIMEZONE,
 * but contain events in both 'Central Europe Standard Time' and 'Romance Standart Time'
 * because both refer to UTC+01:00.
 *
 * With assumption that at least one VTIMEZONE is listed in .ics,
 * this simple collection of aliases for windows timezones
 * can be used to fill in or find missing VTIMIZEONEs for events.
 *
 * It is cheaper that loading actual IANA timezones and recovering VTIMIZONEs
 * from them or other such solutions.
 */
const WINDOWS_TIMEZONE_ALIASES = {
    // 'UTC-12:00': new Set(['Dateline Standard Time']),
    "UTC-10:00": new Set(["Aleutian Standard Time", "Hawaiian Standard Time"]),
    // 'UTC-09:30': new Set(['Marquesas Standard Time']),
    "UTC-09:00": new Set(["Alaskan Standard Time", "UTC-09"]),
    "UTC-08:00": new Set([
        "Pacific Standard Time (Mexico)",
        "Pacific Standard Time",
        "UTC-08",
    ]),
    "UTC-07:00": new Set([
        "Mountain Standard Time (Mexico)",
        "US Mountain Standard Time",
        "Mountain Standard Time",
        "Yukon Standard Time",
    ]),
    "UTC-06:00": new Set([
        "Central America Standard Time",
        "Central Standard Time",
        "Easter Island Standard Time",
        "Central Standard Time (Mexico)",
        "Canada Central Standard Time",
    ]),
    "UTC-05:00": new Set([
        "SA Pacific Standard Time",
        "Eastern Standard Time (Mexico)",
        "Eastern Standard Time",
        "Haiti Standard Time",
        "Cuba Standard Time",
        "US Eastern Standard Time",
        "Turks And Caicos Standard Time",
    ]),
    "UTC-04:00": new Set([
        "Paraguay Standard Time",
        "Atlantic Standard Time",
        "Venezuela Standard Time",
        "Central Brazilian Standard Time",
        "SA Western Standard Time",
        "Pacific SA Standard Time",
    ]),
    // 'UTC-03:30': new Set(['Newfoundland Standard Time']),
    "UTC-03:00": new Set([
        "Tocantins Standard Time",
        "E. South America Standard Time",
        "SA Eastern Standard Time",
        "Argentina Standard Time",
        "Greenland Standard Time",
        "Montevideo Standard Time",
        "Magallanes Standard Time",
        "Saint Pierre Standard Time",
        "Bahia Standard Time",
    ]),
    // 'UTC-02:00': new Set(['UTC-02']),
    "UTC-01:00": new Set(["Azores Standard Time", "Cape Verde Standard Time"]),
    "UTC-00:00": new Set([
        "UTC",
        "UTC-00",
        "GMT Standard Time",
        "Greenwich Standard Time",
        "Sao Tome Standard Time",
    ]),
    "UTC+01:00": new Set([
        "Morocco Standard Time",
        "W. Europe Standard Time",
        "Central Europe Standard Time",
        "Romance Standard Time",
        "Central European Standard Time",
        "W. Central Africa Standard Time",
    ]),
    "UTC+02:00": new Set([
        "Jordan Standard Time",
        "GTB Standard Time",
        "Middle East Standard Time",
        "Egypt Standard Time",
        "E. Europe Standard Time",
        "Syria Standard Time",
        "West Bank Standard Time",
        "South Africa Standard Time",
        "FLE Standard Time",
        "Israel Standard Time",
        "South Sudan Standard Time",
        "Kaliningrad Standard Time",
        "Sudan Standard Time",
        "Libya Standard Time",
        "Namibia Standard Time",
    ]),
    "UTC+03:00": new Set([
        "Arabic Standard Time",
        "Turkey Standard Time",
        "Arab Standard Time",
        "Belarus Standard Time",
        "Russian Standard Time",
        "E. Africa Standard Time",
    ]),
    // 'UTC+03:30': new Set(['Iran Standard Time']),
    "UTC+04:00": new Set([
        "Arabian Standard Time",
        "Astrakhan Standard Time",
        "Azerbaijan Standard Time",
        "Russia Time Zone 3",
        "Mauritius Standard Time",
        "Saratov Standard Time",
        "Georgian Standard Time",
        "Volgograd Standard Time",
        "Caucasus Standard Time",
    ]),
    // 'UTC+04:30': new Set(['Afghanistan Standard Time']),
    "UTC+05:00": new Set([
        "West Asia Standard Time",
        "Ekaterinburg Standard Time",
        "Pakistan Standard Time",
        "Qyzylorda Standard Time",
    ]),
    "UTC+05:30": new Set(["India Standard Time", "Sri Lanka Standard Time"]),
    // 'UTC+05:45': new Set(['Nepal Standard Time']),
    "UTC+06:00": new Set([
        "Central Asia Standard Time",
        "Bangladesh Standard Time",
        "Omsk Standard Time",
    ]),
    // 'UTC+06:30': new Set(['Myanmar Standard Time']),
    "UTC+07:00": new Set([
        "SE Asia Standard Time",
        "Altai Standard Time",
        "W. Mongolia Standard Time",
        "North Asia Standard Time",
        "N. Central Asia Standard Time",
        "Tomsk Standard Time",
    ]),
    "UTC+08:00": new Set([
        "China Standard Time",
        "North Asia East Standard Time",
        "Singapore Standard Time",
        "W. Australia Standard Time",
        "Taipei Standard Time",
        "Ulaanbaatar Standard Time",
    ]),
    // 'UTC+08:45': new Set(['Aus Central W. Standard Time']),
    "UTC+09:00": new Set([
        "Transbaikal Standard Time",
        "Tokyo Standard Time",
        "North Korea Standard Time",
        "Korea Standard Time",
        "Yakutsk Standard Time",
    ]),
    "UTC+09:30": new Set([
        "Cen. Australia Standard Time",
        "AUS Central Standard Time",
    ]),
    "UTC+10:00": new Set([
        "E. Australia Standard Time",
        "AUS Eastern Standard Time",
        "West Pacific Standard Time",
        "Tasmania Standard Time",
        "Vladivostok Standard Time",
    ]),
    // 'UTC+10:30': new Set(['Lord Howe Standard Time']),
    "UTC+11:00": new Set([
        "Bougainville Standard Time",
        "Russia Time Zone 10",
        "Magadan Standard Time",
        "Norfolk Standard Time",
        "Sakhalin Standard Time",
        "Central Pacific Standard Time",
    ]),
    "UTC+12:00": new Set([
        "Russia Time Zone 11",
        "New Zealand Standard Time",
        "UTC+12",
        "Fiji Standard Time",
    ]),
    // 'UTC+12:45': new Set(['Chatham Islands Standard Time']),
    "UTC+13:00": new Set([
        "UTC+13",
        "Tonga Standard Time",
        "Samoa Standard Time",
    ]),
    // 'UTC+14:00': new Set(['Line Islands Standard Time'])
} as Record<string, Set<string>>;

/**
 * Returns aliases for given timezone.
 * Result includes [tzName] itself, so it always contains at least one element
 */
export function getWindowsTimezoneAliases(tzName: string): string[] {
    for (const offset in WINDOWS_TIMEZONE_ALIASES) {
        if (WINDOWS_TIMEZONE_ALIASES[offset].has(tzName)) {
            return [...WINDOWS_TIMEZONE_ALIASES[offset]];
        }
    }

    return [tzName];
}
