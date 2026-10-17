// One adversarial import exercises duplicate identities, bounded recurrence and excess properties. Correctness and the
// optional timing measurement use the same input so routing the clock outside CI does not reduce parser protection.
export const parseAdversarialCalendar = page => page.evaluate(() => {
  const event = (i, extra) => "BEGIN:VEVENT\r\nUID:same\r\nDTSTART:20261001T080000Z\r\nSUMMARY:E" + i + "\r\n" + extra + "END:VEVENT\r\n";
  let text = "BEGIN:VCALENDAR\r\n";
  for (let i = 0; i < 3000; i++) text += event(i, "");
  text += event("count", "RRULE:FREQ=DAILY;COUNT=5000\r\n") + event("never", "RRULE:FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30\r\n");
  text += "BEGIN:VEVENT\r\nDTSTART:20261001T080000Z\r\n" + "CATEGORIES:\r\n".repeat(20000) + "END:VEVENT\r\nEND:VCALENDAR";
  const started = performance.now(), parsed = window.kit.calIcsParse(text);
  return { ms: performance.now() - started, count: parsed.events.find(item => item.title === "Ecount"),
    never: parsed.events.find(item => item.title === "Enever"), notes: parsed.notes.length };
});
