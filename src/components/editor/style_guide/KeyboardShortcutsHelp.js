import React from "react";
import { OverlayTrigger, Popover } from "react-bootstrap";

export default function KeyboardShortcutsHelp() {
    const popoverTop = (
        <Popover
            id="popover-positioned-top"
            title="Popover top"
            className="p-2"
        >
            <table className="text-muted" style={{ fontSize: 14 }}>
                <tbody>
                    <tr>
                        <td className="pb-2">
                            <kbd>↑</kbd>/<kbd>↓</kbd>
                        </td>
                        <td className="pb-2">Move to previous/next change</td>
                    </tr>
                    <tr>
                        <td className="pe-2 pb-2">
                            <kbd>ENTER</kbd>
                        </td>
                        <td className="pb-2">Mark change as read</td>
                    </tr>
                    <tr>
                        <td className="pe-2 pb-2">
                            <kbd>SHIFT+ENTER</kbd>
                        </td>
                        <td className="pb-2">Mark change as unread</td>
                    </tr>
                    <tr>
                        <td className="pb-2">
                            <kbd>SPACE</kbd>
                        </td>
                        <td className="pb-2">Apply/unapply change</td>
                    </tr>
                </tbody>
            </table>
        </Popover>
    );

    return (
        <OverlayTrigger
            trigger="click"
            placement="top"
            overlay={popoverTop}
            rootClose
        >
            <button className="lb-outline-secondary lb-sm">
                View keyboard shortcuts
            </button>
        </OverlayTrigger>
    );
}
