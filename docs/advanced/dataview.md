# [Dataview](https://github.com/blacksmithgu/obsidian-dataview) integration

Create calendars inline with your notes from [dataviewjs](https://blacksmithgu.github.io/obsidian-dataview/api/intro/) queries. Here's a basic example with a hardcoded event:

````
```dataviewjs
this.container.style.minHeight = "500px";
const { renderCalendar } = app.plugins.plugins["obsidian-full-calendar"];
renderCalendar(this.container, [[{start: new Date(), id: "id", title: "Now and for an hour"}]])
  .then(calendar => calendar.render());
```
````

`renderCalendar()` includes all events from all event sources set in the global settings when no event sources are passed in.

````
```dataviewjs
this.container.style.minHeight = "500px";
const { renderCalendar } = app.plugins.plugins["obsidian-full-calendar"];
renderCalendar(this.container).then(calendar => calendar.render());
```
````

`renderCalendar()` exposes the FullCalendar API directly, so check out [the event parsing documentation](https://fullcalendar.io/docs/event-parsing) to see everything you can do here!
