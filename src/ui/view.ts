import "./overrides.css";
import { ItemView, Menu, Notice, WorkspaceLeaf } from "obsidian";
import { Calendar, EventSourceInput } from "@fullcalendar/core";
import { renderCalendar } from "./calendar";
import FullCalendarPlugin from "../main";
import { FCError, PLUGIN_SLUG } from "../types";
import {
    dateEndpointsToFrontmatter,
    fromEventApi,
    toEventInput,
} from "./interop";
import { renderOnboarding } from "./onboard";
import { openFileForEvent } from "./actions";
import { launchCreateModal, launchEditModal } from "./event_modal";
import { isTask, toggleTask, unmakeTask } from "src/ui/tasks";
import { UpdateViewCallback } from "src/core/EventCache";

export const FULL_CALENDAR_VIEW_TYPE = "full-calendar-view";
export const FULL_CALENDAR_SIDEBAR_VIEW_TYPE = "full-calendar-sidebar-view";

function getCalendarColors(color: string | null | undefined): {
    color: string;
    textColor: string;
} {
    let textVar = getComputedStyle(document.body).getPropertyValue(
        "--text-on-accent"
    );
    if (color) {
        const m = color
            .slice(1)
            .match(color.length == 7 ? /(\S{2})/g : /(\S{1})/g);
        if (m) {
            const r = parseInt(m[0], 16),
                g = parseInt(m[1], 16),
                b = parseInt(m[2], 16);
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (brightness > 150) {
                textVar = "black";
            }
        }
    }

    return {
        color:
            color ||
            getComputedStyle(document.body).getPropertyValue(
                "--interactive-accent"
            ),
        textColor: textVar,
    };
}

