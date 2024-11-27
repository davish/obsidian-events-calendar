import * as React from "react";
import { useState } from "react";
import { CalendarInfo } from "../../types";

type ChangeListener = <T extends Partial<CalendarInfo>>(
    fromString: (val: string) => T
) => React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
type SourceWith<T extends Partial<CalendarInfo>, K> = T extends K ? T : never;

interface DirectorySelectProps<T extends Partial<CalendarInfo>> {
    source: T;
    changeListener: ChangeListener;
    directories: string[];
}

function DirectorySelect<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
    directories,
}: DirectorySelectProps<T>) {
    const dirOptions = [...directories];
    dirOptions.sort();

    let sourceWithDirectory = source as SourceWith<T, { directory: undefined }>;
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Directory</div>
                <div className="setting-item-description">
                    Directory to store events
                </div>
            </div>
            <div className="setting-item-control">
                <select
                    required
                    value={sourceWithDirectory.directory || ""}
                    onChange={changeListener((x) => ({
                        ...sourceWithDirectory,
                        directory: x,
                    }))}
                >
                    <option value="" disabled hidden>
                        Choose a directory
                    </option>
                    {dirOptions.map((o, idx) => (
                        <option key={idx} value={o}>
                            {o}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

interface BasicProps<T extends Partial<CalendarInfo>> {
    source: T;
    changeListener: ChangeListener;
}

function ColorPicker<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
}: BasicProps<T>) {
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Color</div>
                <div className="setting-item-description">
                    The color of events on the calendar
                </div>
            </div>
            <div className="setting-item-control">
                <input
                    required
                    type="color"
                    value={source.color}
                    style={{ maxWidth: "25%", minWidth: "3rem" }}
                    onChange={changeListener((x) => ({ ...source, color: x }))}
                />
            </div>
        </div>
    );
}

function UrlInput<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
}: BasicProps<T>) {
    let sourceWithUrl = source as SourceWith<T, { url: undefined }>;
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Url</div>
                <div className="setting-item-description">
                    Url of the server
                </div>
            </div>
            <div className="setting-item-control">
                <input
                    required
                    type="text"
                    value={sourceWithUrl.url || ""}
                    onChange={changeListener((x) => ({
                        ...sourceWithUrl,
                        url: x,
                    }))}
                />
            </div>
        </div>
    );
}

function UsernameInput<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
}: BasicProps<T>) {
    let sourceWithUsername = source as SourceWith<T, { username: undefined }>;
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Username</div>
                <div className="setting-item-description">
                    Username for the account
                </div>
            </div>
            <div className="setting-item-control">
                <input
                    required
                    type="text"
                    value={sourceWithUsername.username || ""}
                    onChange={changeListener((x) => ({
                        ...sourceWithUsername,
                        username: x,
                    }))}
                />
            </div>
        </div>
    );
}

function HeadingInput<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
    headings,
}: BasicProps<T> & { headings: string[] }) {
    let sourceWithHeading = source as SourceWith<T, { heading: undefined }>;
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Heading</div>
                <div className="setting-item-description">
                    Heading to store events under in the daily note.
                </div>
            </div>
            <div className="setting-item-control">
                {headings.length > 0 ? (
                    <select
                        required
                        value={sourceWithHeading.heading || ""}
                        onChange={changeListener((x) => ({
                            ...sourceWithHeading,
                            heading: x,
                        }))}
                    >
                        <option value="" disabled hidden>
                            Choose a heading
                        </option>
                        {headings.map((o, idx) => (
                            <option key={idx} value={o}>
                                {o}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input
                        required
                        type="text"
                        value={sourceWithHeading.heading || ""}
                        onChange={changeListener((x) => ({
                            ...sourceWithHeading,
                            heading: x,
                        }))}
                    />
                )}
            </div>
        </div>
    );
}

function PasswordInput<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
}: BasicProps<T>) {
    let sourceWithPassword = source as SourceWith<T, { password: undefined }>;
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Password</div>
                <div className="setting-item-description">
                    Password for the account
                </div>
            </div>
            <div className="setting-item-control">
                <input
                    required
                    type="password"
                    value={sourceWithPassword.password || ""}
                    onChange={changeListener((x) => ({
                        ...sourceWithPassword,
                        password: x,
                    }))}
                />
            </div>
        </div>
    );
}

interface AddCalendarProps {
    source: Partial<CalendarInfo>;
    directories: string[];
    headings: string[];
    submit: (source: CalendarInfo) => Promise<void>;
}

export const AddCalendarSource = ({
    source,
    directories,
    headings,
    submit,
}: AddCalendarProps) => {
    const isCalDAV = source.type === "caldav";

    const [setting, setSettingState] = useState(source);
    const [isTimeInNoteTitle, setIsTimeInNoteTitle] = useState(false);
    const [submitting, setSubmitingState] = useState(false);
    const [submitText, setSubmitText] = useState(
        isCalDAV ? "Import Calendars" : "Add Calendar"
    );

    function makeChangeListener<T extends Partial<CalendarInfo>>(
        fromString: (val: string) => T
    ): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> {
        return (e) => setSettingState(fromString(e.target.value));
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!submitting) {
            setSubmitingState(true);
            setSubmitText(isCalDAV ? "Importing Calendars" : "Adding Calendar");
            await submit(setting as CalendarInfo);
        }
    };

    return (
        <div className="vertical-tab-content">
            <form onSubmit={handleSubmit}>
                {!isCalDAV && (
                    // CalDAV can import multiple calendars. Instead of picking
                    // a single color to be used for all calendars, default to the
                    // colors reported from the server. Users can change that later
                    // if they wish.
                    <ColorPicker
                        source={setting}
                        changeListener={makeChangeListener}
                    />
                )}
                {source.type === "local" && (
                    <DirectorySelect
                        source={setting}
                        changeListener={makeChangeListener}
                        directories={directories}
                    />
                )}
                {source.type === "local" && (
                    <div className="setting-item">
                        <div className="setting-item-info">
                            <div className="setting-item-name">
                                Time in note title
                            </div>
                            <div className="setting-item-description">
                                Format note title as &lt;YYYY-MM-DD&gt;
                                &lt;HHDD&gt; &lt;Event title&gt;.md.
                            </div>
                        </div>
                        <div className="setting-item-control">
                            <input
                                checked={isTimeInNoteTitle}
                                onChange={(e) =>
                                    setIsTimeInNoteTitle(e.target.checked)
                                }
                                type="checkbox"
                            />
                        </div>
                    </div>
                )}
                {source.type === "dailynote" && (
                    <HeadingInput
                        source={setting}
                        changeListener={makeChangeListener}
                        headings={headings}
                    />
                )}
                {source.type === "ical" || source.type === "caldav" ? (
                    <UrlInput
                        source={setting}
                        changeListener={makeChangeListener}
                    />
                ) : null}
                {isCalDAV && (
                    <UsernameInput
                        source={setting}
                        changeListener={makeChangeListener}
                    />
                )}
                {isCalDAV && (
                    <PasswordInput
                        source={setting}
                        changeListener={makeChangeListener}
                    />
                )}
                <div className="setting-item">
                    <div className="setting-item-info" />
                    <div className="setting-control">
                        <button
                            className="mod-cta"
                            type="submit"
                            disabled={submitting}
                        >
                            {submitText}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};
