import { toast } from "sonner";
import type { TLShapeId } from "tldraw";
import type { useWorkspaceEditors } from "@/components/WorkspaceEditorsContext";
import type { PanelAnchor } from "@/lib/comment-temp";

type Editors = ReturnType<typeof useWorkspaceEditors>;

// The block where the text cursor is, as something a comment can be pinned to.
export function blockAnchor(docEditor: NonNullable<Editors["docEditor"]>): PanelAnchor | null {
    try {
        const { block } = docEditor.getTextCursorPosition()
        const text = Array.isArray(block.content)
            ? block.content.map((part) => ("text" in part ? part.text : "")).join("") : ""
        const preview = text.trim().slice(0, 40) || block.type
        return { type: "BLOCK", id: block.id, label: `Block: ${preview}` }
    } catch {
        toast.info("Click inside the document first.")
        return null
    }
}

// The first selected shape on the canvas.
export function shapeAnchor(canvasEditor: NonNullable<Editors["canvasEditor"]>): PanelAnchor | null {
    const [id] = canvasEditor.getSelectedShapeIds()
    if (!id) {
        toast.info("Select a shape on the canvas first.")
        return null
    }
    return { type: "SHAPE", id, label: `Shape: ${canvasEditor.getShape(id)?.type ?? "shape"}` }
}

// Scrolls to the pinned block, or selects and zooms to the pinned shape.
export function showAnchor(type: "BLOCK" | "SHAPE", id: string, editors: Pick<Editors, "docEditor" | "canvasEditor">) {
    const { docEditor, canvasEditor } = editors
    if (type === "SHAPE") {
        const shapeId = id as TLShapeId
        if (!canvasEditor) return toast.info("Open the Canvas or Both view to see this shape.")
        if (!canvasEditor.getShape(shapeId)) return toast.info("That shape no longer exists.")
        canvasEditor.setSelectedShapes([shapeId])
        canvasEditor.zoomToSelection({ animation: { duration: 300 } })
        return
    }
    const element = document.querySelector(`[data-id="${CSS.escape(id)}"]`)
    if (element) element.scrollIntoView({ block: "center", behavior: "smooth" })
    else toast.info(docEditor ? "That block no longer exists." : "Open the Document or Both view to see this block.")
}