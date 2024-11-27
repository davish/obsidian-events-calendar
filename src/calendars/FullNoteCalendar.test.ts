import { join } from "path";
import { TFile } from "obsidian";

import { ObsidianInterface } from "src/ObsidianAdapter";
import { MockApp, MockAppBuilder } from "../../test_helpers/AppBuilder";
import { FileBuilder } from "../../test_helpers/FileBuilder";
import { OFCEvent } from "src/types";
import FullNoteCalendar from "./FullNoteCalendar";
import { parseEvent } from "../types/schema";

async function assertFailed(func: () => Promise<any>, message: RegExp) {
    try {
        await func();
    } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toMatch(message);
        return;
    }
    expect(false).toBeTruthy();
}

const makeApp = (app: MockApp): ObsidianInterface => ({
    getAbstractFileByPath: (path) => app.vault.getAbstractFileByPath(path),
    getFileByPath(path: string): TFile | null {
        const f = app.vault.getAbstractFileByPath(path);
        if (!f) {
            return null;
        }
        if (!(f instanceof TFile)) {
            return null;
        }
        return f;
    },
    getMetadata: (file) => app.metadataCache.getFileCache(file),
    waitForMetadata: (file) =>
        new Promise((resolve) =>
            resolve(app.metadataCache.getFileCache(file)!)
        ),
    read: (file) => app.vault.read(file),
    create: jest.fn(),
    rewrite: jest.fn(),
    rename: jest.fn(),
    delete: jest.fn(),
    process: jest.fn(),
});

const dirName = "events";
const color = "#BADA55";
const timeNotInNoteTitle = false;
const timeInNoteTitle = true;