export class CalendarView extends ItemView {
    plugin: FullCalendarPlugin;
    inSidebar: boolean;
    fullCalendarView: Calendar | null = null;
    callback: UpdateViewCallback | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        plugin: FullCalendarPlugin,
        inSidebar = false
    ) {
        super(leaf);
        this.plugin = plugin;
        this.inSidebar = inSidebar;
    }

    getIcon(): string {
        return "calendar-glyph";
    }

    getViewType() {
        return this.inSidebar
            ? FULL_CALENDAR_SIDEBAR_VIEW_TYPE
            : FULL_CALENDAR_VIEW_TYPE;
    }

    getDisplayText() {
        return this.inSidebar ? "Full Calendar" : "Calendar";
    }

    translateSources() {
        return this.plugin.cache.getAllEvents().map(
            ({ events, editable, color, id }): EventSourceInput => ({
                id,
                events: events.flatMap(
                    (e) => toEventInput(e.id, e.event) || []
                ),
                editable,
                ...getCalendarColors(color),
            })
        );
    }

    async onOpen() {
        await this.plugin.loadSettings();
        if (!this.plugin.cache) {
            new Notice("Full Calendar event cache not loaded.");
            return;
        }
        if (!this.plugin.cache.initialized) {
            await this.plugin.cache.populate();
        }

        const container = this.containerEl.children[1];
        container.empty();
        let calendarEl = container.createEl("div");

        if (
            this.plugin.settings.calendarSources.filter(
                (s) => s.type !== "FOR_TEST_ONLY"
            ).length === 0
        ) {
            renderOnboarding(this.app, this.plugin, calendarEl);
            return;
        }

        const sources: EventSourceInput[] = this.translateSources();

        if (this.fullCalendarView) {
            this.fullCalendarView.destroy();
            this.fullCalendarView = null;
        }
        this.fullCalendarView = renderCalendar(calendarEl, sources, {
            forceNarrow: this.inSidebar,
            eventClick: async (info) => {
                try {
                    const hasModifierKey =
                        info.jsEvent.getModifierState("Control") ||
                        info.jsEvent.getModifierState("Meta");
                    const shouldOpenFile =
                        hasModifierKey &&
                        this.plugin.settings.ctrlClickToOpenFile;
                    if (shouldOpenFile) {
                        await openFileForEvent(
                            this.plugin.cache,
                            this.app,
                            info.event.id,
                            this.plugin.settings
                        );
                    } else {
                        launchEditModal(this.plugin, info.event.id);
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        console.warn(e);
                        new Notice(e.message);
                    }
                }
            },
            select: async (start, end, allDay, viewType) => {
                if (viewType === "dayGridMonth") {
                    // Month view will set the end day to the next day even on a single-day event.
                    // This is problematic when moving an event created in the month view to the
                    // time grid to give it a time.

                    // The fix is just to subtract 1 from the end date before processing.
                    end.setDate(end.getDate() - 1);
                }
                const partialEvent = dateEndpointsToFrontmatter(
                    start,
                    end,
                    allDay
                );
                try {
                    if (
                        this.plugin.settings.clickToCreateEventFromMonthView ||
                        viewType !== "dayGridMonth"
                    ) {
                        launchCreateModal(this.plugin, partialEvent);
                    } else {
                        this.fullCalendarView?.changeView("timeGridDay");
                        this.fullCalendarView?.gotoDate(start);
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        console.error(e);
                        new Notice(e.message);
                    }
                }
            },
            modifyEvent: async (newEvent, oldEvent) => {
                try {
                    const didModify = await this.plugin.cache.updateEventWithId(
                        oldEvent.id,
                        fromEventApi(newEvent)
                    );
                    return !!didModify;
                } catch (e: any) {
                    console.error(e);
                    new Notice(e.message);
                    return false;
                }
            },

            eventMouseEnter: async (info) => {
                try {
                    const location = this.plugin.cache.getInfoForEditableEvent(
                        info.event.id
                    ).location;
                    if (location) {
                        this.app.workspace.trigger("hover-link", {
                            event: info.jsEvent,
                            source: PLUGIN_SLUG,
                            hoverParent: calendarEl,
                            targetEl: info.jsEvent.target,
                            linktext: location.path,
                            sourcePath: location.path,
                        });
                    }
                } catch (e) {}
            },
            firstDay: this.plugin.settings.firstDay,
            initialView: this.plugin.settings.initialView,
            timeFormat24h: this.plugin.settings.timeFormat24h,
            openContextMenuForEvent: async (e, mouseEvent) => {
                const menu = new Menu();
                if (!this.plugin.cache) {
                    return;
                }
                const event = this.plugin.cache.getEventById(e.id);
                if (!event) {
                    return;
                }

                if (this.plugin.cache.isEventEditable(e.id)) {
                    if (!isTask(event)) {
                        menu.addItem((item) =>
                            item
                                .setTitle("Turn into task")
                                .onClick(async () => {
                                    await this.plugin.cache.processEvent(
                                        e.id,
                                        (e) => toggleTask(e, false)
                                    );
                                })
                        );
                    } else {
                        menu.addItem((item) =>
                            item
                                .setTitle("Remove checkbox")
                                .onClick(async () => {
                                    await this.plugin.cache.processEvent(
                                        e.id,
                                        unmakeTask
                                    );
                                })
                        );
                    }
                    menu.addSeparator();
                    menu.addItem((item) =>
                        item.setTitle("Go to note").onClick(() => {
                            if (!this.plugin.cache) {
                                return;
                            }
                            openFileForEvent(this.plugin.cache, this.app, e.id);
                        })
                    );
                    menu.addItem((item) =>
                        item.setTitle("Delete").onClick(async () => {
                            if (!this.plugin.cache) {
                                return;
                            }
                            await this.plugin.cache.deleteEvent(e.id);
                            new Notice(`Deleted event "${e.title}".`);
                        })
                    );
                } else {
                    menu.addItem((item) => {
                        item.setTitle(
                            "No actions available on remote events"
                        ).setDisabled(true);
                    });
                }

                menu.showAtMouseEvent(mouseEvent);
            },
            toggleTask: async (e, isDone) => {
                const event = this.plugin.cache.getEventById(e.id);
                if (!event) {
                    return false;
                }
                if (event.type !== "single") {
                    return false;
                }

                try {
                    await this.plugin.cache.updateEventWithId(
                        e.id,
                        toggleTask(event, isDone)
                    );
                } catch (e) {
                    if (e instanceof FCError) {
                        new Notice(e.message);
                    }
                    return false;
                }
                return true;
            },
        });
        // @ts-ignore
        window.fc = this.fullCalendarView;

        this.registerDomEvent(this.containerEl, "mouseenter", () => {
            this.plugin.cache.revalidateRemoteCalendars();
        });

        if (this.callback) {
            this.plugin.cache.off("update", this.callback);
            this.callback = null;
        }
        this.callback = this.plugin.cache.on("update", (payload) => {
            if (payload.type === "resync") {
                this.fullCalendarView?.removeAllEventSources();
                const sources = this.translateSources();
                sources.forEach((source) =>
                    this.fullCalendarView?.addEventSource(source)
                );
                return;
            } else if (payload.type === "events") {
                const { toRemove, toAdd } = payload;
                console.debug("updating view from cache...", {
                    toRemove,
                    toAdd,
                });
                toRemove.forEach((id) => {
                    const event = this.fullCalendarView?.getEventById(id);
                    if (event) {
                        console.debug("removing event", event.toPlainObject());
                        event.remove();
                    } else {
                        console.warn(
                            `Event with id=${id} was slated to be removed but does not exist in the calendar.`
                        );
                    }
                });
                toAdd.forEach(({ id, event, calendarId }) => {
                    const eventInput = toEventInput(id, event);
                    console.debug("adding event", {
                        id,
                        event,
                        eventInput,
                        calendarId,
                    });
                    const addedEvent = this.fullCalendarView?.addEvent(
                        eventInput!,
                        calendarId
                    );
                    console.debug("event that was added", addedEvent);
                });
            } else if (payload.type == "calendar") {
                const {
                    calendar: { id, events, editable, color },
                } = payload;
                console.debug("replacing calendar with id", payload.calendar);
                this.fullCalendarView?.getEventSourceById(id)?.remove();
                this.fullCalendarView?.addEventSource({
                    id,
                    events: events.flatMap(
                        ({ id, event }) => toEventInput(id, event) || []
                    ),
                    editable,
                    ...getCalendarColors(color),
                });
            }
        });
    }

    onResize(): void {
        if (this.fullCalendarView) {
            this.fullCalendarView.render();
        }
    }

    async onunload() {
        if (this.fullCalendarView) {
            this.fullCalendarView.destroy();
            this.fullCalendarView = null;
        }
        if (this.callback) {
            this.plugin.cache.off("update", this.callback);
            this.callback = null;
        }
    }
}
