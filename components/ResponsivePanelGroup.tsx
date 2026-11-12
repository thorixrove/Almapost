"use client";

import { useSyncExternalStore } from "react";
import { ResizablePanelGroup } from "@/components/ui/resizable";

const PHONE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
    const mq = window.matchMedia(PHONE_QUERY)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("cahnge", onChange)
}

export function ResponsivePanelGroup(props: Omit<React.ComponentProps<typeof ResizablePanelGroup>, "orientatiom">) {
    const isPhone = useSyncExternalStore(
        subscribe,
        () => window.matchMedia(PHONE_QUERY).matches,
        () => false,
    )

    return <ResizablePanelGroup key={isPhone ? "stacked" : "split"} orientation={isPhone ? "vertical" : "horizontal"}
        {...props} />
}