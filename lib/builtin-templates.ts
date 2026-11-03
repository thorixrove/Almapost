import type { PartialBlock } from "@blocknote/core";

// Template bawaan: hanya dokumen (canvas dimulai kosong). Isinya blok BlockNote biasa, jadi bisa
// diedit bebas begitu workspace dibuat. Template buatan pengguna disimpan di database, bukan di sini.

export type BuiltinTemplate = { id: string; name: string; description: string; doc: PartialBlock[] }

const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }]
const heading = (level: 1 | 2, value: string): PartialBlock => ({ type: "heading", props: { level }, content: text(value) })
const paragraph = (value = ""): PartialBlock => ({ type: "paragraph", content: value ? text(value) : [] })
const bullet = (value = ""): PartialBlock => ({ type: "bulletListItem", content: value ? text(value) : [] })
const numbered = (value = ""): PartialBlock => ({ type: "numberedListItem", content: value ? text(value) : [] })
const task = (value = ""): PartialBlock => ({ type: "checkListItem", props: { checked: false }, content: value ? text(value) : [] })

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
    {
        id: "builtin:meeting-notes",
        name: "Meeting notes",
        description: "Agenda, notes, and action items.",
        doc: [
            heading(1, "Meeting notes"),
            paragraph("Date: · Attendees:"),
            heading(2, "Agenda"),
            numbered("Topic one"),
            numbered("Topic two"),
            heading(2, "Notes"),
            paragraph(),
            heading(2, "Action items"),
            task("Who does what, by when"),
            task(),
        ],
    },
    {
        id: "builtin:project-plan",
        name: "Project plan",
        description: "Goal, scope, milestones, and risks.",
        doc: [
            heading(1, "Project plan"),
            heading(2, "Goal"),
            paragraph("What does success look like?"),
            heading(2, "Scope"),
            bullet("In scope"),
            bullet("Out of scope"),
            heading(2, "Milestones"),
            task("Milestone one"),
            task("Milestone two"),
            task("Launch"),
            heading(2, "Risks"),
            bullet("What could get in the way?"),
        ],
    },
    {
        id: "builtin:weekly-review",
        name: "Weekly review",
        description: "Wins, blockers, and next week's focus.",
        doc: [
            heading(1, "Weekly review"),
            heading(2, "Wins"),
            bullet(),
            heading(2, "Blockers"),
            bullet(),
            heading(2, "Next week"),
            task(),
            task(),
        ],
    },
]

export function findBuiltinTemplate(id: string) {
    return BUILTIN_TEMPLATES.find((template) => template.id === id)
}