describe("Note Calendar Tests", () => {
    it.each([
        [
            "One event",
            [
                {
                    title: "2022-01-01 Test Event.md",
                    event: {
                        title: "Test Event",
                        allDay: true,
                        date: "2022-01-01",
                    } as OFCEvent,
                },
            ],
        ],
        [
            "Two events",
            [
                {
                    title: "2022-01-01 Test Event.md",
                    event: {
                        title: "Test Event",
                        allDay: true,
                        date: "2022-01-01",
                    } as OFCEvent,
                },
                {
                    title: "2022-01-02 Another Test Event.md",
                    event: {
                        title: "Another Test Event",
                        allDay: true,
                        date: "2022-01-02",
                    } as OFCEvent,
                },
            ],
        ],
        [
            "Two events on the same day",
            [
                {
                    title: "2022-01-01 Test Event.md",
                    event: {
                        title: "Test Event",
                        allDay: true,
                        date: "2022-01-01",
                    } as OFCEvent,
                },
                {
                    title: "2022-01-01 Another Test Event.md",
                    event: {
                        title: "Another Test Event",
                        date: "2022-01-01",
                        startTime: "11:00",
                        endTime: "12:00",
                    } as OFCEvent,
                },
            ],
        ],
    ])(
        "%p",
        async (_, inputs: { title: string; event: Partial<OFCEvent> }[]) => {
            const obsidian = makeApp(
                MockAppBuilder.make()
                    .folder(
                        inputs.reduce(
                            (builder, { title, event }) =>
                                builder.file(
                                    title,
                                    new FileBuilder().frontmatter(event)
                                ),
                            new MockAppBuilder(dirName)
                        )
                    )
                )
                .done()
        );
        const calendar = new FullNoteCalendar(
            obsidian,
            color,
            dirName,
            timeNotInNoteTitle
        );
        const res = await calendar.getEvents();
        expect(res.length).toBe(inputs.length);
        const events = res.map((e) => e[0]);
        const paths = res.map((e) => e[1].file.path);

            expect(
                res.every((elt) => elt[1].lineNumber === undefined)
            ).toBeTruthy();

            for (const { event, title } of inputs.map((i) => ({
                title: i.title,
                event: {
                    endDate: null,
                    allDay: false,
                    type: "single",
                    ...i.event,
                },
            }))) {
                expect(events).toContainEqual(event);
                expect(paths).toContainEqual(`${dirName}/${title}`);
            }

            for (const [
                event,
                {
                    file: { path },
                },
            ] of res) {
                const file = obsidian.getFileByPath(path)!;
                const eventsFromFile = await calendar.getEventsInFile(file);
                expect(eventsFromFile.length).toBe(1);
                expect(eventsFromFile[0][0]).toEqual(event);
            }
        }
    );
    it.todo("Recursive folder settings");

    it("creates an event", async () => {
        const obsidian = makeApp(MockAppBuilder.make().done());
        const calendar = new FullNoteCalendar(
            obsidian,
            color,
            dirName,
            timeNotInNoteTitle
        );
        const event: OFCEvent = {
            title: "Test Event",
            date: "2022-01-01",
            endDate: null,
            allDay: false,
            startTime: "11:00",
            endTime: "12:30",
        };

        (obsidian.create as jest.Mock).mockReturnValue({
            path: join(dirName, "2022-01-01 Test Event.md"),
        });
        const { lineNumber } = await calendar.createEvent(parseEvent(event));
        expect(lineNumber).toBeUndefined();
        expect(obsidian.create).toHaveBeenCalledTimes(1);
        const returns = (obsidian.create as jest.Mock).mock.calls[0];
        expect(returns).toMatchInlineSnapshot(`
            [
              "events/2022-01-01 Test Event.md",
              "---
            title: Test Event
            allDay: false
            startTime: 11:00
            endTime: 12:30
            type: single
            date: 2022-01-01
            endDate: null
            ---
            ",
            ]
        `);
    });

    it("creates an event with time in note title", async () => {
        const obsidian = makeApp(MockAppBuilder.make().done());
        const calendar = new FullNoteCalendar(
            obsidian,
            color,
            dirName,
            timeInNoteTitle
        );
        const event: OFCEvent = {
            title: "Test Event",
            date: "2022-01-01",
            startTime: "11:00",
            endTime: "12:30",
        };

        (obsidian.create as jest.Mock).mockReturnValue({
            path: join(dirName, "2022-01-01 1100 Test Event.md"),
        });
        const { lineNumber } = await calendar.createEvent(event);
        expect(lineNumber).toBeUndefined();
        expect(obsidian.create).toHaveBeenCalledTimes(1);
        const returns = (obsidian.create as jest.Mock).mock.calls[0];
        expect(returns).toMatchInlineSnapshot(`
		[
		  "events/2022-01-01 1100 Test Event.md",
		  "---
		title: Test Event
		date: 2022-01-01
		startTime: 11:00
		endTime: 12:30
		---
		",
		]
	`);
    });

    it("cannot overwrite event", async () => {
        const event = {
            title: "Test Event",
            allDay: true,
            date: "2022-01-01",
            endDate: null,
        };
        const obsidian = makeApp(
            MockAppBuilder.make()
                .folder(
                    new MockAppBuilder("events").file(
                        "2022-01-01 Test Event.md",
                        new FileBuilder().frontmatter(event)
                    )
                )
                .done()
        );
        const calendar = new FullNoteCalendar(
            obsidian,
            color,
            dirName,
            timeNotInNoteTitle
        );
        await assertFailed(
            () => calendar.createEvent(parseEvent(event)),
            /already exists/
        );
    });

    it("modify an existing event and keeping the same day and title", async () => {
        const event = parseEvent({
            title: "Test Event",
            allDay: false,
            date: "2022-01-01",
            endDate: null,
            startTime: "11:00",
            endTime: "12:30",
        });
        const filename = "2022-01-01 Test Event.md";
        const obsidian = makeApp(
            MockAppBuilder.make()
                .folder(
                    new MockAppBuilder("events").file(
                        filename,
                        new FileBuilder().frontmatter(event)
                    )
                )
                .done()
        );
        const calendar = new FullNoteCalendar(
            obsidian,
            color,
            dirName,
            timeNotInNoteTitle
        );

        const firstFile = obsidian.getAbstractFileByPath(
            join("events", filename)
        ) as TFile;

        const contents = await obsidian.read(firstFile);

        const mockFn = jest.fn();
        await calendar.modifyEvent(
            { path: join("events", filename), lineNumber: undefined },
            // @ts-ignore
            { ...event, endTime: "13:30" },
            mockFn
        );
        // TODO: make the third param a mock that we can inspect
        const newLoc = mockFn.mock.calls[0][0];
        expect(newLoc.file.path).toBe(join("events", filename));
        expect(newLoc.lineNumber).toBeUndefined();

        expect(obsidian.rewrite).toHaveReturnedTimes(1);
        const [file, rewriteCallback] = (obsidian.rewrite as jest.Mock).mock
            .calls[0];
        expect(file.path).toBe(join("events", filename));

        expect(rewriteCallback(contents)).toMatchInlineSnapshot(`
            "---
            title: Test Event
            allDay: false
            startTime: 11:00
            endTime: 13:30
            type: single
            date: 2022-01-01
            endDate: null
            ---
            "
        `);
    });
    // it("modify an existing event with a new date", async () => {
    // 	const event: OFCEvent = {
    // 		title: "Test Event",
    // 		date: "2022-01-01",
    // 		startTime: "11:00",
    // 		endTime: "12:30",
    // 	};
    // 	const filename = "2022-01-01 Test Event.md";
    // 	const obsidian = makeApp(
    // 		MockAppBuilder.make()
    // 			.folder(
    // 				new MockAppBuilder("events").file(
    // 					filename,
    // 					new FileBuilder().frontmatter(event)
    // 				)
    // 			)
    // 			.done()
    // 	);
    // 	const calendar = new NoteCalendar(
    // 		obsidian,
    // 		color,
    // 		dirName,
    // 		false,
    // 		true
    // 	);

    // 	const firstFile = obsidian.getAbstractFileByPath(
    // 		join("events", filename)
    // 	) as TFile;

    // 	const contents = await obsidian.read(firstFile);

    // 	const newLoc = await calendar.modifyEvent(
    // 		{ path: join("events", filename), lineNumber: undefined },
    // 		{ ...event, date: "2022-01-02" }
    // 	);

    // 	const newFilename = "2022-01-02 Test Event.md";
    // 	expect(newLoc.file.path).toBe(join("events", newFilename));
    // 	expect(newLoc.lineNumber).toBeUndefined();

    // 	expect(obsidian.rewrite).toHaveReturnedTimes(1);
    // 	const [file, rewriteCallback] = (obsidian.rewrite as jest.Mock).mock
    // 		.calls[0];
    // 	expect(file.path).toBe(join("events", filename));
    // });
});
