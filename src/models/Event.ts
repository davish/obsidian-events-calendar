import { Calendar, EventInput } from "@fullcalendar/core";
import { MetadataCache, Vault, WorkspaceLeaf } from "obsidian";
import { parseFrontmatter } from "src/fullcalendar_interop";
import { CalendarSource, OFCEvent, FCError } from "src/types";
import { getColors } from "./util";

export function basenameFromEvent(event: OFCEvent): string {
	switch (event.type) {
		case "single":
		case undefined:
			return `${event.date} ${event.title}`;
		case "recurring":
			return `(Every ${event.daysOfWeek.join(",")}) ${event.title})`;
	}
}

export const getPathPrefix = (path: string): string =>
	path.split("/").slice(0, -1).join("/");

export abstract class CalendarEvent {
	static ID_SEPARATOR = "::";
	cache: MetadataCache;
	vault: Vault;

	protected _data: OFCEvent;

	constructor(cache: MetadataCache, vault: Vault, data: OFCEvent) {
		this.cache = cache;
		this.vault = vault;
		this._data = data;
	}

	get isTask(): boolean {
		return (
			this._data.type === "single" &&
			this._data.completed !== undefined &&
			this._data.completed !== null
		);
	}

	abstract get identifier(): string;
	abstract get PREFIX(): string;
	get idForCalendar(): string {
		return this.PREFIX + CalendarEvent.ID_SEPARATOR + this.identifier;
	}

	toCalendarEvent(): EventInput | null {
		return parseFrontmatter(this.idForCalendar, this.data);
	}

	get data(): OFCEvent {
		return { ...this._data };
	}

	addTo(calendar: Calendar, source: CalendarSource) {
		let event = this.toCalendarEvent();
		if (!event) {
			console.error("Malformed event, will not add to calendar.", this);
			return;
		}
		calendar.addEvent({
			...event,
			...getColors(source.color),
		});
	}
}

export abstract class EditableEvent extends CalendarEvent {
	constructor(cache: MetadataCache, vault: Vault, data: OFCEvent) {
		super(cache, vault, data);
	}

	get editable(): boolean {
		return true;
	}

	async setIsTask(isTask: boolean): Promise<void> {
		if (this._data.type !== "single") {
			return;
		}
		if (
			isTask &&
			(this._data.completed === undefined ||
				this._data.completed === null)
		) {
			await this.setData({ ...this._data, completed: false });
		} else if (!isTask) {
			await this.setData({ ...this._data, completed: null });
		}
	}

	abstract setData(data: OFCEvent): Promise<void>;
	abstract delete(): Promise<void>;
}

export abstract class LocalEvent extends EditableEvent {
	abstract openIn(leaf: WorkspaceLeaf): Promise<void>;
	abstract get path(): string;
}
