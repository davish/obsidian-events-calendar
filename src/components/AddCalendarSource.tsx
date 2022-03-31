import { DropdownComponent } from "obsidian";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { CalendarSource } from "../types";

type ChangeListener = <T extends Partial<CalendarSource>>(
	fromString: (val: string) => T
) => React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
type SourceWith<T extends Partial<CalendarSource>, K> = T extends K ? T : never;

interface DirectorySelectProps<T extends Partial<CalendarSource>> {
	source: T;
	changeListener: ChangeListener;
	directories: string[];
}

function DirectorySelect<T extends Partial<CalendarSource>>({
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

interface BasicProps<T extends Partial<CalendarSource>> {
	source: T;
	changeListener: ChangeListener;
}

function ColorPicker<T extends Partial<CalendarSource>>({
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

function UrlInput<T extends Partial<CalendarSource>>({
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

function UsernameInput<T extends Partial<CalendarSource>>({
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

function PasswordInput<T extends Partial<CalendarSource>>({
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
	source: Partial<CalendarSource>;
	directories: string[];
	submit: (source: CalendarSource) => Promise<void>;
}

export const AddCalendarSource = ({
	source,
	directories,
	submit,
}: AddCalendarProps) => {
	const [setting, setSettingState] =
		useState<Partial<CalendarSource>>(source);

	function makeChangeListener<T extends Partial<CalendarSource>>(
		fromString: (val: string) => T
	): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> {
		return (e) => setSettingState(fromString(e.target.value));
	}

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		await submit(setting as CalendarSource);
	};

	const isCalDAV = source.type === "caldav" || source.type === "icloud";
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
				{source.type === "local" ? (
					<DirectorySelect
						source={setting}
						changeListener={makeChangeListener}
						directories={directories}
					/>
				) : (
					<UrlInput
						source={setting}
						changeListener={makeChangeListener}
					/>
				)}
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
						<button type="submit">
							{isCalDAV ? "Import Calendars" : "Add Calendar"}
						</button>
					</div>
				</div>
			</form>
		</div>
	);
};
